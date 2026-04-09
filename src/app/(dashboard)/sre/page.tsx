'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SreCheck {
  id: number;
  service: string;
  check_name: string;
  enabled: boolean;
  last_checked_at: string | null;
  last_status: 'ok' | 'error' | 'warning' | null;
  last_error: string | null;
}

const SERVICE_ICON: Record<string, string> = {
  evolution:   '📱',
  ml_tokens:   '🔑',
  print_queue: '🖨️',
  n8n:         '⚙️',
  db:          '🗄️',
};

const SERVICE_LABEL: Record<string, string> = {
  evolution:   'WhatsApp',
  ml_tokens:   'ML Tokens',
  print_queue: 'Fila Impressão',
  n8n:         'n8n Workflow',
  db:          'Banco de Dados',
};

function HealthCard({ check, onReprocess }: { check: SreCheck, onReprocess?: (check: SreCheck) => void }) {
  const isOk      = check.last_status === 'ok';
  const isWarning = check.last_status === 'warning';
  const isError   = check.last_status === 'error';
  const isUnknown = !check.last_status;

  const border = isError   ? 'border-[var(--destructive)]/40 bg-[var(--destructive)]/5'
               : isWarning ? 'border-[var(--warning)]/40 bg-[var(--warning)]/5'
               : isOk      ? 'border-[var(--success)]/30 bg-[var(--success)]/5'
               :             'border-[var(--border)] bg-[var(--bg-surface)]';

  const dot = isError   ? 'bg-[var(--destructive)] animate-pulse'
            : isWarning ? 'bg-[var(--warning)] animate-pulse'
            : isOk      ? 'bg-[var(--success)]'
            :             'bg-[var(--text-muted)]';

  const label = isError ? 'ERROR' : isWarning ? 'WARNING' : isOk ? 'OK' : '—';
  const labelColor = isError ? 'text-[var(--destructive)]' : isWarning ? 'text-[var(--warning)]' : isOk ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]';

  const ago = check.last_checked_at
    ? (() => {
        const mins = Math.floor((Date.now() - new Date(check.last_checked_at).getTime()) / 60000);
        return mins < 1 ? 'agora' : `${mins}min atrás`;
      })()
    : 'nunca';

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 min-w-[160px] ${border}`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{SERVICE_ICON[check.service] ?? '🔧'}</span>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{SERVICE_LABEL[check.service] ?? check.service}</p>
        <p className={`text-xs font-bold mt-0.5 ${labelColor}`}>{label}</p>
      </div>
      {isError && check.last_error && (
        <p className="text-[10px] text-[var(--destructive)]/80 truncate" title={check.last_error}>{check.last_error}</p>
      )}
      {isWarning && check.last_error && (
        <p className="text-[10px] text-[var(--warning)]/80 truncate" title={check.last_error}>{check.last_error}</p>
      )}
      <div className="mt-auto flex items-end justify-between">
        <p className="text-[10px] text-[var(--text-muted)]">{ago}</p>
        {(isError || isWarning) && (
          <button
            onClick={() => onReprocess && onReprocess(check)}
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              isError
                ? 'bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/30 hover:bg-[var(--destructive)]/20'
                : 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30 hover:bg-[var(--warning)]/20'
            }`}
            title="Aciona o Agente Healer (na sua máquina local) para consertar essa falha automaticamente seguindo o playbook!"
          >
            Reprocessar
          </button>
        )}
      </div>
    </div>
  );
}

interface SreEvent {
  id: number;
  created_at: string;
  event_type: string;
  seller_nickname: string | null;
  entity_id: string | null;
  status: 'ok' | 'error';
  duration_ms: number | null;
  error_msg: string | null;
}

interface SreResponse {
  events: SreEvent[];
  has_errors_last_2h: boolean;
  total: number;
  page: number;
  per_page: number;
}

type Period = '2h' | '24h' | '7d';
type EventType = '' | 'webhook_received' | 'label_generated' | 'label_confirmed' | 'payment_received' | 'whatsapp_sent';
type Status = '' | 'ok' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `há ${days}d`;
  if (hours > 0) return `há ${hours}h`;
  if (mins > 0) return `há ${mins}min`;
  return 'agora';
}

// ─── Event Type Badge ─────────────────────────────────────────────────────────

const EVENT_TYPE_STYLES: Record<string, string> = {
  webhook_received:  'bg-[var(--info-muted)]/60 text-[var(--info)] border-[var(--info)]/50',
  label_generated:   'bg-[var(--success-muted)]/60 text-[var(--success)] border-[var(--success)]/50',
  label_confirmed:   'bg-[var(--success-muted)]/40 text-[var(--success)] border-[var(--success)]/30',
  payment_received:  'bg-[var(--warning-muted)]/60 text-[var(--warning)] border-[var(--warning)]/50',
  whatsapp_sent:     'bg-[var(--accent-muted)]/60 text-[var(--accent)] border-[var(--accent)]/50',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  webhook_received:  'Webhook',
  label_generated:   'Etiqueta Gerada',
  label_confirmed:   'Etiqueta Confirmada',
  payment_received:  'Pagamento',
  whatsapp_sent:     'WhatsApp',
};

