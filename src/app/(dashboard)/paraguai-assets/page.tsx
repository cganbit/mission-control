'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetStatus = 'comprado' | 'em_transito' | 'em_estoque' | 'vendido' | 'cancelado';

interface Asset {
  id: number;
  fingerprint: string;
  titulo: string;
  titulo_amigavel: string;
  qty: number;
  preco_usd: number;
  fornecedor: string | null;
  data_compra: string;
  status: AssetStatus;
  preco_venda_brl: number | null;
  data_venda: string | null;
  observacoes: string | null;
  created_by: string;
  created_at: string;
  custo_total_usd: number;
  lucro_estimado_brl: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...c: any[]) { return c.filter(Boolean).join(' '); }
function fBRL(v: any) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 'R$ 0,00' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}
function fUSD(v: any) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`;
}
function fDate(d: string) {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  comprado:    '🛒 Comprado',
  em_transito: '🚚 Em Trânsito',
  em_estoque:  '📦 Em Estoque',
  vendido:     '✅ Vendido',
  cancelado:   '❌ Cancelado',
};

const STATUS_COLOR: Record<AssetStatus, string> = {
  comprado:    'bg-blue-900/40 text-blue-300 border-blue-800',
  em_transito: 'bg-amber-900/40 text-amber-300 border-amber-800',
  em_estoque:  'bg-indigo-900/40 text-indigo-300 border-indigo-800',
  vendido:     'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  cancelado:   'bg-gray-800 text-gray-500 border-gray-700',
};

const ALL_STATUS: AssetStatus[] = ['comprado', 'em_transito', 'em_estoque', 'vendido', 'cancelado'];

// ─── Modal: Novo / Editar Asset ───────────────────────────────────────────────

function AssetModal({ asset, onClose, onSaved }: {
  asset?: Asset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!asset;
  const [fingerprint, setFingerprint] = useState(asset?.fingerprint ?? '');
  const [titulo, setTitulo] = useState(asset?.titulo ?? '');
  const [qty, setQty] = useState(String(asset?.qty ?? 1));
  const [precoUsd, setPrecoUsd] = useState(String(asset?.preco_usd ?? ''));
  const [fornecedor, setFornecedor] = useState(asset?.fornecedor ?? '');
  const [dataCompra, setDataCompra] = useState(asset?.data_compra?.slice(0,10) ?? new Date().toISOString().slice(0,10));
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? 'comprado');
  const [precoVenda, setPrecoVenda] = useState(String(asset?.preco_venda_brl ?? ''));
  const [dataVenda, setDataVenda] = useState(asset?.data_venda?.slice(0,10) ?? '');
  const [obs, setObs] = useState(asset?.observacoes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true); setError('');
    try {
      const body = isEdit
        ? { id: asset!.id, status, qty: parseInt(qty), preco_usd: parseFloat(precoUsd), fornecedor: fornecedor || null,
            preco_venda_brl: precoVenda ? parseFloat(precoVenda) : null,
            data_venda: dataVenda || null, observacoes: obs || null }
        : { fingerprint: fingerprint || titulo.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,''),
            titulo, qty: parseInt(qty), preco_usd: parseFloat(precoUsd), fornecedor: fornecedor || null,
            data_compra: dataCompra, status, observacoes: obs || null };

      const res = await fetch('/api/paraguai/assets', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      onSaved();
      onClose();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500';
  const labelCls = 'text-xs text-gray-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">{isEdit ? '✏️ Editar Asset' : '➕ Registrar Compra'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!isEdit && (
            <>
              <div className="col-span-2">
                <p className={labelCls}>Produto (título)</p>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Apple AirPods Pro 3rd Gen" className={inputCls} />
              </div>
              <div className="col-span-2">
                <p className={labelCls}>Fingerprint (deixe em branco para gerar)</p>
                <input value={fingerprint} onChange={e => setFingerprint(e.target.value)} placeholder="Auto" className={inputCls} />
              </div>
            </>
          )}
          {isEdit && (
            <div className="col-span-2">
              <p className={labelCls}>Produto</p>
              <p className="text-white text-sm font-medium">{asset!.titulo_amigavel}</p>
            </div>
          )}

          <div>
            <p className={labelCls}>Qtd</p>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>Preço USD/un</p>
            <input type="number" step="0.01" value={precoUsd} onChange={e => setPrecoUsd(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>

          <div className="col-span-2">
            <p className={labelCls}>Fornecedor</p>
            <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" className={inputCls} />
          </div>

          {!isEdit && (
            <div>
              <p className={labelCls}>Data da compra</p>
              <input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} className={inputCls} />
            </div>
          )}

          <div className={isEdit ? 'col-span-2' : ''}>
            <p className={labelCls}>Status</p>
            <select value={status} onChange={e => setStatus(e.target.value as AssetStatus)} className={inputCls}>
              {ALL_STATUS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          {(status === 'vendido' || isEdit) && (
            <>
              <div>
                <p className={labelCls}>Preço de venda (BRL)</p>
                <input type="number" step="0.01" value={precoVenda} onChange={e => setPrecoVenda(e.target.value)} placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Data da venda</p>
                <input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} className={inputCls} />
              </div>
            </>
          )}

          <div className="col-span-2">
            <p className={labelCls}>Observações</p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Notas internas..." className={cn(inputCls, 'resize-none')} />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50">
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | undefined>();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    try {
      const data = await fetch(`/api/paraguai/assets?${params}`).then(r => r.json());
      setAssets(Array.isArray(data) ? data : []);
    } catch { setAssets([]); }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function deleteAsset(id: number) {
    if (!confirm('Remover este asset?')) return;
    setDeletingId(id);
    await fetch('/api/paraguai/assets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setDeletingId(null);
    load();
  }

  const filtered = assets.filter(a =>
    !search || a.titulo_amigavel.toLowerCase().includes(search.toLowerCase()) || a.fingerprint.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Stats ────────────────────────────────────────────────────────────────
  const ativos = assets.filter(a => !['vendido','cancelado'].includes(a.status));
  const totalCustoUSD = ativos.reduce((s, a) => s + (a.custo_total_usd ?? 0), 0);
  const vendidos = assets.filter(a => a.status === 'vendido');
  const totalLucro = vendidos.reduce((s, a) => s + (a.lucro_estimado_brl ?? 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📦 Controle de Assets</h1>
          <p className="text-gray-400 text-sm mt-0.5">{assets.length} registro(s) — inventário de compras</p>
        </div>
        <button onClick={() => { setEditAsset(undefined); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 flex items-center gap-2">
          ➕ Registrar Compra
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Assets ativos', value: ativos.length, sub: 'comprados / em trânsito / estoque', color: 'text-indigo-400' },
          { label: 'Custo total (USD)', value: fUSD(totalCustoUSD), sub: 'investimento em aberto', color: 'text-amber-400' },
          { label: 'Vendidos', value: vendidos.length, sub: 'unidades realizadas', color: 'text-emerald-400' },
          { label: 'Lucro realizado', value: fBRL(totalLucro), sub: 'receita − custo convertido', color: totalLucro >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</p>
            <p className={cn('text-xl font-bold mt-1', s.color)}>{s.value}</p>
            <p className="text-gray-600 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 w-64" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Todos os status</option>
          {ALL_STATUS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">📦</p>
            <p>Nenhum asset registrado ainda.</p>
            <p className="text-xs mt-1">Clique em "Registrar Compra" para começar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Qtd</th>
                <th className="px-4 py-3 text-right">Preço/un</th>
                <th className="px-4 py-3 text-right">Custo total</th>
                <th className="px-4 py-3 text-right">Venda BRL</th>
                <th className="px-4 py-3 text-right">Lucro BRL</th>
                <th className="px-4 py-3 text-left">Fornecedor</th>
                <th className="px-4 py-3 text-left">Compra</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium truncate max-w-[200px]">{a.titulo_amigavel}</p>
                    <p className="text-gray-500 text-[10px]">{a.fingerprint}</p>
                    {a.observacoes && <p className="text-gray-500 text-[10px] italic truncate max-w-[200px]">📝 {a.observacoes}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', STATUS_COLOR[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{a.qty}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{fUSD(a.preco_usd)}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-medium">{fUSD(a.custo_total_usd)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{a.preco_venda_brl ? fBRL(a.preco_venda_brl) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {a.lucro_estimado_brl != null ? (
                      <span className={a.lucro_estimado_brl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {fBRL(a.lucro_estimado_brl)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.fornecedor ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fDate(a.data_compra)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditAsset(a); setShowModal(true); }}
                        className="text-gray-400 hover:text-indigo-400 text-xs" title="Editar">✏️</button>
                      <button onClick={() => deleteAsset(a.id)} disabled={deletingId === a.id}
                        className="text-gray-400 hover:text-red-400 text-xs disabled:opacity-40" title="Remover">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <AssetModal
          asset={editAsset}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
