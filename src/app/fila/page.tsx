'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface Job {
  id: number;
  ml_order_id: string;
  ml_shipment_id: string | null;
  seller_nickname: string;
  status: 'queued' | 'pending' | 'printing' | 'done' | 'error' | 'confirmed';
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  items_summary: string | null;
  logistic_type: string | null;
  buyer_name: string | null;
  has_label: boolean;
  token: string | null;
  qr_code_url: string | null;
}

type Tab = 'queued' | 'processing' | 'done' | 'error' | 'confirmed';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

const STATUS_BADGE: Record<Job['status'], string> = {
  queued:    'bg-indigo-900/60 text-indigo-300 border border-indigo-700',
  pending:   'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
  printing:  'bg-purple-900/60 text-purple-300 border border-purple-700',
  done:      'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
  error:     'bg-red-900/60 text-red-300 border border-red-700',
  confirmed: 'bg-teal-900/60 text-teal-300 border border-teal-700',
};

const STATUS_LABEL: Record<Job['status'], string> = {
  queued:    'Pendente',
  pending:   'Na fila',
  printing:  'Imprimindo',
  done:      'Impresso',
  error:     'Erro',
  confirmed: 'Confirmado',
};

function translateLogistic(lt: string | null): string {
  if (!lt) return '';
  const v = lt.toLowerCase();
  if (v === 'fulfillment') return 'Full';
  if (['xd_drop_off', 'drop_off', 'cross_docking'].includes(v)) return 'Mercado Envios';
  if (['self_service', 'custom'].includes(v)) return 'Envio próprio';
  if (['me1', 'flex'].includes(v)) return 'Flex';
  if (v === 'melhor_envio') return 'Melhor Envio';
  if (v === 'turbo') return 'Turbo';
  return lt;
}

const STATUS_ICON: Record<Job['status'], string> = {
  queued:    '🕐',
  pending:   '⏳',
  printing:  '🖨️',
  done:      '✅',
  error:     '❌',
  confirmed: '📦',
};

