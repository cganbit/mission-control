'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';

interface Job {
  id: number;
  ml_order_id: string;
  ml_shipment_id: string | null;
  seller_nickname: string | null;
  status: string;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  items_summary: string | null;
  logistic_type: string | null;
  buyer_name: string | null;
  has_label: boolean;
  qr_code_url: string | null;
}

interface FreightService {
  id: number;
  name: string;
  price: string;
  delivery_time: number;
  delivery_range: { min: number; max: number };
  error: string | null;
  adicional: string | null;
}

function isEnvioProprio(logistic: string | null): boolean {
  if (!logistic) return false;
  const lt = logistic.toLowerCase();
  return lt.includes('self_service') || lt.includes('custom') || lt === 'self_service';
}

// ─── Freight Simulation Modal ────────────────────────────────────────────────

function FreightModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [services, setServices] = useState<FreightService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toZip, setToZip] = useState('');
  const [searched, setSearched] = useState(false);

  const simulate = useCallback(async (zip?: string) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { order_id: orderId };
      if (zip) body.to_zip = zip;
      const res = await fetch('/api/melhor-envio/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro na simulacao');
      setServices(data.services ?? []);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-1 mb-4">
          <h2 className="text-base font-bold text-slate-100">Simular Frete</h2>
          <p className="text-xs text-slate-500 font-mono">Pedido #{orderId}</p>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="CEP destino (ex: 01001000)"
            maxLength={9}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            value={toZip}
            onChange={e => setToZip(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter' && toZip.length >= 8) simulate(toZip); }}
          />
          <button
            onClick={() => simulate(toZip || undefined)}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? '...' : 'Cotar'}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {searched && services.length > 0 && (
          <div className="space-y-2">
            {services.map(s => (
              <div key={s.id} className={`p-3 rounded-xl border ${s.name === 'PAC' ? 'border-emerald-700/50 bg-emerald-950/30' : 'border-blue-700/50 bg-blue-950/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{s.name}</span>
                  <span className="text-lg font-bold text-white">R$ {s.price}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-400">{s.delivery_range.min}-{s.delivery_range.max} dias uteis</span>
                  {s.adicional && (
                    <span className="text-xs text-amber-400">+R$ {s.adicional} adicional</span>
                  )}
                </div>
                {s.error && <p className="text-xs text-red-400 mt-1">{s.error}</p>}
              </div>
            ))}
          </div>
        )}

        {searched && services.length === 0 && !error && (
          <p className="text-xs text-slate-500 text-center">Nenhum servico disponivel para este CEP.</p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 border border-slate-700/50 hover:border-slate-500 hover:text-slate-100 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ url, orderId, onClose }: { url: string; orderId: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-slate-100">📱 QR Confirmar</h2>
          <p className="text-xs text-slate-500 font-mono">Pedido #{orderId}</p>
        </div>

        <div className="bg-white p-4 rounded-xl">
          <QRCodeSVG value={url} size={200} level="M" />
        </div>

        <p className="text-xs text-slate-400 text-center leading-relaxed">
          Escaneie para confirmar embalagem
        </p>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 border border-slate-700/50 hover:border-slate-500 hover:text-slate-100 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  pending: 'Pendente',
  printing: 'Imprimindo',
  done: 'Impresso',
  error: 'Erro',
};

const STATUS_COLOR: Record<string, string> = {
  queued: 'bg-slate-700 text-slate-300',
  pending: 'bg-blue-900 text-blue-300',
  printing: 'bg-amber-900 text-amber-300',
  done: 'bg-emerald-900 text-emerald-300',
  error: 'bg-red-900 text-red-400',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function PedidosMLPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState<{ url: string; orderId: string } | null>(null);
  const [freightModal, setFreightModal] = useState<string | null>(null);

  const [filterAccount, setFilterAccount] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState(sevenDaysAgo());
  const [filterTo, setFilterTo] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAccount) params.set('account', filterAccount);
    if (filterStatus) params.set('status', filterStatus);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo + 'T23:59:59');
    const res = await fetch(`/api/mercado-livre/pedidos?${params}`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs);
      setAccounts(data.accounts);
    }
    setLoading(false);
  }, [filterAccount, filterStatus, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  function downloadLabel(id: number) {
    window.open(`/api/print-queue/${id}/label`, '_blank');
  }

  async function retrigger(id: number) {
    const res = await fetch('/api/print-queue/retrigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    if (res.ok) {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'pending' } : j));
    }
  }

  const counts = {
    queued: jobs.filter(j => j.status === 'queued').length,
    pending: jobs.filter(j => j.status === 'pending' || j.status === 'printing').length,
    done: jobs.filter(j => j.status === 'done').length,
    error: jobs.filter(j => j.status === 'error').length,
  };

  return (
    <div className="p-6 space-y-6">
      {qrModal && (
        <QRModal
          url={qrModal.url}
          orderId={qrModal.orderId}
          onClose={() => setQrModal(null)}
        />
      )}
      {freightModal && (
        <FreightModal
          orderId={freightModal}
          onClose={() => setFreightModal(null)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Pedidos — Fila de Impressão</h1>
          <p className="text-sm text-slate-400 mt-0.5">Histórico de etiquetas por conta e status</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm rounded-lg transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Na fila', value: counts.queued, color: 'text-slate-300' },
          { label: 'Processando', value: counts.pending, color: 'text-blue-300' },
          { label: 'Impresso', value: counts.done, color: 'text-emerald-300' },
          { label: 'Erro', value: counts.error, color: 'text-red-400' },
        ].map(c => (
          <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Conta</label>
            <select
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
            >
              <option value="">Todas</option>
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Status</label>
            <select
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="queued">Na fila</option>
              <option value="pending">Pendente</option>
              <option value="printing">Imprimindo</option>
              <option value="done">Impresso</option>
              <option value="error">Erro</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">De</label>
            <input
              type="date"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Até</label>
            <input
              type="date"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
            />
          </div>
          <button
            onClick={load}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Nenhum pedido encontrado no período.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Pedido</th>
                <th className="text-left px-4 py-3 font-medium">Conta</th>
                <th className="text-left px-4 py-3 font-medium">Comprador</th>
                <th className="text-left px-4 py-3 font-medium">Itens</th>
                <th className="text-left px-4 py-3 font-medium">Logística</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    #{job.ml_order_id}
                  </td>
                  <td className="px-4 py-3 text-white text-xs">{job.seller_nickname ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{job.buyer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate" title={job.items_summary ?? ''}>
                    {job.items_summary ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {isEnvioProprio(job.logistic_type) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/60 text-amber-300 border border-amber-700/40">
                        Envio proprio
                      </span>
                    ) : (
                      <span className="text-slate-400">{job.logistic_type ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[job.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                    {job.status === 'error' && job.error_msg && (
                      <div className="text-xs text-red-400 mt-0.5 max-w-[150px] truncate" title={job.error_msg}>
                        {job.error_msg}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(job.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {job.has_label && (
                        <button
                          onClick={() => downloadLabel(job.id)}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors text-xs font-medium"
                          title="Baixar etiqueta PDF"
                        >
                          Etiqueta
                        </button>
                      )}
                      {job.status === 'done' && job.qr_code_url && (
                        <button
                          onClick={() => setQrModal({ url: job.qr_code_url!, orderId: job.ml_order_id })}
                          className="text-violet-400 hover:text-violet-300 transition-colors text-xs font-medium whitespace-nowrap"
                          title="Confirmar embalagem via QR Code"
                        >
                          📱 QR Confirmar
                        </button>
                      )}
                      {(job.status === 'queued' || job.status === 'error') && (
                        <button
                          onClick={() => retrigger(job.id)}
                          className="text-emerald-400 hover:text-emerald-300 transition-colors text-xs font-medium"
                          title="Recolocar na fila de impressão"
                        >
                          Reimprimir
                        </button>
                      )}
                      {isEnvioProprio(job.logistic_type) && (
                        <button
                          onClick={() => setFreightModal(job.ml_order_id)}
                          className="text-amber-400 hover:text-amber-300 transition-colors text-xs font-medium whitespace-nowrap"
                          title="Simular frete PAC/SEDEX"
                        >
                          Simular Frete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
