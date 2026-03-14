'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  fornecedor_nome: string;
  preco_usd: number;
  received_at: string;
}

interface Oportunidade {
  fingerprint: string;
  titulo_amigavel: string;
  marca: string;
  modelo: string;
  capacidade: string;
  categoria: string;
  melhor_fornecedor: string;
  melhor_preco_usd: number;
  preco_ml_real: number | null;
  has_catalog: boolean;
  catalog_ids: string[];
  ml_source: string;
  all_suppliers: Supplier[];
  num_suppliers: number;
  ultima_atualizacao: string;
  margem_pct: number | null;
  no_carrinho: boolean;
  monitorando: boolean;
}

interface CarrinhoItem {
  id: number;
  fingerprint: string;
  titulo_amigavel: string;
  categoria: string;
  fornecedor_nome: string;
  preco_usd: number;
  preco_ml_real: number | null;
  has_catalog: boolean;
  margem_pct: number | null;
  qty: number;
  status: string;
  added_by: string;
  added_at: string;
}

interface Settings {
  whatsapp_number: string;
  whatsapp_alerts_global: boolean;
  min_margem: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MARCAS = ['Apple','Samsung','Motorola','Xiaomi','Sony','LG','Lenovo','Huawei','DJI','Anker','JLab','Beats','Garmin'];
const CATEGORIAS = ['smartphone','tablet','notebook','audio','wearable','drone','console','acessorio','informatica'];

const CATEGORIA_EMOJI: Record<string, string> = {
  smartphone:'📱', tablet:'📟', notebook:'💻', audio:'🎧',
  wearable:'⌚', drone:'🛸', console:'🎮', acessorio:'🔌', informatica:'🖥️',
};

function formatUSD(v: number) { return `$${v.toFixed(2)}`; }
function formatBRL(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }
function margemColor(m: number | null) {
  if (m == null) return 'text-gray-400';
  if (m >= 30) return 'text-emerald-400';
  if (m >= 20) return 'text-green-400';
  if (m >= 10) return 'text-yellow-400';
  return 'text-red-400';
}

// ─── Components ──────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${color}`}>{label}</span>;
}

