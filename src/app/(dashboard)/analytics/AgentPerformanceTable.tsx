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
    { key: 'avg_tool_calls', label: 'Avg Tools' },
    { key: 'avg_context_pct', label: 'Avg Ctx %', format: v => `${v?.toFixed(1)}%` },
    { key: 'avg_rating', label: 'Avg Rating', format: v => v?.toFixed(1) },
    { key: 'total_cost', label: 'Custo Total', format: v => `$${v?.toFixed(2)}` },
  ];

  if (!data.length) return <p className="text-slate-500 text-sm text-center py-8">Sem dados de agentes</p>;

  return (
    <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Performance por Agente</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2430]">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left text-slate-500 font-medium py-2 px-3 cursor-pointer hover:text-slate-300 transition-colors select-none"
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
              <tr key={i} className="border-b border-[#1e2430]/50 hover:bg-white/[0.02] transition-colors">
                {columns.map(col => {
                  const val = row[col.key];
                  const display = col.format && typeof val === 'number' ? col.format(val) : String(val ?? '—');
                  return (
                    <td key={col.key} className="py-2.5 px-3 text-slate-300">
                      {col.key === 'agent_name' ? (
                        <span className="font-medium text-slate-100">{display}</span>
                      ) : col.key === 'model' ? (
                        <span className="px-2 py-0.5 rounded bg-indigo-950/50 text-indigo-300 text-xs">{display}</span>
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
