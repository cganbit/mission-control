'use client';

import { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, formatDate } from '@/lib/utils';

const STATUSES = ['backlog', 'assigned', 'in_progress', 'review', 'done'] as const;

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  parent_id: string | null;
  squad_id: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
  due_date: string;
  created_at: string;
  started_at: string | null;
  auto_created?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

function relativeDue(dateStr: string): { label: string; color: string } {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.floor(diff / 86400000);
  if (days < 0)  return { label: `venceu ${Math.abs(days)}d atrás`, color: 'text-red-400' };
  if (days === 0) return { label: 'vence hoje', color: 'text-amber-400' };
  if (days === 1) return { label: 'amanhã', color: 'text-amber-300' };
  return { label: `em ${days}d`, color: 'text-slate-500' };
}

function agentInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border border-red-500/40',
  high:   'bg-orange-500/20 text-orange-400 border border-orange-500/40',
  medium: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',
  low:    'bg-slate-700/40 text-slate-500 border border-slate-600/40',
};

const PRIORITY_ICON: Record<string, string> = {
  urgent: '🔴', high: '🟠', medium: '🔵', low: '⚪',
};

const COL_ACCENT: Record<string, string> = {
  backlog:    'border-slate-700',
  assigned:   'border-indigo-500/50',
  in_progress:'border-amber-500/50',
  review:     'border-purple-500/50',
  done:       'border-emerald-500/50',
};

