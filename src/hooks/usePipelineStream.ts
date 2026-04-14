'use client';

import { useEffect, useState } from 'react';

export interface PipelineRun {
  id: string;
  run_type: string;
  status: string;
  title: string | null;
  sprint_number: number | null;
  prd_id: string | null;
  epic_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: string | number | null;
  triggered_by: string | null;
  error_message: string | null;
  last_heartbeat_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PipelineStep {
  id: string;
  run_id: string;
  step_index: number;
  step_id: string;
  agent: string | null;
  status: string;
  parallel_group: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  output_summary: string | null;
  error_message: string | null;
}

export interface PipelineStreamState {
  run: PipelineRun | null;
  steps: PipelineStep[];
  connected: boolean;
  ended: boolean;
  error: string | null;
}

/**
 * Subscribes to /api/pipeline-runs/[id]/stream via SSE.
 * Auto-reconnects on transient failure. Stops on terminal 'end' event.
 */
export function usePipelineStream(runId: string | null): PipelineStreamState {
  const [state, setState] = useState<PipelineStreamState>({
    run: null,
    steps: [],
    connected: false,
    ended: false,
    error: null,
  });

  useEffect(() => {
    if (!runId) return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource(`/api/pipeline-runs/${runId}/stream`);

      es.addEventListener('open', () => {
        setState(s => ({ ...s, connected: true, error: null }));
      });

      es.addEventListener('snapshot', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { run: PipelineRun; steps: PipelineStep[] };
          setState(s => ({ ...s, run: data.run, steps: data.steps, error: null }));
        } catch {
          /* ignore malformed */
        }
      });

      es.addEventListener('run', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { run: PipelineRun };
          setState(s => ({ ...s, run: data.run }));
        } catch {
          /* ignore */
        }
      });

      es.addEventListener('step', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { step: PipelineStep };
          setState(s => {
            const idx = s.steps.findIndex(x => x.step_id === data.step.step_id);
            const next = [...s.steps];
            if (idx >= 0) next[idx] = data.step;
            else next.push(data.step);
            next.sort((a, b) => a.step_index - b.step_index);
            return { ...s, steps: next };
          });
        } catch {
          /* ignore */
        }
      });

      es.addEventListener('end', () => {
        setState(s => ({ ...s, ended: true }));
        es?.close();
        es = null;
      });

      es.addEventListener('error', () => {
        setState(s => ({ ...s, connected: false, error: 'Connection lost' }));
        es?.close();
        es = null;
        if (cancelled) return;
        // Retry after 3s if not explicitly ended
        retryTimer = setTimeout(() => {
          if (!cancelled) connect();
        }, 3000);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [runId]);

  return state;
}
