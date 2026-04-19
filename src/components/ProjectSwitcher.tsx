'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProjectRef {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  memberRole: string;
}

interface Props {
  currentProject: ProjectRef | null;
  availableProjects: ProjectRef[];
  collapsed?: boolean;
}

export default function ProjectSwitcher({ currentProject, availableProjects, collapsed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (availableProjects.length === 0) return null;

  async function switchTo(projectId: string) {
    if (busy || projectId === currentProject?.id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/active-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? 'Falha ao trocar projeto');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Erro de rede');
    } finally {
      setBusy(false);
    }
  }

  if (collapsed) {
    return (
      <div className="px-2 py-2 border-b border-[var(--border-default)]">
        <div
          className="w-8 h-8 mx-auto rounded-md bg-[var(--bg-muted)] flex items-center justify-center text-xs font-mono font-bold text-[var(--brand)]"
          title={currentProject ? `${currentProject.organizationSlug} / ${currentProject.name}` : 'Nenhum projeto'}
        >
          {currentProject ? currentProject.slug.charAt(0).toUpperCase() : '?'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-b border-[var(--border-default)]">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors text-left disabled:opacity-60"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Projeto ativo</div>
          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
            {currentProject ? (
              <>
                <span className="text-[var(--text-muted)]">{currentProject.organizationSlug}</span>
                <span className="text-[var(--text-muted)]"> / </span>
                <span>{currentProject.name}</span>
              </>
            ) : (
              'Nenhum selecionado'
            )}
          </div>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-muted)] transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {error && (
        <div className="px-3 pb-2 text-[10px] text-[var(--destructive)]">{error}</div>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 mx-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg shadow-xl max-h-80 overflow-auto">
          {availableProjects.map(p => (
            <button
              key={p.id}
              onClick={() => switchTo(p.id)}
              disabled={busy}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors disabled:opacity-50',
                p.id === currentProject?.id && 'bg-white/5'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  <span className="text-[var(--text-muted)]">{p.organizationSlug}</span>
                  <span className="text-[var(--text-muted)]"> / </span>
                  <span className="text-[var(--text-primary)]">{p.name}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] capitalize">{p.memberRole}</div>
              </div>
              {p.id === currentProject?.id && <Check className="h-3.5 w-3.5 text-[var(--brand)] flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
