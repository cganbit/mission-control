'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepIcon, type StepStatus } from './StepIcon';
import type { PipelineStep } from '@/hooks/usePipelineStream';

interface StepCardProps {
  step: PipelineStep;
  index: number;
  totalSteps: number;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m ${rs}s`;
}

function formatTokens(n: number | null): string {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function StepCard({ step, index, totalSteps }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = step.status as StepStatus;
  const isRunning = status === 'running';
  const isFailed = status === 'failed' || status === 'timeout';

  return (
    <div
      className={cn(
        'bg-[var(--bg-surface)] rounded-lg border transition-colors relative',
        isRunning
          ? 'border-[var(--info)]/50 shadow-[0_0_0_1px_var(--info-muted)]'
          : isFailed
          ? 'border-[var(--destructive)]/40'
          : status === 'ok'
          ? 'border-[var(--border)]'
          : 'border-[var(--border)]/60'
      )}
    >
      {/* Connector line to next step */}
      {index < totalSteps - 1 && (
        <div className="absolute left-[21px] top-[44px] w-px h-[calc(100%_-_30px_+_12px)] bg-[var(--border)]" />
      )}

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        {/* Icon column */}
        <div className="flex-shrink-0 mt-0.5 relative z-10 bg-[var(--bg-surface)] rounded-full p-0.5">
          <StepIcon status={status} size="md" />
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {step.step_id}
            </span>
            {step.agent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-muted)] font-mono">
                {step.agent}
              </span>
            )}
            {step.parallel_group !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--info-muted)] text-[var(--info)] font-mono">
                ⟂ group {step.parallel_group}
              </span>
            )}
          </div>

          {step.output_summary && !expanded && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
              {step.output_summary}
            </p>
          )}

          {isFailed && step.error_message && !expanded && (
            <p className="text-xs text-[var(--destructive)] mt-1 truncate">
              {step.error_message}
            </p>
          )}

          {/* Status row */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--text-muted)]">
            <span>{formatDuration(step.duration_ms)}</span>
            {step.input_tokens !== null && step.input_tokens > 0 && (
              <span>
                in {formatTokens(step.input_tokens)}
                {step.output_tokens ? ` · out ${formatTokens(step.output_tokens)}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <div className="flex-shrink-0 text-[var(--text-muted)] mt-1">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[var(--text-muted)]">Started</p>
              <p className="text-[var(--text-primary)] font-mono">
                {step.started_at ? new Date(step.started_at).toLocaleTimeString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Finished</p>
              <p className="text-[var(--text-primary)] font-mono">
                {step.finished_at ? new Date(step.finished_at).toLocaleTimeString() : '—'}
              </p>
            </div>
          </div>
          {step.output_summary && (
            <div className="text-xs">
              <p className="text-[var(--text-muted)] mb-1">Output</p>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                {step.output_summary}
              </p>
            </div>
          )}
          {step.error_message && (
            <div className="text-xs">
              <p className="text-[var(--destructive)] mb-1">Error</p>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap break-words font-mono">
                {step.error_message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
