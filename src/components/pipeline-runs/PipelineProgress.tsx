'use client';

/**
 * PipelineProgress — live SSE view for a single pipeline run.
 *
 * PRD-035 Week 5 Fase C · P9 absorção Agent-SmithV6 (adaptada):
 * substitui o polling 3s do original por EventSource nativo consumindo
 * /api/pipeline-runs/[id]/stream. Agrupa os 22 steps do /fix em 6 fases
 * cosméticas (understanding · investigating · planning · awaiting
 * approval · executing · completed) usando `Math.floor(step_index)`.
 *
 * Props:
 *   runId            — pipeline run uuid (required)
 *   initialSnapshot  — optional SSR/hydration snapshot
 *   onTerminal       — fired once when the run reaches ok/failed/cancelled
 *   className        — wrapper class override
 *
 * SSE events handled: snapshot · run · step · end.
 * EventSource auto-reconnects; no manual retry loop.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Brain,
  Lightbulb,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RunHeader } from './RunHeader';
import { ProgressCard } from '@/components/ui/ProgressCard';
import type { ProgressCardStep } from '@/components/ui/ProgressCard';
import type { PipelineRun, PipelineStep } from '@/hooks/usePipelineStream';

export interface PipelineProgressProps {
  runId: string;
  initialSnapshot?: { run: PipelineRun; steps: PipelineStep[] };
  onTerminal?: (status: 'ok' | 'failed' | 'cancelled') => void;
  className?: string;
}

type PhaseKey =
  | 'understanding'
  | 'investigating'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'completed';

interface PhaseDef {
  key: PhaseKey;
  label: string;
  range: (idx: number) => boolean;
  icon: (opts: { runStatus: string }) => React.ReactNode;
  accent: string; // text color class for label
}

const PHASE_DEFS: PhaseDef[] = [
  {
    key: 'understanding',
    label: 'Understanding',
    range: idx => idx >= 1 && idx <= 5,
    icon: () => (
      <Search className="h-4 w-4 text-[var(--info)] animate-pulse" aria-hidden />
    ),
    accent: 'text-[var(--info)]',
  },
  {
    key: 'investigating',
    label: 'Investigating',
    range: idx => idx === 5, // only decimal-index steps (5.5) land here via isHalfIndex
    icon: () => (
      <Brain className="h-4 w-4 text-[var(--accent,#a78bfa)] animate-pulse" aria-hidden />
    ),
    accent: 'text-[var(--accent,#a78bfa)]',
  },
  {
    key: 'planning',
    label: 'Planning',
    range: idx => idx >= 6 && idx <= 8,
    icon: () => (
      <Lightbulb className="h-4 w-4 text-[var(--brand)] animate-pulse" aria-hidden />
    ),
    accent: 'text-[var(--brand)]',
  },
  {
    key: 'awaiting_approval',
    label: 'Awaiting Approval',
    range: idx => idx === 8, // decimal 8.5 lands here via isHalfIndex
    icon: () => <Clock className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />,
    accent: 'text-[var(--text-muted)]',
  },
  {
    key: 'executing',
    label: 'Executing',
    range: idx => idx >= 9 && idx <= 21,
    icon: () => (
      <Loader2 className="h-4 w-4 text-[var(--info)] animate-spin" aria-hidden />
    ),
    accent: 'text-[var(--info)]',
  },
  {
    key: 'completed',
    label: 'Completed',
    range: idx => idx >= 22,
    icon: ({ runStatus }) =>
      runStatus === 'failed' ? (
        <AlertCircle className="h-4 w-4 text-[var(--destructive)]" aria-hidden />
      ) : (
        <CheckCircle2
          className="h-4 w-4 text-[var(--success,#10b981)]"
          aria-hidden
        />
      ),
    accent: 'text-[var(--success,#10b981)]',
  },
];

/** Classify a step_index into one of the 6 UI phases. Decimals route to the
 *  half-phase when present: 5.5 → investigating, 8.5 → awaiting_approval. */
function phaseOf(stepIndex: number): PhaseKey {
  const isHalf = !Number.isInteger(stepIndex);
  const floor = Math.floor(stepIndex);
  if (isHalf && floor === 5) return 'investigating';
  if (isHalf && floor === 8) return 'awaiting_approval';
  if (floor >= 1 && floor <= 5) return 'understanding';
  if (floor >= 6 && floor <= 8) return 'planning';
  if (floor >= 9 && floor <= 21) return 'executing';
  return 'completed';
}

/** Map a MC domain PipelineStep to the generic ProgressCardStep primitive. */
function toProgressCardStep(s: PipelineStep): ProgressCardStep {
  // Derive a human-readable label: prefer output_summary, then agent name,
  // then fall back to step index string.
  const label =
    s.output_summary?.trim() ||
    s.agent?.trim() ||
    `Step ${s.step_index}`;

  // Normalise status: MC uses 'ok'/'running'/'queued'/'failed'; map to primitive's union.
  let status: ProgressCardStep['status'];
  switch (s.status) {
    case 'ok':
    case 'success':
      status = 'success';
      break;
    case 'running':
      status = 'running';
      break;
    case 'failed':
    case 'error':
      status = 'error';
      break;
    default: // 'queued', 'pending', unknown
      status = 'pending';
  }

  return {
    id: s.step_id,
    label,
    status,
    startedAt: s.started_at ?? undefined,
    finishedAt: s.finished_at ?? undefined,
  };
}

