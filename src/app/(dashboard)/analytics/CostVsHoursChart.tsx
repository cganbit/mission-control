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
    <div className="bg-[#1e2430] border border-[#2d3748] rounded-lg px-3 py-2 text-sm">
      <p className="text-slate-200 font-medium">Sprint {d.sprint_number}</p>
      <p className="text-amber-400">Custo: ${d.cost_usd?.toFixed(2)}</p>
      <p className="text-blue-400">Horas: {d.duration_hours?.toFixed(1)}h</p>
    </div>
  );
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4'];

export default function CostVsHoursChart({ data }: { data: DataPoint[] }) {
  if (!data.length) return <p className="text-slate-500 text-sm text-center py-8">Sem dados de custo/horas</p>;

  return (
    <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Custo USD x Horas Dev</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2430" />
          <XAxis dataKey="duration_hours" name="Horas" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `${v}h`} />
          <YAxis dataKey="cost_usd" name="Custo" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={v => `$${v}`} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={data} fill="#f59e0b">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
