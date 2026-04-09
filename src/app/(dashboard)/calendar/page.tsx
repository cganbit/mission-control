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
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Calendar</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Tarefas agendadas por data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] transition-colors"
          >‹</button>
          <span className="text-[var(--text-primary)] font-semibold w-40 text-center">
            {MONTHS_PT[month]} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] transition-colors"
          >›</button>
          <button
            onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}
            className="ml-2 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] rounded-lg transition-colors"
          >Hoje</button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Calendar grid */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[var(--border)]">
            {DAYS_PT.map(d => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} className="min-h-[96px] border-b border-r border-[var(--border)]/50" />;
              const dayTasks = tasksForDay(d);
              const isToday = isSameDay(d, today);
              const isSelected = selected ? isSameDay(d, selected) : false;
              const isPast = d < today && !isToday;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelected(isSelected ? null : d)}
                  className={`min-h-[96px] p-2 border-b border-r border-[var(--border)]/50 text-left transition-colors hover:bg-[var(--bg-muted)]/50 ${
                    isSelected ? 'bg-[var(--accent-muted)] border-[var(--accent)]' : ''
                  }`}
                >
                  <div className={`text-sm font-semibold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday    ? 'bg-[var(--accent)] text-[var(--text-primary)]' :
                    isSelected ? 'text-[var(--accent)]' :
                    isPast     ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
                  }`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div key={t.id} className="flex items-center gap-1 group/task">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[t.priority] }} />
                        <span className={`text-[10px] leading-tight truncate ${t.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-[var(--text-muted)]">+{dayTasks.length - 3} mais</span>
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
            <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {selected.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm">✕</button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">Nenhuma tarefa neste dia</p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {selectedTasks.map(t => (
                    <div key={t.id} className="px-4 py-3">
                      <div className="flex items-start gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[t.priority] }} />
                        <p className={`text-sm text-[var(--text-primary)] leading-snug ${t.status === 'done' ? 'line-through text-[var(--text-muted)]' : ''}`}>{t.title}</p>
                      </div>
                      <div className="flex items-center gap-2 pl-4">
                        {t.squad_color && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.squad_color }} />}
                        <span className="text-xs text-[var(--text-muted)]">{t.squad_name}</span>
                        {t.agent_name && <span className="text-xs text-[var(--text-muted)]">· 🤖 {t.agent_name}</span>}
                      </div>
                      <div className="pl-4 mt-1">
                        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded">
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
            <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--destructive)]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--destructive)]/50 flex items-center gap-2">
                <span className="text-[var(--destructive)] text-sm">⚠</span>
                <h3 className="text-sm font-semibold text-[var(--destructive)]">Atrasadas ({overdue.length})</h3>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {overdue.slice(0, 5).map(t => (
                  <div key={t.id} className="px-4 py-2.5">
                    <p className="text-xs text-[var(--text-primary)] truncate">{t.title}</p>
                    <p className="text-[10px] text-[var(--destructive)] mt-0.5">
                      {new Date(t.due_date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming 7 days */}
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Próximos 7 dias</h3>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">Nenhuma tarefa</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {upcoming.map(t => {
                  const d = new Date(t.due_date);
                  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                  return (
                    <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="text-center flex-shrink-0 w-8">
                        <div className="text-xs font-bold text-[var(--accent)]">{d.getDate()}</div>
                        <div className="text-[9px] text-[var(--text-muted)] uppercase">{MONTHS_PT[d.getMonth()].slice(0,3)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[var(--text-primary)] truncate">{t.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
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
