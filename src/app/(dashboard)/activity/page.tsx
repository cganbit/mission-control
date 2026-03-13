'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

const ACTION_ICONS: Record<string, string> = {
  task_created: '➕',
  task_moved: '📦',
  task_done: '✅',
  agent_started: '▶️',
  agent_stopped: '⏹️',
  message_sent: '💬',
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [filterSquad, setFilterSquad] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // Load initial batch + squads
  const loadInitial = useCallback(async () => {
    setLoading(true);
    const url = filterSquad
      ? `/api/activity?squad_id=${filterSquad}&limit=100`
      : '/api/activity?limit=100';
    const [actRes, squadsRes] = await Promise.all([
      fetch(url).then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    const items: Activity[] = actRes;
    seenIds.current = new Set(items.map((a: Activity) => a.id));
    setActivities(items);
    setSquads(squadsRes);
    setLoading(false);
  }, [filterSquad]);

  // SSE connection
  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const url = filterSquad
      ? `/api/activity/stream?squad_id=${filterSquad}`
      : '/api/activity/stream';

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const item: Activity = JSON.parse(e.data);
        if (!seenIds.current.has(item.id)) {
          seenIds.current.add(item.id);
          setActivities(prev => [item, ...prev].slice(0, 200));
        }
      } catch {
        // ping or malformed
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 5s
      setTimeout(connectSSE, 5000);
    };

    return es;
  }, [filterSquad]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const es = connectSSE();
    return () => {
      es.close();
      setConnected(false);
    };
  }, [connectSSE]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Feed</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-gray-400 text-sm">Atividade dos agentes</p>
            <div className="flex items-center gap-1.5">
              <div style={{ position: 'relative', width: '8px', height: '8px' }}>
                {connected && (
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    backgroundColor: '#4ade80',
                    animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite'
                  }} />
                )}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  backgroundColor: connected ? '#4ade80' : '#facc15'
                }} />
              </div>
              <span className="text-xs text-gray-500">{connected ? 'Ao vivo' : 'Reconectando...'}</span>
            </div>
          </div>
        </div>
        <select
          value={filterSquad}
          onChange={e => setFilterSquad(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="">Todos os squads</option>
          {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
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
          <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-800/30 transition-colors">
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
