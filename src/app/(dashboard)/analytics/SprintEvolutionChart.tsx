'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DataPoint {
  sprint_number: number;
  total_input: number;
  total_output: number;
  cache_creation: number;
  cache_read: number;
  total: number;
}

function formatTokens(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export default function SprintEvolutionChart({ data }: { data: DataPoint[] }) {
  if (!data.length) return <p className="text-slate-500 text-sm text-center py-8">Sem dados de tokens</p>;

  return (
    <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Tokens por Sprint</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2430" />
          <XAxis dataKey="sprint_number" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `S${v}`} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={formatTokens} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e2430', border: '1px solid #2d3748', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#cbd5e1' }}
            formatter={(v) => formatTokens(v as number)}
            labelFormatter={v => `Sprint ${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="cache_read" name="Cache Read" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
          <Area type="monotone" dataKey="cache_creation" name="Cache Creation" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
          <Area type="monotone" dataKey="total_output" name="Output" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
          <Area type="monotone" dataKey="total_input" name="Input" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