function EventTypeBadge({ type }: { type: string }) {
  const cls = EVENT_TYPE_STYLES[type] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border-[var(--border)]';
  const label = EVENT_TYPE_LABELS[type] ?? type;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PER_PAGE = 50;

export default function SREPage() {
  const [data, setData] = useState<SreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [checks, setChecks] = useState<SreCheck[]>([]);

  const [filterType, setFilterType] = useState<EventType>('');
  const [filterStatus, setFilterStatus] = useState<Status>('');
  const [filterPeriod, setFilterPeriod] = useState<Period>('2h');
  const [filterAccount, setFilterAccount] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/sre/health');
      if (res.ok) {
        const json = await res.json();
        setChecks(json.checks ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadHealth();
    const t = setInterval(loadHealth, 30000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType) params.set('event_type', filterType);
    if (filterStatus) params.set('status', filterStatus);
    params.set('period', filterPeriod);
    if (filterAccount.trim()) params.set('seller_nickname', filterAccount.trim());
    params.set('page', String(p));
    params.set('per_page', String(PER_PAGE));
    try {
      const res = await fetch(`/api/sre/events?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterType, filterStatus, filterPeriod, filterAccount, page]);

  // Auto-refresh every 30s
  useEffect(() => {
    load();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => load(), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus, filterPeriod, filterAccount, page]);

  function handleFilter() {
    setPage(1);
    load(1);
  }

  async function handleReprocess(ev: SreEvent) {
    if (!confirm(`Reprocessar falha do evento de ${ev.event_type}?`)) return;
    try {
      await fetch('/api/sre/run-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reprocess', event_id: ev.id, service: ev.event_type })
      });
      // Force UI reload to sync visual state
      handleFilter();
    } catch {
      // MVP silence format
    }
  }

  async function handleReprocessService(check: SreCheck) {
    if (!confirm(`Reprocessar falha geral de ${SERVICE_LABEL[check.service] ?? check.service}?`)) return;
    try {
      await fetch('/api/sre/run-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reprocess', service: check.service })
      });
      loadHealth();
    } catch {
      // ignore
    }
  }

  const hasErrors = data?.has_errors_last_2h ?? false;
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">🔧 Painel SRE</h1>
          {hasErrors && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/30">
              <span className="w-2 h-2 rounded-full bg-[var(--destructive)] animate-pulse" />
              Erros nas últimas 2h
            </span>
          )}
        </div>

        {/* Service Health Cards */}
        {checks.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {checks.map(c => <HealthCard key={c.id} check={c} onReprocess={handleReprocessService} />)}
          </div>
        )}

        {/* Filters */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Tipo */}
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold block">Tipo</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as EventType)}
                className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              >
                <option value="">Todos</option>
                <option value="webhook_received">webhook_received</option>
                <option value="label_generated">label_generated</option>
                <option value="label_confirmed">label_confirmed</option>
                <option value="payment_received">payment_received</option>
                <option value="whatsapp_sent">whatsapp_sent</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold block">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as Status)}
                className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              >
                <option value="">Todos</option>
                <option value="ok">ok</option>
                <option value="error">error</option>
              </select>
            </div>

            {/* Período */}
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold block">Período</label>
              <select
                value={filterPeriod}
                onChange={e => setFilterPeriod(e.target.value as Period)}
                className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              >
                <option value="2h">2h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>

            {/* Conta */}
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold block">Conta</label>
              <input
                type="text"
                placeholder="seller_nickname"
                value={filterAccount}
                onChange={e => setFilterAccount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFilter()}
                className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors w-44"
              />
            </div>

            {/* Botão Refresh */}
            <button
              onClick={handleFilter}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/20 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>

            {total > 0 && (
              <span className="ml-auto text-xs text-[var(--text-muted)] self-end pb-0.5">
                {total} evento{total !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Hora', 'Tipo', 'Conta', 'Entidade', 'Status', 'Duração', 'Erro'].map(col => (
                    <th key={col} className="text-left text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold px-4 py-3 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <div className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-[var(--text-muted)] py-12 text-sm">
                      Nenhum evento encontrado no período.
                    </td>
                  </tr>
                ) : events.map(ev => (
                  <tr
                    key={ev.id}
                    className={`border-b transition-colors ${
                      ev.status === 'error'
                        ? 'bg-[var(--destructive)]/5 border-l-2 border-l-[var(--destructive)] border-b-[var(--border)]/50 hover:bg-[var(--destructive)]/10'
                        : 'border-b-[var(--border)]/50 hover:bg-[var(--bg-muted)]/30'
                    }`}
                  >
                    {/* Hora */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="text-xs font-mono text-[var(--text-secondary)] cursor-default"
                        title={fmtRelative(ev.created_at)}
                      >
                        {fmtTime(ev.created_at)}
                      </span>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <EventTypeBadge type={ev.event_type} />
                    </td>

                    {/* Conta */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ev.seller_nickname ? (
                        <span className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded">
                          {ev.seller_nickname}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Entidade */}
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs font-mono max-w-[160px] truncate" title={ev.entity_id ?? ''}>
                      {ev.entity_id ?? <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ev.status === 'ok' ? (
                        <span className="text-[var(--success)] text-xs font-medium">✅ ok</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--destructive)] text-xs font-medium">❌ error</span>
                          <button
                            onClick={() => handleReprocess(ev)}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--destructive)]/10 text-[var(--destructive)] border border-[var(--destructive)]/30 hover:bg-[var(--destructive)]/20 transition-colors"
                            title="Aciona o Agente Healer (na sua máquina local) para consertar essa falha automaticamente seguindo o playbook!"
                          >
                            Reprocessar
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Duração */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ev.duration_ms != null ? (
                        <span className="text-xs text-[var(--text-muted)] font-mono">{ev.duration_ms}ms</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Erro */}
                    <td className="px-4 py-3 max-w-[240px]">
                      {ev.error_msg ? (
                        <span
                          className="text-xs text-[var(--destructive)] truncate block cursor-default"
                          title={ev.error_msg}
                        >
                          {ev.error_msg.length > 60 ? ev.error_msg.slice(0, 60) + '…' : ev.error_msg}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); }}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); }}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próximo →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
