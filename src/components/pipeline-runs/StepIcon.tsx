'use client';

import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Hourglass,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'ok'
  | 'failed'
  | 'skipped'
  | 'timeout'
  | 'warning';

interface StepIconProps {
  status: StepStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<StepIconProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function StepIcon({ status, size = 'md', className }: StepIconProps) {
  const sizeCls = SIZE_CLASS[size];
  switch (status) {
    case 'running':
      return (
        <Loader2
          className={cn(sizeCls, 'text-[var(--info)] animate-spin', className)}
          aria-label="running"
        />
      );
    case 'ok':
      return (
        <CheckCircle2
          className={cn(sizeCls, 'text-[var(--success,#10b981)]', className)}
          aria-label="ok"
        />
      );
    case 'failed':
      return (
        <XCircle
          className={cn(sizeCls, 'text-[var(--destructive)]', className)}
          aria-label="failed"
        />
      );
    case 'warning':
      return (
        <AlertTriangle
          className={cn(sizeCls, 'text-[var(--brand)]', className)}
          aria-label="warning"
        />
      );
    case 'skipped':
      return (
        <Ban
          className={cn(sizeCls, 'text-[var(--text-muted)]', className)}
          aria-label="skipped"
        />
      );
    case 'timeout':
      return (
        <Hourglass
          className={cn(sizeCls, 'text-[var(--brand)]', className)}
          aria-label="timeout"
        />
      );
    case 'pending':
    default:
      return (
        <Circle
          className={cn(sizeCls, 'text-[var(--text-muted)]/50', className)}
          aria-label="pending"
        />
      );
  }
}
