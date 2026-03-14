'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Memory {
  id: string;
  agent_id: string;
  squad_id: string;
  content: string;
  category: string;
  tags: string;
  source: string;
  created_at: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
}

interface Agent { id: string; name: string; squad_id: string }
interface Squad { id: string; name: string; color: string }

const CATEGORIES = ['general', 'fact', 'preference', 'rule', 'observation', 'decision'];

const CATEGORY_COLORS: Record<string, string> = {
  general:     'bg-gray-700 text-gray-300',
  fact:        'bg-blue-900 text-blue-300',
  preference:  'bg-purple-900 text-purple-300',
  rule:        'bg-yellow-900 text-yellow-300',
  observation: 'bg-teal-900 text-teal-300',
  decision:    'bg-orange-900 text-orange-300',
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return 'agora';
  if (diff < 3600) return `${Math.floor(diff/60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
  return `${Math.floor(diff/86400)}d atrás`;
}

export default function MemoryPage() {
  const [memories, setMemories]   = useState<Memory[]>([]);
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [squads, setSquads]       = useState<Squad[]>([]);
  const [search, setSearch]       = useState('');
  const [filterAgent, setFilterAgent]   = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ squad_id: '', agent_id: '', content: '', category: 'general', tags: '', source: '' });
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = search) => {
    const p = new URLSearchParams();
    if (q)           p.set('q', q);
    if (filterAgent) p.set('agent_id', filterAgent);
    if (filterCat)   p.set('category', filterCat);
    const [mems, ags, sqs] = await Promise.all([
      fetch(`/api/memories?${p}`).then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setMemories(Array.isArray(mems) ? mems : []);
    setAgents(Array.isArray(ags) ? ags : []);
    setSquads(Array.isArray(sqs) ? sqs : []);
  }, [search, filterAgent, filterCat]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(val), 300);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, agent_id: form.agent_id || undefined }),
    });
    setForm({ squad_id: '', agent_id: '', content: '', category: 'general', tags: '', source: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Apagar esta memória?')) return;
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
  }

  const squadAgents = agents.filter(a => a.squad_id === form.squad_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Memory</h1>
          <p className="text-gray-400 text-sm mt-1">Memórias e conhecimento dos agentes</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nova Memória
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar em todas as memórias..."
            className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none">
          <option value="">Todos os agentes</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Nova Memória</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Squad *</label>
                <select value={form.squad_id}
                  onChange={e => setForm(f => ({ ...f, squad_id: e.target.value, agent_id: '' }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none" required>
                  <option value="">Selecione...</option>
                  {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agente</label>
                <select value={form.agent_id}
                  onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                  disabled={!form.squad_id}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none disabled:opacity-50">
                  <option value="">Sem agente específico</option>
                  {squadAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Categoria</label>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Conteúdo *</label>
              <textarea value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={3} required
                placeholder="O que o agente deve lembrar..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tags</label>
                <input value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="ex: produto, margem, fornecedor"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fonte</label>
                <input value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="ex: n8n workflow, WhatsApp"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Salvar Memória'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>{memories.length} memória{memories.length !== 1 ? 's' : ''}</span>
        {search && <span>· filtrado por "{search}"</span>}
      </div>

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 py-20 text-center">
          <div className="text-4xl mb-3">🧠</div>
          <p className="text-gray-400 text-sm">Nenhuma memória encontrada</p>
          <p className="text-gray-600 text-xs mt-1">Use POST /api/memories para registrar via agentes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memories.map(m => (
            <div key={m.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 group hover:border-gray-700 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${CATEGORY_COLORS[m.category] ?? CATEGORY_COLORS.general}`}>
                      {m.category}
                    </span>
                    {m.agent_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.squad_color ?? '#6366f1' }} />
                        🤖 {m.agent_name}
                      </span>
                    )}
                    {!m.agent_name && m.squad_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.squad_color ?? '#6366f1' }} />
                        {m.squad_name}
                      </span>
                    )}
                    {m.source && (
                      <span className="text-xs text-gray-600">via {m.source}</span>
                    )}
                    <span className="text-xs text-gray-600 ml-auto">{timeAgo(m.created_at)}</span>
                  </div>
                  {/* Content */}
                  <p className="text-sm text-gray-200 leading-relaxed">{m.content}</p>
                  {/* Tags */}
                  {m.tags && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {m.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-gray-700 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                  title="Apagar memória"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
