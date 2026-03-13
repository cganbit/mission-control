'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  last_heartbeat: string | null;
  system_prompt: string;
  tools: string;
  workflow: string;
}

interface Squad {
  id: string;
  name: string;
  description: string;
  mission: string;
  color: string;
  agent_count: number;
  active_count: number;
  task_count: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'nunca';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s atrás`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function HeartbeatDot({ lastHeartbeat }: { lastHeartbeat: string | null }) {
  if (!lastHeartbeat) return <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />;
  const diff = (Date.now() - new Date(lastHeartbeat).getTime()) / 1000;
  const color = diff < 60 ? '#22c55e' : diff < 300 ? '#f59e0b' : '#ef4444';
  return <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
}

// ─── Agent Drawer ────────────────────────────────────────────────────────────

function AgentDrawer({ agent, onClose, onSave }: {
  agent: Agent;
  onClose: () => void;
  onSave: (id: string, data: Partial<Agent>) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tokenData, setTokenData] = useState<{ tokens_total: number; cost_usd: number; byDay: { date: string; tokens_total: number }[] } | null>(null);
  const [form, setForm] = useState({
    system_prompt: agent.system_prompt ?? '',
    tools: agent.tools ?? '',
    workflow: agent.workflow ?? '',
  });

  async function handleSave() {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    onSave(agent.id, form);
    setEditing(false);
  }

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!agent.id) return;
    fetch(`/api/tokens?agent_id=${agent.id}&days=30`)
      .then(r => r.json())
      .then(d => setTokenData({
        tokens_total: Number(d.totals?.tokens_total ?? 0),
        cost_usd: Number(d.totals?.cost_usd ?? 0),
        byDay: d.byDay ?? [],
      }))
      .catch(() => {});
  }, [agent.id]);

  const workflowSteps = (agent.workflow ?? '').split('\n').filter(Boolean);
  const toolsList = (agent.tools ?? '').split(',').map(t => t.trim()).filter(Boolean);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9998, animation: 'fadeIn 0.2s ease' }}
      />
      <div style={{ position: 'fixed', right: 0, top: 0, height: '100%', width: '480px', backgroundColor: '#111827', borderLeft: '1px solid #1f2937', zIndex: 9999, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', overflow: 'hidden', animation: 'slideIn 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-800">
          <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${AGENT_STATUS_COLORS[agent.status]}`} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">{agent.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{agent.role}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.squad_color }} />
              <span className="text-xs text-gray-500">{agent.squad_name}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ml-2 ${
                agent.status === 'active' ? 'bg-green-900 text-green-300' :
                agent.status === 'idle'   ? 'bg-yellow-900 text-yellow-300' :
                'bg-red-900 text-red-300'
              }`}>
                {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Parado'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">System Prompt</h3>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs text-indigo-400 hover:text-indigo-300">Editar</button>
              )}
            </div>
            {editing ? (
              <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={6} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/50 rounded-lg p-3">
                {agent.system_prompt || <span className="text-gray-600 italic">Não definido</span>}
              </p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ferramentas</h3>
            {editing ? (
              <textarea value={form.tools} onChange={e => setForm(f => ({ ...f, tools: e.target.value }))}
                rows={4} placeholder="Ferramenta 1, Ferramenta 2, ..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            ) : (
              <div className="flex flex-col gap-2">
                {toolsList.length > 0 ? toolsList.map((tool, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 bg-gray-800/50 rounded-lg">
                    <span className="text-sm">🔧</span>
                    <span className="text-xs text-gray-300">{tool}</span>
                  </div>
                )) : <span className="text-sm text-gray-600 italic">Não definido</span>}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Fluxo de Trabalho</h3>
            {editing ? (
              <textarea value={form.workflow} onChange={e => setForm(f => ({ ...f, workflow: e.target.value }))}
                rows={8} placeholder={"1. Passo um\n2. Passo dois\n..."}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            ) : (
              <div className="space-y-2">
                {workflowSteps.length > 0 ? workflowSteps.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-indigo-300 text-xs font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-snug">{step.replace(/^\d+\.\s*/, '')}</p>
                  </div>
                )) : <span className="text-sm text-gray-600 italic">Não definido</span>}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tokens — últimos 30 dias</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total de Tokens</div>
                <div className="text-lg font-bold text-white">
                  {tokenData ? (tokenData.tokens_total >= 1000 ? `${(tokenData.tokens_total/1000).toFixed(1)}K` : tokenData.tokens_total) : '—'}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Custo Estimado</div>
                <div className="text-lg font-bold text-white">
                  {tokenData ? `$${tokenData.cost_usd.toFixed(4)}` : '—'}
                </div>
              </div>
            </div>
            {tokenData && tokenData.byDay.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">Histórico diário</div>
                <div className="flex items-end gap-0.5 h-10">
                  {(() => {
                    const maxV = Math.max(...tokenData.byDay.map(d => Number(d.tokens_total)), 1);
                    return tokenData.byDay.map(d => (
                      <div key={d.date} className="flex-1 bg-indigo-600/70 hover:bg-indigo-500 rounded-sm transition-colors"
                        title={`${d.date}: ${d.tokens_total} tokens`}
                        style={{ height: `${Math.max((Number(d.tokens_total)/maxV)*100, 4)}%` }} />
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Tarefas Abertas</div>
              <div className="text-2xl font-bold text-white">{agent.open_tasks}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Último Heartbeat</div>
              <div className="text-sm text-gray-400">
                {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleString('pt-BR') : '—'}
              </div>
            </div>
          </div>
        </div>

        {editing && (
          <div className="p-4 border-t border-gray-800 flex gap-3">
            <button onClick={handleSave} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
              Salvar
            </button>
            <button onClick={() => { setEditing(false); setForm({ system_prompt: agent.system_prompt ?? '', tools: agent.tools ?? '', workflow: agent.workflow ?? '' }); }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

// ─── View modes for Configuração tab ─────────────────────────────────────────

type ViewMode = 'list' | 'grid' | 'compact';

function AgentListView({ squads, bySquad, onSelect }: {
  squads: Squad[];
  bySquad: Record<string, Agent[]>;
  onSelect: (a: Agent) => void;
}) {
  return (
    <div className="space-y-6">
      {squads.map(squad => {
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
                <button key={agent.id} onClick={() => onSelect(agent)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/50 transition-colors text-left group">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${AGENT_STATUS_COLORS[agent.status]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm">{agent.name}</div>
                    {agent.role && <div className="text-xs text-gray-500 mt-0.5">{agent.role}</div>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {agent.tools && <span className="text-gray-600">🔧 {agent.tools.split(',').length}</span>}
                    <span>📋 {agent.open_tasks}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      agent.status === 'active' ? 'bg-green-900 text-green-300' :
                      agent.status === 'idle'   ? 'bg-yellow-900 text-yellow-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Parado'}
                    </span>
                    <span className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentGridView({ squads, bySquad, onSelect }: {
  squads: Squad[];
  bySquad: Record<string, Agent[]>;
  onSelect: (a: Agent) => void;
}) {
  return (
    <div className="space-y-6">
      {squads.map(squad => {
        const squadAgents = bySquad[squad.id] ?? [];
        return (
          <div key={squad.id}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: squad.color }} />
              <span className="text-sm font-semibold text-gray-300">{squad.name}</span>
              <span className="text-xs text-gray-600">{squadAgents.length} agentes</span>
            </div>
            {squadAgents.length === 0 ? (
              <p className="text-sm text-gray-600 px-1">Nenhum agente</p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {squadAgents.map(agent => (
                  <button key={agent.id} onClick={() => onSelect(agent)}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 hover:bg-gray-800/50 transition-all text-left group">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${AGENT_STATUS_COLORS[agent.status]}`} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        agent.status === 'active' ? 'bg-green-900/60 text-green-400' :
                        agent.status === 'idle'   ? 'bg-yellow-900/60 text-yellow-400' :
                        'bg-red-900/60 text-red-400'
                      }`}>
                        {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Stop'}
                      </span>
                    </div>
                    <div className="font-semibold text-white text-sm truncate">{agent.name}</div>
                    {agent.role && <div className="text-xs text-gray-500 mt-0.5 truncate">{agent.role}</div>}
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-600">
                      <span>📋 {agent.open_tasks}</span>
                      {agent.tools && <span>🔧 {agent.tools.split(',').length}</span>}
                    </div>
                    <div className="mt-2 text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Ver detalhes →
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentCompactView({ squads, bySquad, onSelect }: {
  squads: Squad[];
  bySquad: Record<string, Agent[]>;
  onSelect: (a: Agent) => void;
}) {
  const allAgents = squads.flatMap(s => bySquad[s.id] ?? []);
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agente</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Squad</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Papel</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarefas</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ferramentas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {allAgents.map(agent => (
            <tr key={agent.id} onClick={() => onSelect(agent)}
              className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${AGENT_STATUS_COLORS[agent.status]}`} />
                  <span className="font-medium text-white">{agent.name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const sq = squads.find(s => s.id === agent.squad_id);
                    return sq ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sq.color }} />
                        <span className="text-gray-400 text-xs truncate max-w-[120px]">{sq.name}</span>
                      </>
                    ) : null;
                  })()}
                </div>
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[140px] truncate">{agent.role || '—'}</td>
              <td className="px-4 py-2.5 text-center">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  agent.status === 'active' ? 'bg-green-900 text-green-300' :
                  agent.status === 'idle'   ? 'bg-yellow-900 text-yellow-300' :
                  'bg-red-900 text-red-300'
                }`}>
                  {agent.status === 'active' ? 'Ativo' : agent.status === 'idle' ? 'Idle' : 'Stop'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{agent.open_tasks}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 text-xs">
                {agent.tools ? agent.tools.split(',').length : 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Status ao Vivo tab ───────────────────────────────────────────────────────

function StatusTab({ agents, squads, tick }: { agents: Agent[]; squads: Squad[]; tick: number }) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [localAgents, setLocalAgents] = useState(agents);

  useEffect(() => { setLocalAgents(agents); }, [agents]);

  async function setStatus(agentId: string, status: string) {
    setUpdatingId(agentId);
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setLocalAgents(prev => prev.map(a => a.id === agentId ? { ...a, status } : a));
    setUpdatingId(null);
  }

  const totalActive  = localAgents.filter(a => a.status === 'active').length;
  const totalIdle    = localAgents.filter(a => a.status === 'idle').length;
  const totalStopped = localAgents.filter(a => a.status === 'stopped').length;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Squads',  value: squads.length, color: '#6366f1', icon: '🛡️' },
          { label: 'Ativos',  value: totalActive,   color: '#22c55e', icon: '🟢' },
          { label: 'Idle',    value: totalIdle,     color: '#f59e0b', icon: '🟡' },
          { label: 'Parados', value: totalStopped,  color: '#ef4444', icon: '🔴' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Squads */}
      <div className="space-y-4">
        {squads.map(squad => {
          const squadAgents = localAgents.filter(a => a.squad_id === squad.id);
          const activeCount = squadAgents.filter(a => a.status === 'active').length;
          return (
            <div key={squad.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-800">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: squad.color }} />
                <div className="flex-1">
                  <h2 className="font-semibold text-white">{squad.name}</h2>
                  {squad.mission && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{squad.mission}</p>}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{squadAgents.length} agentes</span>
                  {activeCount > 0 && (
                    <span className="flex items-center gap-1 text-green-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: 'ping 1.5s ease-in-out infinite' }} />
                      {activeCount} ativo{activeCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-gray-800/50">
                {squadAgents.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-600">Nenhum agente</p>
                ) : squadAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/30 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${AGENT_STATUS_COLORS[agent.status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{agent.name}</div>
                      {agent.role && <div className="text-xs text-gray-500 mt-0.5 truncate">{agent.role}</div>}
                    </div>
                    <div className="text-xs text-gray-500 w-20 text-center">
                      📋 {agent.open_tasks} tarefa{agent.open_tasks !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-1.5 w-28 text-right" key={tick}>
                      <HeartbeatDot lastHeartbeat={agent.last_heartbeat} />
                      <span className="text-xs text-gray-600">{timeAgo(agent.last_heartbeat)}</span>
                    </div>
                    <div className="flex gap-1">
                      {(['active', 'idle', 'stopped'] as const).map(s => (
                        <button key={s} disabled={updatingId === agent.id} onClick={() => setStatus(agent.id, s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            agent.status === s
                              ? s === 'active'  ? 'bg-green-900 text-green-300'
                              : s === 'idle'    ? 'bg-yellow-900 text-yellow-300'
                              : 'bg-red-900 text-red-300'
                              : 'bg-gray-800 text-gray-600 hover:text-gray-400'
                          }`}>
                          {s === 'active' ? 'Ativo' : s === 'idle' ? 'Idle' : 'Stop'}
                        </button>
                      ))}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'config' | 'status';

