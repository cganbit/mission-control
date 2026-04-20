'use client';

import { cn } from '@/lib/utils';

export type StatusTone = 'info' | 'success' | 'failed' | 'warning' | 'neutral';

const TONE_STYLES: Record<StatusTone, string> = {
  info: 'bg-[var(--info-muted)] text-[var(--info)] border-[var(--info)]/40',
  success:
    'bg-[var(--success-muted,rgba(16,185,129,0.15))] text-[var(--success,#10b981)] border-[var(--success,#10b981)]/40',
  failed:
    'bg-[var(--destructive-muted)] text-[var(--destructive)] border-[var(--destructive)]/40',
  warning:
    'bg-[var(--brand-muted)] text-[var(--brand)] border-[var(--brand)]/40',
  neutral:
    'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border)]',
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  tone = 'neutral',
  pulse = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border',
        TONE_STYLES[tone],
        className
      )}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
