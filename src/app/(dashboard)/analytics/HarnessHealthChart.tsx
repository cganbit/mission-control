'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';

interface HarnessHealthRow {
  sprint_number: number;
  sprint_date: string;
  pipeline_pct: number | null;
  enforcement_pct: number | null;
  architecture_pct: number | null;
  sre_security_pct: number | null;
  alerts: string | null;
  conclusion: string | null;
}

const LINES = [
  { key: 'pipeline_pct',     label: 'Pipeline',     color: 'var(--chart-1)' },
  { key: 'enforcement_pct',  label: 'Enforcement',  color: 'var(--chart-2)' },
  { key: 'architecture_pct', label: 'Arquitetura',  color: 'var(--chart-3)' },
  { key: 'sre_security_pct', label: 'SRE/Security', color: 'var(--chart-4)' },
];

export default function HarnessHealthChart({ data }: { data: HarnessHealthRow[] }) {
  if (!data.length) {
    return (
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Harness Health Score por Sprint</h3>
        <p className="text-[var(--text-muted)] text-sm text-center py-8">Sem dados de harness health</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Harness Health Score por Sprint</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis
            dataKey="sprint_number"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickFormatter={v => `S${v}`}
          />
          <YAxis
            domain={[60, 100]}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }}
            labelStyle={{ color: 'var(--text-primary)' }}
            formatter={(v, name) => [`${v}%`, name as string]}
            labelFormatter={v => `Sprint ${v}`}
          />
          <Legend
            formatter={value => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>}
          />
          <ReferenceLine y={85} stroke="var(--text-muted)" strokeDasharray="5 5" strokeOpacity={0.4} label={{ value: '85%', fill: 'var(--text-muted)', fontSize: 11 }} />
          {LINES.map(l => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={2}
              dot={{ r: 3, fill: l.color }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
