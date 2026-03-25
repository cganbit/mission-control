import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { Shield, ClipboardList, Bot, CheckCircle2, type LucideIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STAT_CONFIG: Record<string, { icon: LucideIcon; borderColor: string; iconColor: string; bgColor: string }> = {
  indigo:  { icon: Shield,        borderColor: 'border-t-blue-500/60',    iconColor: 'text-blue-400',    bgColor: 'bg-blue-500/5' },
  yellow:  { icon: ClipboardList, borderColor: 'border-t-amber-400/60',   iconColor: 'text-amber-400',   bgColor: 'bg-amber-500/5' },
  green:   { icon: Bot,           borderColor: 'border-t-emerald-500/60', iconColor: 'text-emerald-400', bgColor: 'bg-emerald-500/5' },
  emerald: { icon: CheckCircle2,  borderColor: 'border-t-emerald-400/60', iconColor: 'text-emerald-400', bgColor: 'bg-emerald-500/5' },
};

const TASK_STATUSES = [
  { status: 'backlog',     label: 'Backlog',      color: 'bg-slate-500',   dot: '#64748b' },
  { status: 'assigned',    label: 'Atribuído',    color: 'bg-blue-500',    dot: '#3b82f6' },
  { status: 'in_progress', label: 'Em Progresso', color: 'bg-amber-400',   dot: '#fbbf24' },
  { status: 'review',      label: 'Revisão',      color: 'bg-violet-500',  dot: '#8b5cf6' },
  { status: 'done',        label: 'Concluído',    color: 'bg-emerald-500', dot: '#22c55e' },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [squads, recentActivity, taskStats, agentStats] = await Promise.all([
    query(`SELECT s.*, COUNT(DISTINCT a.id) AS agent_count,
             COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done') AS open_tasks
           FROM squads s
           LEFT JOIN agents a ON a.squad_id = s.id
           LEFT JOIN tasks  t ON t.squad_id = s.id
           GROUP BY s.id ORDER BY s.created_at LIMIT 6`),

    query(`SELECT al.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
           FROM activity_log al
           LEFT JOIN agents a ON a.id = al.agent_id
           LEFT JOIN squads s ON s.id = al.squad_id
           ORDER BY al.timestamp DESC LIMIT 10`),

    query(`SELECT status, COUNT(*) AS count FROM tasks GROUP BY status`),
    query(`SELECT status, COUNT(*) AS count FROM agents GROUP BY status`),
  ]);

  const taskMap  = Object.fromEntries(taskStats.map((r: Record<string, unknown>) => [r.status as string, Number(r.count)]));
  const agentMap = Object.fromEntries(agentStats.map((r: Record<string, unknown>) => [r.status as string, Number(r.count)]));
  const totalTasks = Object.values(taskMap).reduce((a, b) => a + b, 0);
  const doneTasks  = taskMap['done'] ?? 0;

  const stats = [
    { label: 'Squads Ativos',     value: squads.length, color: 'indigo' },
    { label: 'Tarefas Abertas',   value: (taskMap['backlog'] ?? 0) + (taskMap['assigned'] ?? 0) + (taskMap['in_progress'] ?? 0) + (taskMap['review'] ?? 0), color: 'yellow' },
    { label: 'Agentes Ativos',    value: agentMap['active'] ?? 0, color: 'green' },
    { label: 'Tarefas Concluídas', value: doneTasks, color: 'emerald' },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Visão geral de todos os squads e agentes</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(stat => {
          const cfg = STAT_CONFIG[stat.color];
          const Icon = cfg.icon;
          return (
            <div
              key={stat.label}
              className={`rounded-xl p-5 border border-[#1e2430] border-t-2 ${cfg.borderColor} ${cfg.bgColor} bg-[#111827]`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
              </div>
              <div className="text-3xl font-bold text-slate-50">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Squads */}
        <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-100 text-sm">Squads</h2>
            <Link href="/squads" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {squads.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-4">
                Nenhum squad criado.{' '}
                <Link href="/squads" className="text-amber-400 hover:text-amber-300">Criar agora →</Link>
              </p>
            ) : squads.map((s: Record<string, unknown>) => (
              <div key={s.id as string} className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/60 rounded-lg transition-colors">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color as string }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200 text-sm truncate">{s.name as string}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{s.agent_count as number} agentes · {s.open_tasks as number} tarefas abertas</div>
                </div>
                <Link href={`/squads/${s.id}`} className="text-slate-600 hover:text-amber-400 text-xs transition-colors">→</Link>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-100 text-sm">Atividade Recente</h2>
            <Link href="/activity" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">Ver tudo →</Link>
          </div>
          <div className="space-y-1">
            {recentActivity.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-4">Nenhuma atividade ainda</p>
            ) : recentActivity.map((a: Record<string, unknown>) => (
              <div key={a.id as string} className="flex gap-3 py-2 border-b border-[#1e2430] last:border-0">
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: (a.squad_color as string) ?? '#f59e0b' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-300 truncate">{a.detail as string}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {a.agent_name ? `${a.agent_name} · ` : ''}{formatDate(a.timestamp as string)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task progress */}
      {totalTasks > 0 && (
        <div className="bg-[#111827] rounded-xl border border-[#1e2430] p-5">
          <h2 className="font-semibold text-slate-100 text-sm mb-4">Progresso de Tarefas</h2>
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
            {TASK_STATUSES.map(({ status, color }) => {
              const count = taskMap[status] ?? 0;
              const pct = (count / totalTasks) * 100;
              return pct > 0 ? (
                <div key={status} className={`${color} transition-all`} style={{ width: `${pct}%` }} title={`${status}: ${count}`} />
              ) : null;
            })}
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            {TASK_STATUSES.map(({ status, label, dot }) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
                {label} ({taskMap[status] ?? 0})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
