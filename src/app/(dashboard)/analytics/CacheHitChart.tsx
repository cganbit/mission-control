'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DataPoint {
  sprint_number: number;
  avg_cache_hit: number;
}

export default function CacheHitChart({ data }: { data: DataPoint[] }) {
  if (!data.length) return <p className="text-slate-500 text-sm text-center py-8">Sem dados de cache</p>;

  return (
    <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Cache Hit Ratio por Sprint</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2430" />
          <XAxis dataKey="sprint_number" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `S${v}`} />
          <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e2430', border: '1px solid #2d3748', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(v) => [`${v}%`, 'Cache Hit']}
            labelFormatter={v => `Sprint ${v}`}
          />
          <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="5 5" strokeOpacity={0.5} />
          <Line type="monotone" dataKey="avg_cache_hit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