export default function AgentsPage() {
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [squads, setSquads]     = useState<Squad[]>([]);
  const [tab, setTab]           = useState<Tab>('config');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterSquad, setFilterSquad] = useState('');
  const [selected, setSelected] = useState<Agent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ squad_id: '', name: '', role: '', system_prompt: '' });
  const [saving, setSaving]     = useState(false);
  const [tick, setTick]         = useState(0);

  const load = useCallback(async () => {
    const [agentsRes, squadsRes] = await Promise.all([
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setAgents(Array.isArray(agentsRes) ? agentsRes : []);
    setSquads(Array.isArray(squadsRes) ? squadsRes : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tick timestamps every 10s (for heartbeat display)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

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
    await load();
  }

  function handleAgentSave(id: string, data: Partial<Agent>) {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
    setSelected(prev => prev ? { ...prev, ...data } : null);
  }

  const displaySquads = filterSquad ? squads.filter(s => s.id === filterSquad) : squads;
  const bySquad = squads.reduce<Record<string, Agent[]>>((acc, s) => {
    acc[s.id] = agents.filter(a => a.squad_id === s.id);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agentes</h1>
          <p className="text-gray-400 text-sm mt-1">{agents.length} agentes em {squads.length} squads</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
            ↻ Atualizar
          </button>
          {tab === 'config' && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
              + Novo Agente
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('config')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'config' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          🤖 Configuração
        </button>
        <button onClick={() => setTab('status')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'status' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          👥 Status ao Vivo
        </button>
      </div>

      {/* Configuração Tab */}
      {tab === 'config' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <select value={filterSquad} onChange={e => setFilterSquad(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none">
              <option value="">Todos os squads</option>
              {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* View mode toggle */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              {([
                { mode: 'list',    icon: '☰', title: 'Lista' },
                { mode: 'grid',    icon: '⊞', title: 'Grid' },
                { mode: 'compact', icon: '≡', title: 'Tabela' },
              ] as const).map(v => (
                <button key={v.mode} onClick={() => setViewMode(v.mode)} title={v.title}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${viewMode === v.mode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {v.icon}
                </button>
              ))}
            </div>
          </div>

          {/* New agent form */}
          {showForm && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Adicionar Agente</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Squad *</label>
                    <select value={form.squad_id} onChange={e => setForm(f => ({ ...f, squad_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none" required>
                      <option value="">Selecione...</option>
                      {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Nome *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Ex: Finance Agent" required />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Papel</label>
                    <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Ex: Analista Financeiro" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? 'Criando...' : 'Criar Agente'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {viewMode === 'list'    && <AgentListView    squads={displaySquads} bySquad={bySquad} onSelect={setSelected} />}
          {viewMode === 'grid'    && <AgentGridView    squads={displaySquads} bySquad={bySquad} onSelect={setSelected} />}
          {viewMode === 'compact' && <AgentCompactView squads={displaySquads} bySquad={bySquad} onSelect={setSelected} />}
        </>
      )}

      {/* Status ao Vivo Tab */}
      {tab === 'status' && (
        <StatusTab agents={agents} squads={squads} tick={tick} />
      )}

      {selected && (
        <AgentDrawer agent={selected} onClose={() => setSelected(null)} onSave={handleAgentSave} />
      )}
    </div>
  );
}
