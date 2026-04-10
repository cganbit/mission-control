'use client';

import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

interface AgentRow {
  agent_name: string;
  model: string;
  sessions: number;
  avg_tool_calls: number;
  avg_context_pct: number;
  avg_rating: number;
  total_cost: number;
}

type SortKey = keyof AgentRow;

export default function AgentPerformanceTable({ data }: { data: AgentRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('total_cost');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const columns: { key: SortKey; label: string; format?: (v: number) => string }[] = [
    { key: 'agent_name', label: 'Agente' },
    { key: 'model', label: 'Modelo' },
    { key: 'sessions', label: 'Sessões' },
    { key: 'avg_tool_calls', label: 'Tool Calls' },
    { key: 'avg_context_pct', label: 'Uso de Contexto', format: v => `${v?.toFixed(1)}%` },
    { key: 'avg_rating', label: 'Avaliação', format: v => v?.toFixed(1) },
    { key: 'total_cost', label: 'Custo Total', format: v => `$${v?.toFixed(2)}` },
  ];

  if (!data.length) return <p className="text-[var(--text-muted)] text-sm text-center py-8">Sem dados de agentes</p>;

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Performance por Agente</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left text-[var(--text-muted)] font-medium py-2 px-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-white/[0.02] transition-colors">
                {columns.map(col => {
                  const val = row[col.key];
                  const display = col.format && typeof val === 'number' ? col.format(val) : String(val ?? '—');
                  return (
                    <td key={col.key} className="py-2.5 px-3 text-[var(--text-secondary)]">
                      {col.key === 'agent_name' ? (
                        <span className="font-medium text-[var(--text-primary)]">{display}</span>
                      ) : col.key === 'model' ? (
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-secondary)] text-xs">{display}</span>
                      ) : display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
