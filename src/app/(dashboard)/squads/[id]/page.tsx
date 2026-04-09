'use client';

import { useState, useEffect, use } from 'react';
import { AGENT_STATUS_COLORS, STATUS_LABELS, STATUS_COLORS, formatDate } from '@/lib/utils';

interface Squad { id: string; name: string; description: string; mission: string; color: string }
interface Agent { id: string; name: string; role: string; status: string; open_tasks: number }
interface Task { id: string; title: string; status: string; priority: string; agent_name: string; created_at: string }

export default function SquadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<'overview' | 'agents' | 'tasks'>('overview');

  useEffect(() => {
    Promise.all([
      fetch(`/api/squads/${id}`).then(r => r.json()),
      fetch(`/api/agents?squad_id=${id}`).then(r => r.json()),
      fetch(`/api/tasks?squad_id=${id}`).then(r => r.json()),
    ]).then(([s, a, t]) => {
      setSquad(s);
      setAgents(a);
      setTasks(t);
    });
  }, [id]);

  if (!squad) return <div className="text-[var(--text-muted)] text-center py-12">Carregando...</div>;

  const taskByStatus: Record<string, number> = {};
  tasks.forEach(t => { taskByStatus[t.status] = (taskByStatus[t.status] ?? 0) + 1; });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-4 h-12 rounded-full" style={{ backgroundColor: squad.color }} />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{squad.name}</h1>
          {squad.description && <p className="text-[var(--text-secondary)] text-sm mt-1">{squad.description}</p>}
        </div>
      </div>

      {squad.mission && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Missão</div>
          <p className="text-[var(--text-primary)] text-sm leading-relaxed">{squad.mission}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Agentes', value: agents.length, icon: '🤖' },
          { label: 'Tarefas Totais', value: tasks.length, icon: '📋' },
          { label: 'Em Progresso', value: (taskByStatus['in_progress'] ?? 0) + (taskByStatus['assigned'] ?? 0), icon: '⚡' },
          { label: 'Concluídas', value: taskByStatus['done'] ?? 0, icon: '✅' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-4">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{s.value}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        {(['overview', 'agents', 'tasks'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t === 'overview' ? 'Visão Geral' : t === 'agents' ? 'Agentes' : 'Tarefas'}
          </button>
        ))}
      </div>

      {tab === 'agents' && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          {agents.map(agent => (
            <div key={agent.id} className="flex items-center gap-4 px-5 py-4">
              <div className={`w-2.5 h-2.5 rounded-full ${AGENT_STATUS_COLORS[agent.status]}`} />
              <div className="flex-1">
                <div className="font-medium text-[var(--text-primary)] text-sm">{agent.name}</div>
                {agent.role && <div className="text-xs text-[var(--text-muted)]">{agent.role}</div>}
              </div>
              <div className="text-xs text-[var(--text-muted)]">📋 {agent.open_tasks} tarefas</div>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                agent.status === 'active' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' :
                agent.status === 'idle'   ? 'bg-[var(--warning)]/15 text-[var(--warning)]' :
                'bg-[var(--destructive)]/15 text-[var(--destructive)]'
              }`}>
                {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Parado'}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-4 px-5 py-4">
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
              <div className="flex-1">
                <div className="text-sm text-[var(--text-primary)]">{task.title}</div>
                {task.agent_name && <div className="text-xs text-[var(--text-muted)] mt-0.5">🤖 {task.agent_name}</div>}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{formatDate(task.created_at)}</div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">Nenhuma tarefa neste squad</div>
          )}
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-medium text-[var(--text-primary)] mb-3">Agentes</h3>
            <div className="space-y-2">
              {agents.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${AGENT_STATUS_COLORS[a.status]}`} />
                  <span className="text-[var(--text-primary)]">{a.name}</span>
                  <span className="text-[var(--text-muted)] text-xs">{a.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-medium text-[var(--text-primary)] mb-3">Status das Tarefas</h3>
            <div className="space-y-2">
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{label}</span>
                  <span className="font-medium text-[var(--text-primary)]">{taskByStatus[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
