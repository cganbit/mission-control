import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate, STATUS_COLORS, AGENT_STATUS_COLORS } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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

  const taskMap = Object.fromEntries(taskStats.map((r: Record<string, unknown>) => [r.status as string, Number(r.count)]));
  const agentMap = Object.fromEntries(agentStats.map((r: Record<string, unknown>) => [r.status as string, Number(r.count)]));
  const totalTasks = Object.values(taskMap).reduce((a, b) => a + b, 0);
  const doneTasks = taskMap['done'] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Visão geral de todos os squads e agentes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Squads Ativos', value: squads.length, icon: '🛡️', color: 'indigo' },
          { label: 'Tarefas Abertas', value: (taskMap['backlog'] ?? 0) + (taskMap['assigned'] ?? 0) + (taskMap['in_progress'] ?? 0) + (taskMap['review'] ?? 0), icon: '📋', color: 'yellow' },
          { label: 'Agentes Ativos', value: agentMap['active'] ?? 0, icon: '🤖', color: 'green' },
          { label: 'Tarefas Concluídas', value: doneTasks, icon: '✅', color: 'emerald' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <div className="text-3xl font-bold text-white">{stat.value}</div>
            <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Squads */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Squads</h2>
            <Link href="/squads" className="text-xs text-indigo-400 hover:text-indigo-300">Ver todos →</Link>
          </div>
          <div className="space-y-3">
            {squads.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                Nenhum squad criado. <Link href="/squads" className="text-indigo-400">Criar agora →</Link>
              </p>
            ) : squads.map((s: Record<string, unknown>) => (
              <div key={s.id as string} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color as string }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">{s.name as string}</div>
                  <div className="text-xs text-gray-500">{s.agent_count as number} agentes · {s.open_tasks as number} tarefas abertas</div>
                </div>
                <Link href={`/squads/${s.id}`} className="text-xs text-gray-500 hover:text-white">→</Link>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Atividade Recente</h2>
            <Link href="/activity" className="text-xs text-indigo-400 hover:text-indigo-300">Ver tudo →</Link>
          </div>
          <div className="space-y-2">
            {recentActivity.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Nenhuma atividade ainda</p>
            ) : recentActivity.map((a: Record<string, unknown>) => (
              <div key={a.id as string} className="flex gap-3 py-2 border-b border-gray-800 last:border-0">
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: (a.squad_color as string) ?? '#6366f1' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{a.detail as string}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
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
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="font-semibold text-white mb-4">Progresso de Tarefas</h2>
          <div className="flex gap-2 h-4 rounded-full overflow-hidden">
            {[
              ['backlog','#475569'],['assigned','#3b82f6'],['in_progress','#eab308'],['review','#a855f7'],['done','#22c55e']
            ].map(([status, color]) => {
              const count = taskMap[status] ?? 0;
              const pct = (count / totalTasks) * 100;
              return pct > 0 ? (
                <div key={status} style={{ width: `${pct}%`, backgroundColor: color }} title={`${status}: ${count}`} />
              ) : null;
            })}
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            {[
              ['backlog','Backlog','#475569'],['assigned','Atribuído','#3b82f6'],['in_progress','Em Progresso','#eab308'],['review','Revisão','#a855f7'],['done','Concluído','#22c55e']
            ].map(([status, label, color]) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {label} ({taskMap[status] ?? 0})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
