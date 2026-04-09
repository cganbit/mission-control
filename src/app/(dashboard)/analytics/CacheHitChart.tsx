'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DataPoint {
  sprint_number: number;
  avg_cache_hit: number;
}

export default function CacheHitChart({ data }: { data: DataPoint[] }) {
  if (!data.length) return <p className="text-[var(--text-muted)] text-sm text-center py-8">Sem dados de cache</p>;

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Cache Hit Ratio por Sprint</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis dataKey="sprint_number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={v => `S${v}`} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text-primary)' }}
            formatter={(v) => [`${v}%`, 'Cache Hit']}
            labelFormatter={v => `Sprint ${v}`}
          />
          <ReferenceLine y={90} stroke="var(--chart-2)" strokeDasharray="5 5" strokeOpacity={0.5} />
          <Line type="monotone" dataKey="avg_cache_hit" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4, fill: 'var(--chart-2)' }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