interface StreamState {
  run: PipelineRun | null;
  steps: PipelineStep[];
  connected: boolean;
  ended: boolean;
  error: string | null;
}

export function PipelineProgress({
  runId,
  initialSnapshot,
  onTerminal,
  className,
}: PipelineProgressProps) {
  const [state, setState] = useState<StreamState>({
    run: initialSnapshot?.run ?? null,
    steps: initialSnapshot?.steps ?? [],
    connected: false,
    ended: false,
    error: null,
  });
  const terminalFiredRef = useRef(false);

  // Reset terminal guard when runId changes (component reused)
  useEffect(() => {
    terminalFiredRef.current = false;
  }, [runId]);

  // Fire onTerminal once when run reaches terminal state (via `end` event or
  // snapshot of an already-finished run).
  useEffect(() => {
    if (terminalFiredRef.current) return;
    const s = state.run?.status;
    if (s === 'ok' || s === 'failed' || s === 'cancelled') {
      terminalFiredRef.current = true;
      onTerminal?.(s);
    }
  }, [state.run?.status, onTerminal]);

  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`/api/pipeline-runs/${runId}/stream`);

    const onOpen = () => {
      setState(s => ({ ...s, connected: true, error: null }));
    };

    const onSnapshot = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          run: PipelineRun;
          steps: PipelineStep[];
        };
        setState(s => ({
          ...s,
          run: data.run,
          steps: [...data.steps].sort((a, b) => a.step_index - b.step_index),
          error: null,
        }));
      } catch {
        /* ignore malformed */
      }
    };

    const onRun = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { run: PipelineRun };
        setState(s => ({ ...s, run: { ...(s.run ?? {}), ...data.run } as PipelineRun }));
      } catch {
        /* ignore */
      }
    };

    const onStep = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { step: PipelineStep };
        setState(s => {
          const idx = s.steps.findIndex(x => x.step_id === data.step.step_id);
          const next = idx >= 0 ? [...s.steps] : [...s.steps, data.step];
          if (idx >= 0) next[idx] = data.step;
          next.sort((a, b) => a.step_index - b.step_index);
          return { ...s, steps: next };
        });
      } catch {
        /* ignore */
      }
    };

    const onEnd = (ev: MessageEvent) => {
      let status: 'ok' | 'failed' | 'cancelled' | undefined;
      try {
        const data = JSON.parse(ev.data) as { status?: string };
        if (
          data.status === 'ok' ||
          data.status === 'failed' ||
          data.status === 'cancelled'
        ) {
          status = data.status;
        }
      } catch {
        /* ignore */
      }
      setState(s => ({ ...s, ended: true, connected: false }));
      if (status && !terminalFiredRef.current) {
        terminalFiredRef.current = true;
        onTerminal?.(status);
      }
      es.close();
    };

    const onError = () => {
      // EventSource auto-reconnects while readyState !== CLOSED.
      setState(s => ({ ...s, connected: false }));
    };

    es.addEventListener('open', onOpen);
    es.addEventListener('snapshot', onSnapshot as EventListener);
    es.addEventListener('run', onRun as EventListener);
    es.addEventListener('step', onStep as EventListener);
    es.addEventListener('end', onEnd as EventListener);
    es.addEventListener('error', onError);

    return () => {
      es.removeEventListener('open', onOpen);
      es.removeEventListener('snapshot', onSnapshot as EventListener);
      es.removeEventListener('run', onRun as EventListener);
      es.removeEventListener('step', onStep as EventListener);
      es.removeEventListener('end', onEnd as EventListener);
      es.removeEventListener('error', onError);
      es.close();
    };
    // onTerminal intentionally omitted to avoid re-subscribing on parent
    // re-renders; the ref-guard ensures single-fire semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const { run, steps, connected, ended, error } = state;

  // Group steps by phase while preserving step_index ordering.
  const grouped = useMemo(() => {
    const map = new Map<PhaseKey, PipelineStep[]>();
    for (const s of steps) {
      const k = phaseOf(s.step_index);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return map;
  }, [steps]);

  if (!run) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-20',
          className
        )}
        aria-live="polite"
      >
        <div className="w-6 h-6 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      <RunHeader run={run} steps={steps} />

      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Steps Timeline
          </h2>
          <ConnectionPill connected={connected} ended={ended} error={error} />
        </div>

        {steps.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">
            No steps registered for this run yet.
          </div>
        ) : (
          <div className="space-y-4">
            {PHASE_DEFS.map(def => {
              const phaseSteps = grouped.get(def.key);
              if (!phaseSteps || phaseSteps.length === 0) return null;
              return (
                <section key={def.key} aria-label={def.label}>
                  <header className="flex items-center gap-2 px-1 mb-2">
                    {def.icon({ runStatus: run.status })}
                    <h3
                      className={cn(
                        'text-[11px] font-bold uppercase tracking-widest',
                        def.accent
                      )}
                    >
                      {def.label}
                    </h3>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      {phaseSteps.length}
                    </span>
                  </header>
                  <ProgressCard
                    steps={phaseSteps.map(toProgressCardStep)}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionPill({
  connected,
  ended,
  error,
}: {
  connected: boolean;
  ended: boolean;
  error: string | null;
}) {
  if (ended) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono">
        stream ended
      </span>
    );
  }
  if (error) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-[var(--destructive)] font-mono">
        {error}
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--info)] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--info)] animate-pulse" />
        live
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono">
      connecting…
    </span>
  );
}