interface Squad { id: string; name: string; color: string }
interface Agent { id: string; name: string; squad_id: string }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filterSquad, setFilterSquad] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ squad_id: '', agent_id: '', title: '', description: '', priority: 'medium', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [showJarvis, setShowJarvis] = useState(false);
  const [jarvisTask, setJarvisTask] = useState('');
  const [jarvisTaskId, setJarvisTaskId] = useState('');
  const [jarvisSquadId, setJarvisSquadId] = useState('');
  const [jarvisLoading, setJarvisLoading] = useState(false);
  const [jarvisResult, setJarvisResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = filterSquad ? `/api/tasks?squad_id=${filterSquad}` : '/api/tasks';
    const [tasksRes, squadsRes, agentsRes] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ]);
    setTasks(tasksRes);
    setSquads(squadsRes);
    setAgents(agentsRes);
  }, [filterSquad]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, agent_id: form.agent_id || undefined }),
    });
    setForm({ squad_id: '', agent_id: '', title: '', description: '', priority: 'medium', due_date: '' });
    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function moveTask(taskId: string, newStatus: string) {
    if (newStatus === 'done') {
      setJustDone(prev => new Set(prev).add(taskId));
      setTimeout(() => setJustDone(prev => { const s = new Set(prev); s.delete(taskId); return s; }), 700);
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors: ['#22c55e', '#86efac', '#4ade80', '#bbf7d0', '#ffffff'] });
    }
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function deleteTask(id: string) {
    if (!confirm('Deletar tarefa?')) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    load();
  }

  async function sendToJarvis(e: React.FormEvent) {
    e.preventDefault();
    if (!jarvisTask.trim()) return;
    setJarvisLoading(true);
    setJarvisResult(null);
    try {
      const res = await fetch('/api/jarvis/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: jarvisTask, task_id: jarvisTaskId || undefined, squad_id: jarvisSquadId || undefined }),
      });
      const data = await res.json();
      setJarvisResult(res.ok ? `✅ Jarvis iniciou — exit: ${data.exit ?? 0}` : `❌ Erro: ${data.error ?? 'falha'}`);
    } catch {
      setJarvisResult('❌ Sem resposta do bridge');
    }
    setJarvisLoading(false);
  }

  function openJarvisForTask(task: Task) {
    setJarvisTask(task.title + (task.description ? '\n\n' + task.description : ''));
    setJarvisTaskId(task.id);
    setJarvisSquadId(task.squad_id);
    setJarvisResult(null);
    setShowJarvis(true);
  }

  const squadAgents = agents.filter(a => a.squad_id === form.squad_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Board</h1>
          <p className="text-gray-400 text-sm mt-1">Kanban de tarefas por squad</p>
        </div>
        <div className="flex gap-3">
          <select
            value={filterSquad}
            onChange={e => setFilterSquad(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none"
          >
            <option value="">Todos os squads</option>
            {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={() => { setJarvisTask(''); setJarvisTaskId(''); setJarvisResult(null); setShowJarvis(v => !v); }}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            ✨ Jarvis
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Nova Tarefa
          </button>
        </div>
      </div>

      {showJarvis && (
        <div className="bg-violet-950/40 border border-violet-700/50 rounded-xl p-5">
          <h2 className="font-semibold text-violet-300 mb-3">✨ Enviar ao Jarvis</h2>
          <form onSubmit={sendToJarvis} className="space-y-3">
            <textarea
              value={jarvisTask}
              onChange={e => setJarvisTask(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-gray-900 border border-violet-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              placeholder="Descreva a task para o Jarvis executar..."
              required
            />
            {jarvisTaskId && <p className="text-xs text-violet-400">Vinculado à task: {jarvisTaskId}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={jarvisLoading} className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                {jarvisLoading ? 'Enviando...' : 'Executar'}
              </button>
              <button type="button" onClick={() => setShowJarvis(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                Fechar
              </button>
              {jarvisResult && <span className="text-sm text-gray-300">{jarvisResult}</span>}
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Criar Tarefa</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Squad *</label>
                <select
                  value={form.squad_id}
                  onChange={e => setForm(f => ({ ...f, squad_id: e.target.value, agent_id: '' }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none"
                  required
                >
                  <option value="">Selecione...</option>
                  {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Agente</label>
                <select
                  value={form.agent_id}
                  onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                  disabled={!form.squad_id}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none disabled:opacity-50"
                >
                  <option value="">Sem agente</option>
                  {squadAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Prioridade</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Título *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="O que precisa ser feito?"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Descrição</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Detalhes opcionais..."
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Criando...' : 'Criar Tarefa'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sprint Epics */}
      {tasks.filter(t => t.type === 'sprint').length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Sprints</h2>
          <div className="grid grid-cols-3 gap-3">
            {tasks.filter(t => t.type === 'sprint').map(sprint => {
              const children = tasks.filter(t => t.parent_id === sprint.id);
              const done = children.filter(t => t.status === 'done').length;
              const total = children.length;
              const pct = total > 0 ? Math.round(done / total * 100) : sprint.status === 'done' ? 100 : 0;
              return (
                <div key={sprint.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-white font-medium truncate flex-1 mr-2">{sprint.title}</span>
                    <span className={`text-xs font-bold flex-shrink-0 ${pct === 100 ? 'text-emerald-400' : 'text-indigo-400'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600">
                    {total > 0 ? `${done}/${total} tasks · ` : ''}{sprint.status === 'done' ? '✅ concluído' : `criado ${relativeTime(sprint.created_at)}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-5 gap-3 items-start">
        {STATUSES.map(status => {
          const col = tasks.filter(t => t.status === status);
          const hasUrgent = col.some(t => t.priority === 'urgent');
          return (
            <div
              key={status}
              className={`bg-gray-900/60 rounded-xl border-t-2 ${COL_ACCENT[status]} min-h-[120px]`}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragging) moveTask(dragging, status); setDragging(null); }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                <div className="flex items-center gap-1.5">
                  {hasUrgent && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  <span className="text-xs font-semibold text-gray-500 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center">
                    {col.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="px-2 pb-3 space-y-2">
                {col.map(task => {
                  const isSRE = task.auto_created === true;
                  const due = task.due_date ? relativeDue(task.due_date) : null;
                  const isDone = justDone.has(task.id);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`rounded-lg p-3 cursor-grab active:cursor-grabbing border transition-all group
                        ${isDone ? 'border-emerald-500 bg-emerald-500/10' : isSRE ? 'bg-gray-800 border-l-2 border-l-red-500 border-gray-700 hover:border-gray-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}
                      `}
                    >
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-1 mb-2.5">
                        <p className="text-sm text-gray-200 leading-snug flex-1">
                          {isSRE && <span className="mr-1">⚡</span>}
                          {task.title}
                        </p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                          <button
                            onClick={() => openJarvisForTask(task)}
                            className="text-violet-500 hover:text-violet-300 text-xs"
                            title="Enviar ao Jarvis"
                          >✨</button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-gray-600 hover:text-red-400 text-xs"
                          >✕</button>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Squad dot */}
                        {task.squad_color && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.squad_color }} title={task.squad_name} />
                        )}

                        {/* Priority badge */}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.medium}`}>
                          {PRIORITY_ICON[task.priority]} {task.priority}
                        </span>

                        {/* Agent avatar */}
                        {task.agent_name && (
                          <span
                            className="text-[10px] font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                            title={task.agent_name}
                          >
                            {agentInitials(task.agent_name)}
                          </span>
                        )}
                      </div>

                      {/* Agent name */}
                      {task.agent_name && (
                        <p className="text-[10px] mt-1.5 text-indigo-400 font-medium truncate">
                          🤖 {task.agent_name}
                        </p>
                      )}

                      {/* Started at */}
                      {task.started_at && (
                        <p className="text-[10px] mt-0.5 text-blue-400">
                          ⚡ atribuído {relativeTime(task.started_at)}
                        </p>
                      )}

                      {/* Due date */}
                      {due && (
                        <p className={`text-[10px] mt-1 font-medium ${due.color}`}>
                          📅 {due.label}
                        </p>
                      )}
                    </div>
                  );
                })}

                {col.length === 0 && (
                  <div className="text-center py-6 text-xs text-gray-700 select-none">
                    Arraste aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
