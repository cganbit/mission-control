'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Squad {
  id: string;
  name: string;
  description: string;
  mission: string;
  color: string;
  agent_count: number;
  open_tasks: number;
  sprint_count: number;
  total_tasks: number;
  done_tasks: number;
  created_at: string;
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', mission: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/squads');
    setSquads(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/squads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ name: '', description: '', mission: '', color: '#6366f1' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Deletar este squad? Todos os agentes e tarefas serão removidos.')) return;
    await fetch(`/api/squads/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Squads</h1>
          <p className="text-gray-400 text-sm mt-1">Cada squad é um projeto/cliente isolado</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Novo Squad
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Criar Squad</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Paraguai Arbitrage Engine"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cor</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c, borderColor: form.color === c ? 'white' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Descrição</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Breve descrição do projeto"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Missão</label>
              <textarea
                value={form.mission}
                onChange={e => setForm(f => ({ ...f, mission: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Qual o objetivo principal deste squad?"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Criando...' : 'Criar Squad'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Squads grid */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Carregando...</div>
      ) : squads.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">🛡️</div>
          <p>Nenhum squad criado ainda.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">
            Criar primeiro squad →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {squads.map(squad => (
            <div key={squad.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: squad.color }} />
                  <h3 className="font-semibold text-white text-sm">{squad.name}</h3>
                </div>
                <button
                  onClick={() => handleDelete(squad.id)}
                  className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>

              {squad.description && (
                <p className="text-gray-400 text-xs mb-3 line-clamp-2">{squad.description}</p>
              )}

              <div className="flex gap-4 text-xs text-gray-500 mb-3">
                <span>🤖 {squad.agent_count} agentes</span>
                <span>📋 {squad.open_tasks} abertas</span>
                {squad.sprint_count > 0 && <span>🏃 {squad.sprint_count} sprints</span>}
              </div>

              {Number(squad.total_tasks) > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progresso geral</span>
                    <span className="font-semibold text-gray-300">
                      {Math.round(Number(squad.done_tasks) / Number(squad.total_tasks) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.round(Number(squad.done_tasks) / Number(squad.total_tasks) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">{squad.done_tasks}/{squad.total_tasks} tasks concluídas</p>
                </div>
              )}

              <Link
                href={`/squads/${squad.id}`}
                className="block w-full text-center py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
              >
                Ver Squad →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