function FilaContent() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key') ?? '';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<Tab>('queued');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [activating, setActivating] = useState(false);
  const [reprinting, setReprinting] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [clearModal, setClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const url = `/api/print-queue/manage${key ? `?key=${key}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) { setInvalid(true); setLoading(false); return; }
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setCountdown(5);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [key]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c <= 1 ? 5 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const queued     = jobs.filter(j => j.status === 'queued');
  const processing = jobs.filter(j => j.status === 'pending' || j.status === 'printing');
  const done       = jobs.filter(j => j.status === 'done');
  const errors     = jobs.filter(j => j.status === 'error');
  const confirmed  = jobs.filter(j => j.status === 'confirmed');

  const tabJobs: Record<Tab, Job[]> = { queued, processing, done, error: errors, confirmed };
  const visible = tabJobs[tab];

  const allVisibleSelected = visible.length > 0 && visible.every(j => selected.has(j.id));

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(j => j.id)));
  }

  function toggleJob(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleActivate() {
    if (!selected.size) return;
    setActivating(true);
    try {
      await fetch(`/api/print-queue/manage${key ? `?key=${key}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setSelected(new Set());
      setTab('processing');
      await fetchJobs();
    } finally {
      setActivating(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selected.size) return;
    setDeleting(true);
    try {
      await fetch(`/api/print-queue/manage${key ? `?key=${key}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action: 'delete' }),
      });
      setSelected(new Set());
      setDeleteModal(false);
      await fetchJobs();
    } finally {
      setDeleting(false);
    }
  }

  async function handleClearQueue() {
    setClearing(true);
    try {
      await fetch(`/api/print-queue${key ? `?key=${key}` : ''}`, { method: 'DELETE' });
      setClearModal(false);
      await fetchJobs();
    } finally {
      setClearing(false);
    }
  }

  async function handleReprint(jobId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setReprinting(jobId);
    try {
      await fetch(`/api/print-queue/manage${key ? `?key=${key}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [jobId], action: 'reprint' }),
      });
      setTab('queued');
      await fetchJobs();
    } finally {
      setReprinting(null);
    }
  }

  // ─── Invalid ───────────────────────────────────────────────────────────────
  if (invalid) {
    return (
      <div style={{ minHeight: '100svh' }} className="bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-red-900/50 rounded-3xl p-10 text-center max-w-sm w-full shadow-2xl">
          <div className="text-6xl mb-5">🔑</div>
          <h1 className="text-xl font-bold text-red-400 mb-3">Link inválido</h1>
          <p className="text-slate-500 text-base">Este link é inválido ou expirou.</p>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100svh' }} className="bg-slate-950 p-4 max-w-2xl mx-auto">
        <div className="h-16 bg-slate-800 rounded-2xl animate-pulse mt-6 mb-3" />
        <div className="h-12 bg-slate-800 rounded-2xl animate-pulse mb-4" />
        {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-900 rounded-2xl animate-pulse mb-3" />)}
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'queued',     label: 'Pendentes',   count: queued.length,     color: 'indigo' },
    { id: 'processing', label: 'Processando', count: processing.length, color: 'yellow' },
    { id: 'done',       label: 'Impressos',   count: done.length,       color: 'emerald' },
    { id: 'confirmed',  label: 'Confirmados', count: confirmed.length,  color: 'teal' },
    { id: 'error',      label: 'Erros',       count: errors.length,     color: 'red' },
  ];

  const tabActive: Record<string, string> = {
    indigo:  'bg-indigo-600 text-white',
    yellow:  'bg-yellow-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    red:     'bg-red-600 text-white',
    teal:    'bg-teal-600 text-white',
  };

  return (
    <div style={{ minHeight: '100svh' }} className="bg-slate-950 text-slate-100">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-2xl mx-auto px-4 pt-safe-top" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl">
                🖨️
              </div>
              <div>
                <h1 className="font-bold text-lg text-white leading-tight">Fila de Impressão</h1>
                <p className="text-xs text-slate-500">{jobs.length} pedido{jobs.length !== 1 ? 's' : ''} · 48h</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-800/80 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400 tabular-nums">{countdown}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto">
          <div className="flex px-4 pb-3 gap-2 overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSelected(new Set()); }}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  tab === t.id
                    ? tabActive[t.color]
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}>
                {t.label}
                {t.count > 0 && (
                  <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    tab === t.id ? 'bg-white/25 text-white' : 'bg-slate-700 text-slate-300'
                  } ${t.id === 'processing' && tab !== 'processing' ? 'animate-pulse' : ''}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pb-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${selected.size > 0 ? '100px' : '24px'})` }}>

        {/* Selecionar todos */}
        {visible.length > 0 && (
          <div className="flex items-center gap-3 py-4 border-b border-slate-800/60">
            <button onClick={toggleAll}
              className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                allVisibleSelected
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'border-slate-600 bg-slate-800'
              }`}>
              {allVisibleSelected && <span className="text-white text-xs font-bold">✓</span>}
            </button>
            <span className="text-sm text-slate-400">Selecionar todos ({visible.length})</span>
            {selected.size > 0 && (
              <span className="ml-auto text-xs text-indigo-400 font-medium">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {/* Empty state */}
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-600">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-base font-medium">Nenhum pedido aqui</p>
            <p className="text-sm mt-1">Atualiza em {countdown}s</p>
          </div>
        )}

        {/* Job list — desktop grid, mobile lista */}
        <div className="mt-3 space-y-2.5 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          {visible.map(job => {
            const isSelected = selected.has(job.id);
            return (
              <div key={job.id}
                onClick={() => toggleJob(job.id)}
                className={`relative rounded-2xl border p-4 transition-all cursor-pointer active:scale-[0.98] ${
                  isSelected
                    ? 'border-indigo-500/60 bg-indigo-950/40 shadow-lg shadow-indigo-500/10'
                    : 'border-slate-800/80 bg-slate-900/80 hover:border-slate-700'
                }`}>

                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-800'
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-base text-white leading-tight">#{job.ml_order_id}</span>
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${STATUS_BADGE[job.status]}`}>
                        {STATUS_LABEL[job.status]}
                      </span>
                    </div>

                    {/* Comprador + conta */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {job.buyer_name && (
                        <p className="text-sm text-slate-300 truncate">{job.buyer_name}</p>
                      )}
                      <p className="text-xs text-slate-500 truncate">{job.seller_nickname}</p>
                    </div>

                    {/* Produtos */}
                    {job.items_summary && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{job.items_summary}</p>
                    )}

                    {/* Frete */}
                    {job.logistic_type && (
                      <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {translateLogistic(job.logistic_type)}
                      </span>
                    )}

                    {job.error_msg && (
                      <div className="mt-2 px-3 py-2 bg-red-950/50 rounded-xl border border-red-900/40">
                        <p className="text-xs text-red-400 line-clamp-2">{job.error_msg}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                      <p className="text-xs text-slate-600">{timeAgo(job.created_at)}</p>
                      <div className="flex items-center gap-1.5">
                        {/* Baixar etiqueta (done ou confirmed com label) */}
                        {(job.status === 'done' || job.status === 'confirmed') && job.has_label && (
                          <a
                            href={`/api/print-queue/${job.id}/label${key ? `?key=${key}` : ''}`}
                            target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                          >
                            ⬇ Etiqueta
                          </a>
                        )}
                        {/* Confirmar QR (done com qr_code_url) */}
                        {job.status === 'done' && job.qr_code_url && (
                          <a
                            href={job.qr_code_url}
                            target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-900/50 border border-teal-700/60 text-teal-400 hover:text-teal-200 hover:border-teal-500 transition-all"
                          >
                            📷 Confirmar QR
                          </a>
                        )}
                        {/* Reimprimir (done ou error) */}
                        {(job.status === 'done' || job.status === 'error') && (
                          <button
                            onClick={e => handleReprint(job.id, e)}
                            disabled={reprinting === job.id}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/50 border border-indigo-700/60 text-indigo-400 hover:text-indigo-200 hover:border-indigo-500 disabled:opacity-50 transition-all"
                          >
                            {reprinting === job.id ? '⏳' : '🔄 Reimprimir'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal — Confirmar limpeza da fila */}
      {clearModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="text-4xl">🗑️</div>
              <h2 className="text-base font-bold text-white">Limpar fila?</h2>
              <p className="text-sm text-slate-400">
                Isso vai deletar <span className="font-bold text-red-400">{queued.length} item{queued.length !== 1 ? 's' : ''}</span> pendente{queued.length !== 1 ? 's' : ''} da fila.
                <br />Itens impressos não serão afetados.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setClearModal(false)}
                disabled={clearing}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearQueue}
                disabled={clearing}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {clearing ? <span className="animate-spin">⏳</span> : '🗑'} Deletar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Confirmar delete selecionados */}
      {deleteModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="text-4xl">🗑️</div>
              <h2 className="text-base font-bold text-white">Remover da fila?</h2>
              <p className="text-sm text-slate-400">
                <span className="font-bold text-red-400">{selected.size} item{selected.size !== 1 ? 's' : ''}</span> {selected.size === 1 ? 'será removido' : 'serão removidos'} da fila de impressão.
                <br /><span className="text-slate-500">Os pedidos continuam disponíveis na aba de Pedidos.</span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? <span className="animate-spin">⏳</span> : '🗑'} Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex gap-3">
            {tab === 'queued' && (
              <button onClick={handleActivate} disabled={activating}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-60 text-white font-bold rounded-2xl text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ height: '56px' }}>
                {activating
                  ? <><span className="animate-spin">⏳</span> Enviando...</>
                  : <>🖨️ Imprimir {selected.size}</>
                }
              </button>
            )}
            <button onClick={() => setDeleteModal(true)}
              className={`${tab === 'queued' ? 'w-16' : 'flex-1'} bg-red-600/80 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-2xl text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2`}
              style={{ height: '56px' }}>
              {tab === 'queued' ? '🗑' : <>🗑 Remover {selected.size}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FilaPage() {
  return (
    <Suspense>
      <FilaContent />
    </Suspense>
  );
}
