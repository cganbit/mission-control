'use client';

import { useState } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';

interface Recommendation {
  id: number;
  agent_name: string;
  current_model: string;
  recommended: string;
  reason: string;
  sprint_number: number;
}

export default function LLMRecommendationsPanel({ data, onApplied }: { data: Recommendation[]; onApplied?: () => void }) {
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  async function handleApply(id: number) {
    setApplying(id);
    try {
      const res = await fetch(`/api/analytics/recommendations/${id}`, { method: 'PATCH' });
      if (res.ok) {
        setApplied(prev => new Set(prev).add(id));
        onApplied?.();
      }
    } finally {
      setApplying(null);
    }
  }

  const pending = data.filter(r => !applied.has(r.id));

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-[var(--brand)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recomendações LLM Optimizer</h3>
        {pending.length > 0 && (
          <span className="text-[10px] bg-[var(--brand)]/20 text-[var(--brand)] px-1.5 py-0.5 rounded-full font-medium">
            {pending.length}
          </span>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm text-center py-4">Nenhuma recomendação pendente</p>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {pending.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-[var(--bg-base)] rounded-lg px-3 py-2.5 border border-[var(--border)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-primary)] font-medium">{r.agent_name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--destructive)]/10 text-[var(--destructive)] text-xs">{r.current_model}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />
                  <span className="px-1.5 py-0.5 rounded bg-[var(--accent-muted)] text-[var(--accent)] text-xs">{r.recommended}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{r.reason}</p>
              </div>
              <button
                onClick={() => handleApply(r.id)}
                disabled={applying === r.id}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-medium hover:bg-[var(--brand)]/20 transition-colors disabled:opacity-50"
              >
                {applying === r.id ? '...' : <Check className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
