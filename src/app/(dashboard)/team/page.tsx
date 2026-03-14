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
  last_heartbeat: string | null;
  system_prompt: string;
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

export default function TeamPage() {
  const [squads, setSquads]   = useState<Squad[]>([]);
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [tick, setTick]       = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [agentsRes, squadsRes] = await Promise.all([
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setAgents(Array.isArray(agentsRes) ? agentsRes : []);
    setSquads(Array.isArray(squadsRes) ? squadsRes : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh timestamps every 10s
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(agentId: string, status: string) {
    setUpdatingId(agentId);
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status } : a));
    setUpdatingId(null);
  }

  const totalActive = agents.filter(a => a.status === 'active').length;
  const totalIdle   = agents.filter(a => a.status === 'idle').length;
  const totalStopped = agents.filter(a => a.status === 'stopped').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-gray-400 text-sm mt-1">Status ao vivo de todos os squads e agentes</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
          ↻ Atualizar
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Squads',   value: squads.length,  color: '#6366f1', icon: '🛡️' },
          { label: 'Ativos',   value: totalActive,    color: '#22c55e', icon: '🟢' },
          { label: 'Idle',     value: totalIdle,      color: '#f59e0b', icon: '🟡' },
          { label: 'Parados',  value: totalStopped,   color: '#ef4444', icon: '🔴' },
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
      <div className="space-y-6">
        {squads.map(squad => {
          const squadAgents = agents.filter(a => a.squad_id === squad.id);
          const activeCount = squadAgents.filter(a => a.status === 'active').length;
          return (
            <div key={squad.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              {/* Squad header */}
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-800">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: squad.color }} />
                <div className="flex-1">
                  <h2 className="font-semibold text-white">{squad.name}</h2>
                  {squad.mission && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{squad.mission}</p>
                  )}
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

              {/* Agents grid */}
              <div className="divide-y divide-gray-800/50">
                {squadAgents.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-600">Nenhum agente</p>
                ) : squadAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/30 transition-colors">
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${AGENT_STATUS_COLORS[agent.status]}`} />

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{agent.name}</div>
                      {agent.role && <div className="text-xs text-gray-500 mt-0.5 truncate">{agent.role}</div>}
                    </div>

                    {/* Tasks */}
                    <div className="text-xs text-gray-500 w-20 text-center">
                      📋 {agent.open_tasks} tarefa{agent.open_tasks !== 1 ? 's' : ''}
                    </div>

                    {/* Heartbeat */}
                    <div className="flex items-center gap-1.5 w-28 text-right" key={tick}>
                      <HeartbeatDot lastHeartbeat={agent.last_heartbeat} />
                      <span className="text-xs text-gray-600">{timeAgo(agent.last_heartbeat)}</span>
                    </div>

                    {/* Status toggle */}
                    <div className="flex gap-1">
                      {(['active', 'idle', 'stopped'] as const).map(s => (
                        <button
                          key={s}
                          disabled={updatingId === agent.id}
                          onClick={() => setStatus(agent.id, s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            agent.status === s
                              ? s === 'active'  ? 'bg-green-900 text-green-300'
                              : s === 'idle'    ? 'bg-yellow-900 text-yellow-300'
                              : 'bg-red-900 text-red-300'
                              : 'bg-gray-800 text-gray-600 hover:text-gray-400'
                          }`}
                        >
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
