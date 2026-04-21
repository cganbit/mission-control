'use client';

/**
 * ProgressCard — pure presentational primitive.
 *
 * Shows a progress bar (% of success steps) and a per-step list with
 * status icon, label, and elapsed duration. Zero coupling to SSE,
 * PipelineRun, or any Mission-Control domain type.
 *
 * API shape matches the wingx-platform template/DESIGN.md spec for
 * <PipelineProgress>.
 *
 * Usage:
 *   <ProgressCard
 *     title="Deploy pipeline"
 *     steps={[
 *       { id: '1', label: 'Build', status: 'success', startedAt: '...', finishedAt: '...' },
 *       { id: '2', label: 'Test',  status: 'running', startedAt: '...' },
 *       { id: '3', label: 'Push',  status: 'pending' },
 *     ]}
 *     onStepClick={(id) => console.log(id)}
 *   />
 */

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProgressCardStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
}

export interface ProgressCardProps {
  steps: ProgressCardStep[];
  title?: string;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type StepStatus = ProgressCardStep['status'];

const STATUS_META: Record<
  StepStatus,
  { icon: typeof CheckCircle2; iconClass: string; srLabel: string }
> = {
  pending: {
    icon: Circle,
    iconClass: 'text-[var(--text-muted)]',
    srLabel: 'pending',
  },
  running: {
    icon: Loader2,
    iconClass: 'text-[var(--info)] animate-spin',
    srLabel: 'running',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-[var(--success,#10b981)]',
    srLabel: 'success',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-[var(--destructive)]',
    srLabel: 'error',
  },
};

/** Convert a string/Date/null timestamp to epoch ms, or undefined. */
function toMs(value?: string | Date | null): number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Human-readable elapsed duration from two timestamps. */
function formatDuration(
  startedAt?: string | Date | null,
  finishedAt?: string | Date | null,
): string | null {
  const start = toMs(startedAt);
  if (start == null) return null;
  const end = toMs(finishedAt) ?? Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${minutes}m` : `${minutes}m${rem}s`;
}

// ── ProgressBar ────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Overall progress"
      className="h-1.5 w-full rounded-full bg-[var(--bg-muted,rgba(255,255,255,0.08))] overflow-hidden"
    >
      <div
        className="h-full rounded-full bg-[var(--success,#10b981)] transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// ── ProgressCard ───────────────────────────────────────────────────────────

export function ProgressCard({
  steps,
  title,
  onStepClick,
  className,
}: ProgressCardProps) {
  const total = steps.length;
  const doneCount = steps.filter(s => s.status === 'success').length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const isInteractive = Boolean(onStepClick);

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        {title ? (
          <h3 className="text-sm font-semibold text-[var(--text,var(--foreground))] truncate">
            {title}
          </h3>
        ) : (
          <span />
        )}
        <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums shrink-0">
          {doneCount}&nbsp;/&nbsp;{total}
          &nbsp;·&nbsp;{percent}%
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar percent={percent} />

      {/* Step list */}
      {total > 0 && (
        <ol className="space-y-1 pt-1">
          {steps.map(step => {
            const meta = STATUS_META[step.status];
            const Icon = meta.icon;
            const duration = formatDuration(step.startedAt, step.finishedAt);
            const Tag = isInteractive ? 'button' : 'div';

            return (
              <li key={step.id}>
                <Tag
                  type={isInteractive ? 'button' : undefined}
                  onClick={
                    isInteractive ? () => onStepClick!(step.id) : undefined
                  }
                  className={cn(
                    'w-full flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-left',
                    isInteractive &&
                      'hover:bg-[var(--bg-muted,rgba(255,255,255,0.06))] transition-colors cursor-pointer',
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 shrink-0', meta.iconClass)}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-[var(--text,var(--foreground))]">
                    {step.label}
                  </span>
                  {duration ? (
                    <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
                      {duration}
                    </span>
                  ) : null}
                  <span className="sr-only">{meta.srLabel}</span>
                </Tag>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
