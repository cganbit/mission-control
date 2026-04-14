'use client';

import { cn } from '@/lib/utils';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'ok'
  | 'failed'
  | 'cancelled'
  | 'warning';

interface RunStatusBadgeProps {
  status: RunStatus | string;
  className?: string;
}

const STYLES: Record<string, string> = {
  running:
    'bg-[var(--info-muted)] text-[var(--info)] border-[var(--info)]/40',
  ok: 'bg-[var(--success-muted,rgba(16,185,129,0.15))] text-[var(--success,#10b981)] border-[var(--success,#10b981)]/40',
  failed:
    'bg-[var(--destructive-muted)] text-[var(--destructive)] border-[var(--destructive)]/40',
  cancelled:
    'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border)]',
  warning:
    'bg-[var(--brand-muted)] text-[var(--brand)] border-[var(--brand)]/40',
  pending:
    'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border)]',
};

const LABELS: Record<string, string> = {
  running: 'Running',
  ok: 'OK',
  failed: 'Failed',
  cancelled: 'Cancelled',
  warning: 'Warning',
  pending: 'Pending',
};

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const style = STYLES[status] ?? STYLES.pending;
  const label = LABELS[status] ?? status;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border',
        style,
        className
      )}
    >
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
