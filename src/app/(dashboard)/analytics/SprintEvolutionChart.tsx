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
  if (!data.length) return <p className="text-[var(--text-muted)] text-sm text-center py-8">Sem dados de tokens</p>;

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Tokens por Sprint</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis dataKey="sprint_number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={v => `S${v}`} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={formatTokens} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text-primary)' }}
            itemStyle={{ color: 'var(--text-secondary)' }}
            formatter={(v) => formatTokens(v as number)}
            labelFormatter={v => `Sprint ${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="cache_read" name="Cache Read" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.3} />
          <Area type="monotone" dataKey="cache_creation" name="Cache Creation" stackId="1" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.3} />
          <Area type="monotone" dataKey="total_output" name="Output" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.3} />
          <Area type="monotone" dataKey="total_input" name="Input" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
