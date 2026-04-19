'use client';

import { useEffect, useState } from 'react';
import { Clock, DollarSign, Zap, User } from 'lucide-react';
import { RunStatusBadge } from './RunStatusBadge';
import type { PipelineRun, PipelineStep } from '@/hooks/usePipelineStream';

interface RunHeaderProps {
  run: PipelineRun;
  steps: PipelineStep[];
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${String(rs).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${String(rm).padStart(2, '0')}m`;
}

function formatTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function RunHeader({ run, steps }: RunHeaderProps) {
  const isRunning = run.status === 'running';

  // Tick every second for elapsed timer when running
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const startedMs = new Date(run.started_at).getTime();
  const elapsedMs = isRunning
    ? now - startedMs
    : run.duration_ms ?? 0;

  const completedSteps = steps.filter(s => s.status === 'ok').length;
  const totalSteps = steps.length;
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const cost =
    typeof run.estimated_cost_usd === 'number'
      ? run.estimated_cost_usd
      : parseFloat(String(run.estimated_cost_usd ?? '0')) || 0;

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <RunStatusBadge status={run.status} />
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {run.run_type}
            </span>
            {run.sprint_number && (
              <span className="text-xs text-[var(--text-muted)]">
                · Sprint {run.sprint_number}
              </span>
            )}
            {run.prd_id && (
              <span className="text-xs text-[var(--text-muted)]">
                · {run.prd_id}
                {run.epic_id && ` Épico ${run.epic_id}`}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1.5 truncate">
            {run.title ?? run.id}
          </h1>
          {run.triggered_by && (
            <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
              <User className="h-3 w-3" />
              {run.triggered_by}
              <span className="text-[var(--text-muted)]/60">·</span>
              <span>{new Date(run.started_at).toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--info-muted)] flex items-center justify-center">
            <Clock className="h-4 w-4 text-[var(--info)]" />
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Elapsed</p>
            <p className="text-sm font-bold text-[var(--text-primary)] font-mono">
              {formatDuration(elapsedMs)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand)]/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Cost</p>
            <p className="text-sm font-bold text-[var(--text-primary)] font-mono">
              ${cost.toFixed(4)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center">
            <Zap className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Tokens</p>
            <p className="text-sm font-bold text-[var(--text-primary)] font-mono">
              {formatTokens(run.total_tokens ?? 0)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-muted)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] font-mono">
            {completedSteps}/{totalSteps}
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Steps</p>
            <p className="text-sm font-bold text-[var(--text-primary)] font-mono">{pct}%</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            run.status === 'failed'
              ? 'bg-[var(--destructive)]'
              : isRunning
              ? 'bg-[var(--info)]'
              : 'bg-[var(--success,#10b981)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Error banner */}
      {run.error_message && (
        <div className="mt-4 p-3 rounded-lg bg-[var(--destructive-muted)] border border-[var(--destructive)]/30">
          <p className="text-xs font-semibold text-[var(--destructive)] mb-1">Falha na execução</p>
          <p className="text-xs text-[var(--text-primary)] mb-2">
            A pipeline foi interrompida antes de concluir.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] select-none">
              Detalhes técnicos
            </summary>
            <p className="mt-2 text-[var(--text-primary)] font-mono whitespace-pre-wrap break-words">
              {run.error_message}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
