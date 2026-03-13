'use client';

import { useState, useEffect, useCallback } from 'react';
import { AGENT_STATUS_COLORS } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  squad_id: string;
  squad_name: string;
  squad_color: string;
  open_tasks: number;
  last_heartbeat: string;
}

interface Squad { id: string; name: string; color: string }

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [filterSquad, setFilterSquad] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ squad_id: '', name: '', role: '', system_prompt: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const url = filterSquad ? `/api/agents?squad_id=${filterSquad}` : '/api/agents';
    const [agentsRes, squadsRes] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setAgents(agentsRes);
    setSquads(squadsRes);
  }, [filterSquad]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ squad_id: '', name: '', role: '', system_prompt: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  // Group by squad
  const bySquad = squads.reduce<Record<string, Agent[]>>((acc, s) => {
    acc[s.id] = agents.filter(a => a.squad_id === s.id);
    return acc;
  }, {});

  const displaySquads = filterSquad ? squads.filter(s => s.id === filterSquad) : squads;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agentes</h1>
          <p className="text-gray-400 text-sm mt-1">Todos os agentes por squad</p>
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
            + Novo Agente
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Adicionar Agente</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Squad *</label>
                <select
                  value={form.squad_id}
                  onChange={e => setForm(f => ({ ...f, squad_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none"
                  required
                >
                  <option value="">Selecione...</option>
                  {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Finance Agent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Papel</label>
                <input
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ex: Analista Financeiro"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">System Prompt</label>
              <textarea
                value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Prompt do sistema (opcional)..."
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Criando...' : 'Criar Agente'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Agents by squad */}
      <div className="space-y-6">
        {displaySquads.map(squad => {
          const squadAgents = bySquad[squad.id] ?? [];
          return (
            <div key={squad.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: squad.color }} />
                <h2 className="font-semibold text-white">{squad.name}</h2>
                <span className="text-xs text-gray-500 ml-1">{squadAgents.length} agentes</span>
              </div>
              <div className="divide-y divide-gray-800">
                {squadAgents.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-500">Nenhum agente neste squad</p>
                ) : squadAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${AGENT_STATUS_COLORS[agent.status]}`} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">{agent.name}</div>
                      {agent.role && <div className="text-xs text-gray-500 mt-0.5">{agent.role}</div>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>📋 {agent.open_tasks} tarefas</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        agent.status === 'active' ? 'bg-green-900 text-green-300' :
                        agent.status === 'idle' ? 'bg-yellow-900 text-yellow-300' :
                        'bg-red-900 text-red-300'
                      }`}>
                        {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Parado'}
                      </span>
                    </div>
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
