'use client';

import { useState, useEffect, useCallback } from 'react';

interface AgentUsage {
  agent_id: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
}

interface DayUsage {
  date: string;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
}

interface Totals {
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
  agents_count: number;
}

function fmt(n: number) { return (n ?? 0).toLocaleString('pt-BR'); }
function fmtCost(n: number) { return `$${(n ?? 0).toFixed(4)}`; }
function fmtK(n: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function BarChart({ data, max }: { data: DayUsage[]; max: number }) {
  if (!data.length) return <div className="text-center text-[var(--text-muted)] py-8 text-sm">Sem dados</div>;
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map(d => {
        const pct = max > 0 ? (d.tokens_total / max) * 100 : 0;
        const label = d.date.slice(5); // MM-DD
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t-sm bg-[var(--accent)] group-hover:bg-[var(--accent-hover)] transition-colors cursor-default"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--bg-overlay)] text-[var(--text-primary)] text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {fmtK(d.tokens_total)} tokens · {fmtCost(d.cost_usd)}
            </div>
            {data.length <= 14 && (
              <span className="text-[var(--text-muted)] text-[9px]">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TokensPage() {
  const [data, setData] = useState<{ byAgent: AgentUsage[]; byDay: DayUsage[]; totals: Totals } | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tokens?days=${days}`).then(r => r.json());
    setData(res);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxDay = data ? Math.max(...data.byDay.map(d => Number(d.tokens_total)), 1) : 1;
  const totalTokens = Number(data?.totals?.tokens_total ?? 0);
  const totalCost = Number(data?.totals?.cost_usd ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tokens & Custo</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Consumo de tokens por agente</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={14}>Últimos 14 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total de Tokens', value: fmtK(totalTokens), sub: fmt(totalTokens) + ' tokens', icon: '🔢' },
          { label: 'Tokens de Entrada', value: fmtK(Number(data?.totals?.tokens_in ?? 0)), sub: 'input tokens', icon: '📥' },
          { label: 'Tokens de Saída', value: fmtK(Number(data?.totals?.tokens_out ?? 0)), sub: 'output tokens', icon: '📤' },
          { label: 'Custo Estimado', value: `$${totalCost.toFixed(2)}`, sub: 'USD (estimativa)', icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-surface)] rounded-xl p-5 border border-[var(--border)]">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{loading ? '...' : s.value}</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{s.label}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Consumo Diário — últimos {days} dias
        </h2>
        {loading ? (
          <div className="h-32 flex items-center justify-center text-[var(--text-muted)] text-sm">Carregando...</div>
        ) : (
          <BarChart data={data?.byDay ?? []} max={maxDay} />
        )}
      </div>

      {/* Per agent */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Por Agente</h2>
        </div>
        {loading ? (
          <div className="text-center text-[var(--text-muted)] py-12 text-sm">Carregando...</div>
        ) : !data?.byAgent.length ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm">Nenhum registro ainda</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Use POST /api/tokens para registrar uso</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {data.byAgent.map((a, i) => {
              const pct = totalTokens > 0 ? (Number(a.tokens_total) / totalTokens) * 100 : 0;
              return (
                <div key={a.agent_id ?? i} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.squad_color ?? '#6366f1' }} />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{a.agent_name ?? 'Desconhecido'}</span>
                    <span className="text-xs text-[var(--text-muted)]">{a.squad_name}</span>
                    <div className="flex-1" />
                    <span className="text-sm font-mono text-[var(--accent)]">{fmtK(Number(a.tokens_total))}</span>
                    <span className="text-xs text-[var(--text-muted)] w-16 text-right">{fmtCost(Number(a.cost_usd))}</span>
                  </div>
                  <div className="w-full bg-[var(--bg-muted)] rounded-full h-1.5">
                    <div className="bg-[var(--accent)] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-[var(--text-muted)]">
                    <span>↓ {fmtK(Number(a.tokens_in))} input</span>
                    <span>↑ {fmtK(Number(a.tokens_out))} output</span>
                    <span>{pct.toFixed(1)}% do total</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
