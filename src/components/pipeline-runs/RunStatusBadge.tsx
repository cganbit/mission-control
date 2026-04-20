'use client';

import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'ok'
  | 'failed'
  | 'cancelled'
  | 'warning';

const RUN_TONE: Record<string, StatusTone> = {
  running: 'info',
  ok: 'success',
  failed: 'failed',
  warning: 'warning',
  cancelled: 'neutral',
  pending: 'neutral',
};

const RUN_LABEL: Record<string, string> = {
  running: 'Running',
  ok: 'OK',
  failed: 'Failed',
  cancelled: 'Cancelled',
  warning: 'Warning',
  pending: 'Pending',
};

interface RunStatusBadgeProps {
  status: RunStatus | string;
  className?: string;
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  return (
    <StatusBadge
      label={RUN_LABEL[status] ?? status}
      tone={RUN_TONE[status] ?? 'neutral'}
      pulse={status === 'running'}
      className={className}
    />
  );
}
