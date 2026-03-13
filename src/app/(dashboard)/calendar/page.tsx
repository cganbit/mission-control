'use client';

import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#6366f1',
  low:    '#6b7280',
};

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', assigned: 'Atribuído', in_progress: 'Em Andamento',
  review: 'Revisão', done: 'Concluído',
};

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_PT   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today]    = useState(new Date());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/tasks').then(r => r.json());
    setTasks(Array.isArray(res) ? res.filter((t: Task) => t.due_date) : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build calendar grid
  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function tasksForDay(d: Date) {
    return tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), d));
  }

  const selectedTasks = selected ? tasksForDay(selected) : [];

  // Upcoming tasks (next 7 days, not done)
  const upcoming = tasks
    .filter(t => {
      const d = new Date(t.due_date);
      const diff = (d.getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= 7 && t.status !== 'done';
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  // Overdue tasks
  const overdue = tasks.filter(t => {
    const d = new Date(t.due_date);
    return d < today && !isSameDay(d, today) && t.status !== 'done';
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-gray-400 text-sm mt-1">Tarefas agendadas por data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >‹</button>
          <span className="text-white font-semibold w-40 text-center">
            {MONTHS_PT[month]} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >›</button>
          <button
            onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}
            className="ml-2 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >Hoje</button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Calendar grid */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-800">
            {DAYS_PT.map(d => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} className="min-h-[96px] border-b border-r border-gray-800/50" />;
              const dayTasks = tasksForDay(d);
              const isToday = isSameDay(d, today);
              const isSelected = selected ? isSameDay(d, selected) : false;
              const isPast = d < today && !isToday;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelected(isSelected ? null : d)}
                  className={`min-h-[96px] p-2 border-b border-r border-gray-800/50 text-left transition-colors hover:bg-gray-800/50 ${
                    isSelected ? 'bg-indigo-900/30 border-indigo-800' : ''
                  }`}
                >
                  <div className={`text-sm font-semibold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday    ? 'bg-indigo-600 text-white' :
                    isSelected ? 'text-indigo-300' :
                    isPast     ? 'text-gray-600' : 'text-gray-300'
                  }`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div key={t.id} className="flex items-center gap-1 group/task">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[t.priority] }} />
                        <span className={`text-[10px] leading-tight truncate ${t.status === 'done' ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-gray-500">+{dayTasks.length - 3} mais</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar panel */}
        <div className="space-y-4">
          {/* Selected day detail */}
          {selected && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {selected.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">Nenhuma tarefa neste dia</p>
              ) : (
                <div className="divide-y divide-gray-800">
                  {selectedTasks.map(t => (
                    <div key={t.id} className="px-4 py-3">
                      <div className="flex items-start gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[t.priority] }} />
                        <p className={`text-sm text-white leading-snug ${t.status === 'done' ? 'line-through text-gray-500' : ''}`}>{t.title}</p>
                      </div>
                      <div className="flex items-center gap-2 pl-4">
                        {t.squad_color && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.squad_color }} />}
                        <span className="text-xs text-gray-500">{t.squad_name}</span>
                        {t.agent_name && <span className="text-xs text-gray-600">· 🤖 {t.agent_name}</span>}
                      </div>
                      <div className="pl-4 mt-1">
                        <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Overdue */}
          {overdue.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-red-900/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-900/50 flex items-center gap-2">
                <span className="text-red-400 text-sm">⚠</span>
                <h3 className="text-sm font-semibold text-red-400">Atrasadas ({overdue.length})</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {overdue.slice(0, 5).map(t => (
                  <div key={t.id} className="px-4 py-2.5">
                    <p className="text-xs text-gray-300 truncate">{t.title}</p>
                    <p className="text-[10px] text-red-400 mt-0.5">
                      {new Date(t.due_date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming 7 days */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-400">Próximos 7 dias</h3>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">Nenhuma tarefa</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {upcoming.map(t => {
                  const d = new Date(t.due_date);
                  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                  return (
                    <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="text-center flex-shrink-0 w-8">
                        <div className="text-xs font-bold text-indigo-400">{d.getDate()}</div>
                        <div className="text-[9px] text-gray-600 uppercase">{MONTHS_PT[d.getMonth()].slice(0,3)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 truncate">{t.title}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `em ${diff} dias`}
                        </p>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[t.priority] }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