function CarrinhoDrawer({
  items,
  onClose,
  onUpdateQty,
  onUpdateStatus,
  onRemove,
}: {
  items: CarrinhoItem[];
  onClose: () => void;
  onUpdateQty: (id: number, qty: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
  onRemove: (id: number) => void;
}) {
  const totalUSD = items.reduce((s, i) => s + i.preco_usd * i.qty, 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-[480px] bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold text-lg">🛒 Lista de Compras</h2>
            <p className="text-gray-400 text-xs">{items.length} produto(s) — {formatUSD(totalUSD)} total</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <p className="text-gray-500 text-center mt-10">Carrinho vazio</p>
          )}
          {items.map(item => (
            <div key={item.id} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.titulo_amigavel}</p>
                  <p className="text-gray-400 text-xs">{item.fornecedor_nome} — {formatUSD(item.preco_usd)}/un</p>
                  {item.preco_ml_real && (
                    <p className="text-xs mt-0.5">
                      ML: {formatBRL(item.preco_ml_real)}
                      {item.has_catalog && <span className="ml-1 text-emerald-400 font-semibold">CATÁLOGO</span>}
                      {item.margem_pct != null && <span className={`ml-1 ${margemColor(item.margem_pct)}`}>{item.margem_pct}%</span>}
                    </p>
                  )}
                </div>
                <button onClick={() => onRemove(item.id)} className="text-gray-600 hover:text-red-400 text-sm">🗑</button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateQty(item.id, Math.max(1, item.qty - 1))}
                    className="w-6 h-6 rounded bg-gray-700 text-white text-xs hover:bg-gray-600">−</button>
                  <span className="text-white text-sm w-6 text-center">{item.qty}</span>
                  <button onClick={() => onUpdateQty(item.id, item.qty + 1)}
                    className="w-6 h-6 rounded bg-gray-700 text-white text-xs hover:bg-gray-600">+</button>
                </div>
                <span className="text-gray-400 text-xs">= {formatUSD(item.preco_usd * item.qty)}</span>
                <div className="ml-auto flex gap-1">
                  {['pendente','comprado','descartado'].map(s => (
                    <button key={s} onClick={() => onUpdateStatus(item.id, s)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                        item.status === s
                          ? s === 'comprado' ? 'bg-emerald-600 text-white'
                            : s === 'descartado' ? 'bg-red-700 text-white'
                            : 'bg-indigo-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total estimado</span>
            <span className="text-white font-bold">{formatUSD(totalUSD)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Com impostos (15%)</span>
            <span>≈ {formatBRL(totalUSD * 5.80 * 1.15)}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>({ whatsapp_number: '', whatsapp_alerts_global: true, min_margem: 20 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/paraguai/settings').then(r => r.json()).then(d => {
      if (d && !d.error) setSettings(d);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/paraguai/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-gray-900 border border-gray-700 rounded-xl w-[400px] p-6 space-y-4">
        <h2 className="text-white font-bold text-lg">⚙️ Configurações de Alertas</h2>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Número WhatsApp (ex: 5511961975664)</label>
          <input value={settings.whatsapp_number}
            onChange={e => setSettings(s => ({ ...s, whatsapp_number: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="5511999999999" />
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Margem mínima para alertas automáticos (%)</label>
          <input type="number" min={0} max={100} value={settings.min_margem}
            onChange={e => setSettings(s => ({ ...s, min_margem: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setSettings(s => ({ ...s, whatsapp_alerts_global: !s.whatsapp_alerts_global }))}
            className={`w-10 h-6 rounded-full transition-colors ${settings.whatsapp_alerts_global ? 'bg-emerald-600' : 'bg-gray-600'}`}>
            <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${settings.whatsapp_alerts_global ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-gray-300 text-sm">Alertas automáticos via WhatsApp</span>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParaguaiPage() {
  const [items, setItems] = useState<Oportunidade[]>([]);
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCarrinho, setShowCarrinho] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Filters
  const [filterMarca, setFilterMarca] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterMinMargem, setFilterMinMargem] = useState(0);

  const loadOportunidades = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMarca) params.set('marca', filterMarca);
    if (filterCat) params.set('categoria', filterCat);
    if (filterCatalog) params.set('has_catalog', filterCatalog);
    if (filterMinMargem > 0) params.set('min_margem', String(filterMinMargem));
    const data = await fetch(`/api/paraguai/oportunidades?${params}`).then(r => r.json());
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterMarca, filterCat, filterCatalog, filterMinMargem]);

  const loadCarrinho = useCallback(async () => {
    const data = await fetch('/api/paraguai/carrinho').then(r => r.json());
    setCarrinho(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { loadOportunidades(); }, [loadOportunidades]);
  useEffect(() => { loadCarrinho(); }, [loadCarrinho]);

  async function addToCart(item: Oportunidade) {
    await fetch('/api/paraguai/carrinho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: item.fingerprint,
        titulo_amigavel: item.titulo_amigavel,
        categoria: item.categoria,
        fornecedor_nome: item.melhor_fornecedor,
        preco_usd: item.melhor_preco_usd,
        preco_ml_real: item.preco_ml_real,
        has_catalog: item.has_catalog,
        margem_pct: item.margem_pct,
      }),
    });
    await loadCarrinho();
    setItems(prev => prev.map(i => i.fingerprint === item.fingerprint ? { ...i, no_carrinho: true } : i));
  }

  async function toggleWatch(item: Oportunidade) {
    if (item.monitorando) {
      await fetch('/api/paraguai/watches', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: item.fingerprint }),
      });
      setItems(prev => prev.map(i => i.fingerprint === item.fingerprint ? { ...i, monitorando: false } : i));
    } else {
      const res = await fetch('/api/paraguai/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprint: item.fingerprint,
          titulo_amigavel: item.titulo_amigavel,
          preco_usd_referencia: item.melhor_preco_usd,
        }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setItems(prev => prev.map(i => i.fingerprint === item.fingerprint ? { ...i, monitorando: true } : i));
    }
  }

  async function updateCarrinhoQty(id: number, qty: number) {
    await fetch(`/api/paraguai/carrinho/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty }),
    });
    setCarrinho(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }

  async function updateCarrinhoStatus(id: number, status: string) {
    await fetch(`/api/paraguai/carrinho/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (status !== 'pendente') {
      setCarrinho(prev => prev.filter(i => i.id !== id));
    } else {
      setCarrinho(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    }
  }

  async function removeFromCart(id: number) {
    await fetch(`/api/paraguai/carrinho/${id}`, { method: 'DELETE' });
    setCarrinho(prev => prev.filter(i => i.id !== id));
    await loadOportunidades();
  }

  const pendentes = carrinho.filter(i => i.status === 'pendente');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🇵🇾 Oportunidades Paraguai</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {loading ? 'Carregando...' : `${items.length} produto(s) encontrado(s)`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(true)}
            className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 flex items-center gap-2">
            ⚙️ Alertas
          </button>
          <button onClick={() => setShowCarrinho(true)}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 flex items-center gap-2">
            🛒 Carrinho
            {pendentes.length > 0 && (
              <span className="bg-white text-indigo-700 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendentes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 p-3 bg-gray-900 rounded-xl border border-gray-800">
        <select value={filterMarca} onChange={e => setFilterMarca(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">Todas as marcas</option>
          {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
        </select>

        <select value={filterCatalog} onChange={e => setFilterCatalog(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">Catálogo e estimado</option>
          <option value="true">✅ Só catálogo ML</option>
          <option value="false">⚠️ Sem catálogo</option>
        </select>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">Margem mín.</span>
          <input type="number" min={0} max={100} value={filterMinMargem || ''}
            onChange={e => setFilterMinMargem(parseInt(e.target.value) || 0)}
            placeholder="0%"
            className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white text-center" />
        </div>

        <button onClick={loadOportunidades}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 ml-auto">
          Atualizar
        </button>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-4 h-48 animate-pulse border border-gray-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400">Nenhuma oportunidade encontrada.</p>
          <p className="text-gray-600 text-sm mt-1">Aguardando listas de fornecedores via WhatsApp.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => (
            <ProductCard
              key={item.fingerprint}
              item={item}
              onAddToCart={() => addToCart(item)}
              onToggleWatch={() => toggleWatch(item)}
            />
          ))}
        </div>
      )}

      {showCarrinho && (
        <CarrinhoDrawer
          items={pendentes}
          onClose={() => setShowCarrinho(false)}
          onUpdateQty={updateCarrinhoQty}
          onUpdateStatus={updateCarrinhoStatus}
          onRemove={removeFromCart}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  item,
  onAddToCart,
  onToggleWatch,
}: {
  item: Oportunidade;
  onAddToCart: () => void;
  onToggleWatch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const emoji = CATEGORIA_EMOJI[item.categoria] || '📦';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-700 transition-colors">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <span className="text-2xl mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight line-clamp-2">
            {item.titulo_amigavel}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {item.has_catalog && <Badge label="CATÁLOGO" color="bg-emerald-900 text-emerald-300" />}
            {!item.has_catalog && <Badge label="ESTIMADO" color="bg-yellow-900 text-yellow-400" />}
            {item.num_suppliers > 1 && (
              <Badge label={`${item.num_suppliers} fornecedores`} color="bg-blue-900 text-blue-300" />
            )}
            <Badge label={item.categoria} color="bg-gray-800 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800 rounded-lg p-2">
          <p className="text-gray-500 text-[10px] uppercase tracking-wide">Melhor preço PY</p>
          <p className="text-white font-bold">{formatUSD(item.melhor_preco_usd)}</p>
          <p className="text-gray-400 text-[11px] truncate">{item.melhor_fornecedor}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-2">
          <p className="text-gray-500 text-[10px] uppercase tracking-wide">Preço ML</p>
          {item.preco_ml_real ? (
            <>
              <p className="text-white font-bold">{formatBRL(item.preco_ml_real)}</p>
              <p className={`text-[11px] font-semibold ${margemColor(item.margem_pct)}`}>
                {item.margem_pct != null ? `${item.margem_pct}% margem` : '—'}
              </p>
            </>
          ) : (
            <p className="text-gray-500 text-sm">Sem dados</p>
          )}
        </div>
      </div>

      {/* Suppliers expand */}
      {item.num_suppliers > 1 && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-gray-300 text-left">
          {expanded ? '▲ Ocultar fornecedores' : `▼ Ver todos ${item.num_suppliers} fornecedores`}
        </button>
      )}
      {expanded && item.all_suppliers && (
        <div className="space-y-1">
          {item.all_suppliers.map((s, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-400">{s.fornecedor_nome}</span>
              <span className="text-gray-300 font-medium">{formatUSD(s.preco_usd)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={onAddToCart}
          disabled={item.no_carrinho}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            item.no_carrinho
              ? 'bg-gray-700 text-gray-500 cursor-default'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}>
          {item.no_carrinho ? '✓ No carrinho' : '+ Carrinho'}
        </button>
        <button
          onClick={onToggleWatch}
          title={item.monitorando ? 'Cancelar monitoramento' : 'Monitorar preço via WhatsApp'}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
            item.monitorando
              ? 'bg-amber-700 text-amber-200 hover:bg-amber-600'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
          }`}>
          {item.monitorando ? '🔔' : '🔕'}
        </button>
      </div>
    </div>
  );
}
