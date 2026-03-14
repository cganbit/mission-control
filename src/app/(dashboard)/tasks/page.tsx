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
  agent_name: string;
  squad_name: string;
  squad_color: string;
  due_date: string;
  created_at: string;
}

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
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Nova Tarefa
          </button>
        </div>
      </div>

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

      {/* Kanban board */}
      <div className="grid grid-cols-5 gap-4">
        {STATUSES.map(status => {
          const col = tasks.filter(t => t.status === status);
          return (
            <div
              key={status}
              className="bg-gray-900/50 rounded-xl p-3 min-h-[200px]"
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragging) moveTask(dragging, status); setDragging(null); }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-gray-500">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`bg-gray-800 rounded-lg p-3 cursor-grab active:cursor-grabbing border transition-colors group ${justDone.has(task.id) ? 'border-green-500 task-done-anim' : 'border-gray-700 hover:border-gray-600'}`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <p className="text-sm text-gray-200 leading-snug">{task.title}</p>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >✕</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.squad_color && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.squad_color }} title={task.squad_name} />
                      )}
                      {task.agent_name && (
                        <span className="text-xs text-gray-500">🤖 {task.agent_name}</span>
                      )}
                      <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : task.priority === 'medium' ? '🔵' : '⚪'} {task.priority}
                      </span>
                    </div>
                    {task.due_date && (
                      <div className="text-xs text-gray-600 mt-1.5">{formatDate(task.due_date)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
