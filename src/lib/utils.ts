import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
}

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  assigned: 'Atribuído',
  in_progress: 'Em Progresso',
  review: 'Revisão',
  done: 'Concluído',
};

export const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-700 text-slate-200',
  assigned: 'bg-blue-900 text-blue-200',
  in_progress: 'bg-yellow-900 text-yellow-200',
  review: 'bg-purple-900 text-purple-200',
  done: 'bg-green-900 text-green-200',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  stopped: 'bg-red-500',
};
