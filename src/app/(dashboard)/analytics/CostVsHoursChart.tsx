'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DataPoint {
  sprint_number: number;
  cost_usd: number;
  duration_hours: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DataPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm">
      <p className="text-[var(--text-primary)] font-medium">Sprint {d.sprint_number}</p>
      <p className="text-[var(--brand)]">Custo: ${d.cost_usd?.toFixed(2)}</p>
      <p className="text-[var(--text-secondary)]">Horas: {d.duration_hours?.toFixed(1)}h</p>
    </div>
  );
}

const COLORS = ['var(--chart-1)', 'var(--chart-5)', 'var(--chart-5)', 'var(--chart-5)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-1)'];

export default function CostVsHoursChart({ data }: { data: DataPoint[] }) {
  if (!data.length) return <p className="text-[var(--text-muted)] text-sm text-center py-8">Sem dados de custo/horas</p>;

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Custo USD x Horas Dev</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis dataKey="duration_hours" name="Horas" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={v => `${v}h`} />
          <YAxis dataKey="cost_usd" name="Custo" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={v => `$${v}`} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={data} fill="var(--chart-3)">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
