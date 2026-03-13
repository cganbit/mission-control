'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate } from '@/lib/utils';

interface Activity {
  id: string;
  action: string;
  detail: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
  timestamp: string;
}

interface Squad { id: string; name: string }

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [filterSquad, setFilterSquad] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filterSquad
      ? `/api/activity?squad_id=${filterSquad}&limit=100`
      : '/api/activity?limit=100';
    const [actRes, squadsRes] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setActivities(actRes);
    setSquads(squadsRes);
    setLoading(false);
  }, [filterSquad]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const ACTION_ICONS: Record<string, string> = {
    task_created: '➕',
    task_moved: '📦',
    task_done: '✅',
    agent_started: '▶️',
    agent_stopped: '⏹️',
    message_sent: '💬',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <p className="text-gray-400 text-sm mt-1">Atividade em tempo real de todos os agentes</p>
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
            onClick={load}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
        {loading ? (
          <div className="text-center text-gray-500 py-12">Carregando...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">⚡</div>
            <p>Nenhuma atividade registrada ainda</p>
          </div>
        ) : activities.map(a => (
          <div key={a.id} className="flex items-start gap-4 px-5 py-4">
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.squad_color ?? '#6366f1' }} />
              <span className="text-base">{ACTION_ICONS[a.action] ?? '📝'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200">{a.detail}</div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                {a.squad_name && <span>{a.squad_name}</span>}
                {a.agent_name && <><span>·</span><span>🤖 {a.agent_name}</span></>}
                <span>·</span>
                <span>{formatDate(a.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
