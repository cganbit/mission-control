'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  fornecedor_nome: string;
  preco_usd: number;
  received_at: string;
}

interface PriceHistory {
  date: string;
  min_preco_usd: number;
  min_preco_ml: number | null;
}

interface CatalogOffer {
  catalog_id: string;
  url: string;
  shipping_badge: string;
  price_premium: number | null;
  price_classic: number | null;
}

interface Oportunidade {
  fingerprint: string;
  titulo_amigavel: string;
  marca: string;
  modelo: string;
  capacidade: string;
  categoria: string;
  origem: string;
  melhor_fornecedor: string;
  melhor_preco_usd: number;
  preco_ml_real: number | null;
  ml_price_premium: number | null;
  ml_price_classic: number | null;
  ml_catalogs_json: CatalogOffer[] | null;
  ml_catalog_id: string | null;
  ml_catalog_url: string | null;
  shipping_type: string | null;
  has_catalog: boolean;
  catalog_ids: string[];
  ml_source: string;
  all_suppliers: Supplier[];
  num_suppliers: number;
  ultima_atualizacao: string;
  price_history: PriceHistory[] | null;
  margem_pct: number | null;
  no_carrinho: boolean;
  monitorando: boolean;
  descricao_raw: string;
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

function formatUSD(v: any) { 
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? '$0.00' : `$${n.toFixed(2)}`; 
}
function formatBRL(v: any) { 
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 'R$ 0,00' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; 
}
function margemColor(m: number | null) {
  if (m == null) return 'text-gray-400';
  if (m >= 30) return 'text-emerald-400';
  if (m >= 20) return 'text-green-400';
  if (m >= 10) return 'text-yellow-400';
  return 'text-red-400';
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

// ─── Components ──────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", color)}>{label}</span>;
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
                      {item.margem_pct != null && <span className={cn("ml-1", margemColor(item.margem_pct))}>{item.margem_pct}%</span>}
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
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-medium transition-colors",
                        item.status === s
                          ? s === 'comprado' ? 'bg-emerald-600 text-white'
                            : s === 'descartado' ? 'bg-red-700 text-white'
                            : 'bg-indigo-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      )}>
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
            className={cn("w-10 h-6 rounded-full transition-colors", settings.whatsapp_alerts_global ? 'bg-emerald-600' : 'bg-gray-600')}>
            <div className={cn("w-4 h-4 bg-white rounded-full mx-1 transition-transform", settings.whatsapp_alerts_global ? 'translate-x-4' : '')} />
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
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');

  // Filters
  const [filterMarca, setFilterMarca] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFornecedor, setFilterFornecedor] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterMinMargem, setFilterMinMargem] = useState(0);
  const [fornecedores, setFornecedores] = useState<string[]>([]);

  const loadOportunidades = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMarca) params.set('marca', filterMarca);
    if (filterCat) params.set('categoria', filterCat);
    if (filterFornecedor) params.set('fornecedor', filterFornecedor);
    if (filterCatalog) params.set('has_catalog', filterCatalog);
    if (filterMinMargem > 0) params.set('min_margem', String(filterMinMargem));
    
    try {
      const data = await fetch(`/api/paraguai/oportunidades?${params}`).then(r => r.json());
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      
      // Extract unique suppliers for filter
      const sups = new Set<string>();
      list.forEach(item => {
        if (item.melhor_fornecedor) sups.add(item.melhor_fornecedor);
        item.all_suppliers?.forEach((s: Supplier) => sups.add(s.fornecedor_nome));
      });
      setFornecedores(Array.from(sups).sort());
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  }, [filterMarca, filterCat, filterFornecedor, filterCatalog, filterMinMargem]);

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

      {/* Filters & View Toggle */}
      <div className="flex flex-col gap-3 p-3 bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700 mr-2">
            <button 
              onClick={() => setViewMode('cards')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'cards' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300")}
              title="Cards"
            >
              📑
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300")}
              title="Lista"
            >
              ☰
            </button>
          </div>

          <select value={filterMarca} onChange={e => setFilterMarca(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Todas as marcas</option>
            {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Todas as categorias</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
          </select>

          <select value={filterFornecedor} onChange={e => setFilterFornecedor(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Todos os fornecedores</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <select value={filterCatalog} onChange={e => setFilterCatalog(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">Catálogo e estimado</option>
            <option value="true">✅ Só catálogo ML</option>
            <option value="false">⚠️ Sem catálogo</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs font-semibold">Margem mín.</span>
            <input type="number" min={0} max={100} value={filterMinMargem || ''}
              onChange={e => setFilterMinMargem(parseInt(e.target.value) || 0)}
              placeholder="0%"
              className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          <button onClick={loadOportunidades}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 shadow-md ml-auto">
            Atualizar
          </button>
        </div>
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
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => (
            <ProductCard
              key={item.fingerprint}
              item={item}
              expanded={expandedRow === item.fingerprint}
              onToggleExpand={() => setExpandedRow(prev => prev === item.fingerprint ? null : item.fingerprint)}
              onAddToCart={() => addToCart(item)}
              onToggleWatch={() => toggleWatch(item)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800/50 text-gray-400 font-semibold border-b border-gray-700">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3 text-right">Preço USD</th>
                <th className="px-4 py-3 text-right">Preço BRL</th>
                <th className="px-4 py-3 text-right">Preço ML</th>
                <th className="px-4 py-3 text-center">Margem</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {items.map(item => (
                <Fragment key={item.fingerprint}>
                  <tr 
                    className={cn(
                      "transition-all group cursor-pointer border-l-4", 
                      expandedRow === item.fingerprint 
                        ? "bg-indigo-500/5 border-indigo-500 text-white" 
                        : "hover:bg-gray-800/30 border-transparent text-gray-400"
                    )} 
                    onClick={() => setExpandedRow(prev => prev === item.fingerprint ? null : item.fingerprint)}
                  >
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <span className="text-lg flex-shrink-0">{CATEGORIA_EMOJI[item.categoria] || '📦'}</span>
                        <div className="min-w-0">
                          <p className="text-white font-medium hover:text-indigo-400 transition-colors line-clamp-1 text-left">
                            {item.titulo_amigavel}
                          </p>
                          <p className="text-gray-500 text-[10px] uppercase">{item.marca} • {item.categoria}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-300">{item.melhor_fornecedor}</span>
                      {item.num_suppliers > 1 && (
                        <span className="ml-2 bg-blue-900/40 text-blue-400 text-[10px] px-1.5 py-0.5 rounded">+{item.num_suppliers-1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-white whitespace-nowrap">
                      {formatUSD(item.melhor_preco_usd)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-gray-400 text-xs font-medium">{formatBRL(item.melhor_preco_usd * 5.80)}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {item.ml_price_classic ? (
                        <div className="flex flex-col items-end">
                          <span className="text-white font-bold">{formatBRL(item.ml_price_classic)}</span>
                          {item.ml_price_premium && <span className="text-gray-500 text-[10px]">P: {formatBRL(item.ml_price_premium)}</span>}
                          {item.has_catalog && <span className="text-emerald-500 text-[9px] font-bold uppercase">Catálogo</span>}
                        </div>
                      ) : item.preco_ml_real ? (
                        <div>
                          <span className="text-white">{formatBRL(item.preco_ml_real)}</span>
                          {item.has_catalog && <span className="ml-1 text-emerald-500 text-[9px] font-bold">CAT</span>}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className={cn("px-4 py-3 text-center font-bold", margemColor(item.margem_pct))}>
                      {item.margem_pct != null ? `${item.margem_pct}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                         <button onClick={() => toggleWatch(item)} className={cn("p-1.5 rounded transition-colors", item.monitorando ? "text-amber-400 bg-amber-900/30" : "text-gray-500 hover:text-white hover:bg-gray-700")} title="Monitorar">🔔</button>
                         <button 
                          onClick={() => addToCart(item)} 
                          disabled={item.no_carrinho}
                          className={cn("p-1.5 rounded transition-colors", item.no_carrinho ? "text-gray-700" : "text-emerald-500 hover:bg-emerald-900/30")}
                          title="Adicionar ao Carrinho"
                        >
                          🛒
                         </button>
                         <div className={cn("transition-transform duration-300 ml-2", expandedRow === item.fingerprint ? "rotate-180" : "rotate-0")}>
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-indigo-400">
                             <polyline points="6 9 12 15 18 9"></polyline>
                           </svg>
                         </div>
                      </div>
                    </td>
                  </tr>
                  {expandedRow === item.fingerprint && (
                    <tr className="bg-indigo-500/5 border-l-4 border-indigo-500">
                      <td colSpan={7} className="p-0 border-b border-gray-800">
                        <div className="py-2">
                          <ExpandedDetails item={item} variant="list" />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
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
  expanded,
  onToggleExpand,
  onAddToCart,
  onToggleWatch,
}: {
  item: Oportunidade;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddToCart: () => void;
  onToggleWatch: () => void;
}) {
  const emoji = CATEGORIA_EMOJI[item.categoria] || '📦';

  return (
    <div className={cn("bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 transition-all group", expanded ? 'border-indigo-500 shadow-2xl' : 'border-gray-800')}>
      {/* Title row */}
      <div className="flex items-start gap-2 cursor-pointer" onClick={onToggleExpand}>
        <span className="text-2xl mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight line-clamp-2 group-hover:text-indigo-400 transition-colors text-left">
            {item.titulo_amigavel}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.has_catalog && <Badge label="CATÁLOGO" color="bg-emerald-900 text-emerald-300" />}
            {!item.has_catalog && <Badge label="ESTIMADO" color="bg-yellow-900 text-yellow-400" />}
            {item.num_suppliers > 1 && (
              <Badge label={`${item.num_suppliers} fornecedores`} color="bg-blue-900 text-blue-300" />
            )}
            <Badge label={item.categoria} color="bg-gray-800 text-gray-400" />
          </div>
        </div>
        <div className={cn("transition-transform duration-300", expanded ? "rotate-180" : "rotate-0")}>
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-indigo-400">
             <polyline points="6 9 12 15 18 9"></polyline>
           </svg>
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-2 mt-1 cursor-pointer" onClick={onToggleExpand}>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-500/10 rounded-bl-full flex items-start justify-end p-1">
             <span className="text-[8px]">🇵🇾</span>
          </div>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Melhor preço USD</p>
          <p className="text-white font-black text-lg leading-none">{formatUSD(item.melhor_preco_usd)}</p>
          <p className="text-gray-400 text-[10px] mt-1 truncate italic">≈ {formatBRL(item.melhor_preco_usd * 5.80)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-800 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/10 rounded-bl-full flex items-start justify-end p-1">
             <span className="text-[8px]">🇧🇷</span>
          </div>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Preço ML (BR)</p>
          {item.ml_price_classic || item.preco_ml_real ? (
            <>
              <p className="text-white font-black text-lg leading-none">
                {formatBRL(item.ml_price_classic || item.preco_ml_real)}
              </p>
              {item.ml_price_premium && (
                <p className="text-gray-400 text-[10px] mt-0.5">Premium: {formatBRL(item.ml_price_premium)}</p>
              )}
              <p className={cn("text-[11px] font-bold mt-1", margemColor(item.margem_pct))}>
                {item.margem_pct != null ? `${item.margem_pct}% margem` : '—'}
              </p>
            </>
          ) : (
            <p className="text-gray-600 text-sm italic py-1">Sem dados</p>
          )}
        </div>
      </div>

      {/* Expanded Content (Accordion) */}
      {expanded && (
        <div className="mt-2 pt-4 border-t border-gray-800/50 animate-in fade-in slide-in-from-top-2 duration-200">
           <ExpandedDetails item={item} variant="card" />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2">
        <button
          onClick={onAddToCart}
          disabled={item.no_carrinho}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all",
            item.no_carrinho
              ? "bg-gray-800 text-gray-600 cursor-default"
              : "bg-indigo-600 text-white hover:bg-indigo-500 hover:-translate-y-0.5 active:translate-y-0"
          )}>
          {item.no_carrinho ? '✓ NO CARRINHO' : '+ CARRINHO'}
        </button>
        <button
          onClick={onToggleWatch}
          className={cn(
            "px-3.5 py-2.5 rounded-xl transition-all shadow-md",
            item.monitorando
              ? "bg-amber-800 text-amber-200 hover:bg-amber-700"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
          )}>
          {item.monitorando ? '🔔' : '🔕'}
        </button>
      </div>
    </div>
  );
}

// ─── Expanded Details (Accordion Content) ────────────────────────────────────

function ExpandedDetails({ item, variant = 'list' }: { item: Oportunidade; variant?: 'card' | 'list' }) {
  // Format dates: check if today, else normal string
  const isToday = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const formatRefDate = (dateString: string) => {
    if (!dateString) return <span className="text-gray-600">—</span>;
    const d = new Date(dateString);
    if (isToday(dateString)) {
      return (
        <span className="text-emerald-400 font-bold">
          Hoje às {d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
        </span>
      );
    }
    return <span className="text-gray-400">{d.toLocaleString('pt-BR')}</span>;
  };

  // Dual-line Trend Sparkline (SVG bounds 0-100 x 0-30)
  const renderTrend = () => {
    if (!item.price_history || item.price_history.length < 2) {
      return <div className="text-xs text-gray-600 italic h-[40px] flex items-center justify-center">Sem histórico 30d</div>;
    }

    // Convert all to BRL for comparison
    const pyPrices = item.price_history.map(h => h.min_preco_usd * 5.80 * 1.15 * 1.18);
    const mlPrices = item.price_history.map(h => h.min_preco_ml);
    
    // Get absolute min/max for scale
    const allVals = [...pyPrices, ...mlPrices.filter(v => v != null) as number[]];
    const minP = Math.min(...allVals);
    const maxP = Math.max(...allVals);
    const range = maxP - minP || 1;
    
    const getX = (i: number) => (i / (item.price_history!.length - 1)) * 100;
    const getY = (v: number) => 30 - (((v - minP) / range) * 30);

    // Filter points to only draw where we have data
    const pyPoints = pyPrices.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
    
    // For ML, we might have gaps
    const mlPoints = item.price_history
      .map((h, i) => h.min_preco_ml ? `${getX(i)},${getY(h.min_preco_ml)}` : null)
      .filter(p => p !== null)
      .join(' ');

    return (
      <div className="relative h-[60px] w-full mt-2 group">
        <svg viewBox="0 0 100 30" className="w-full h-full preserve-aspect-ratio-none overflow-visible" preserveAspectRatio="none">
          {/* Legend helper lines */}
          <line x1="0" y1={getY(minP)} x2="100" y2={getY(minP)} stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1={getY(maxP)} x2="100" y2={getY(maxP)} stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
          
          {/* Paraguai Cost Line (Indigo) */}
          <polyline
            points={pyPoints}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-sm opacity-80"
          />
          
          {/* ML Sale Price Line (Emerald) */}
          {mlPoints && (
            <polyline
              points={mlPoints}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-sm"
            />
          )}
        </svg>
        <div className="flex justify-between mt-1 text-[8px] uppercase tracking-tighter">
          <div className="flex items-center gap-1">
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
             <span className="text-gray-400">Custo PY</span>
          </div>
          <div className="flex items-center gap-1">
             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
             <span className="text-gray-400">Venda ML</span>
          </div>
        </div>
        <div className="absolute -top-4 left-0 text-[8px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 rounded px-1">Máx: {formatBRL(maxP)}</div>
        <div className="absolute -bottom-1 left-0 text-[8px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 rounded px-1">Mín: {formatBRL(minP)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-5 text-sm">
      {/* Informações Gerais */}
      <div className={cn("grid grid-cols-1 gap-12 px-8 py-4", variant === 'list' ? 'lg:grid-cols-2' : '')}>
        <div className="space-y-3 flex flex-col justify-start max-w-md">
          <div className="flex items-center gap-6 border-b border-gray-800/40 pb-2.5">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Marca</span>
            <span className="text-white font-semibold text-xs">{item.marca}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-gray-800/40 pb-2.5">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Modelo</span>
            <span className="text-white font-medium text-xs truncate">{item.modelo || '—'}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-gray-800/40 pb-2.5">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Origem</span>
            <span className="text-indigo-400 font-bold text-xs uppercase">{item.origem || '—'}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-gray-800/40 pb-2.5">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Última Ref.</span>
            <div className="text-xs">{formatRefDate(item.ultima_atualizacao)}</div>
          </div>
          <div className="flex items-center gap-6 border-b border-gray-800/40 pb-2.5 pt-2">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Fornecedor</span>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-xs">{item.melhor_fornecedor}</span>
              <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-500/30">BEST PRICE</span>
            </div>
          </div>
          {/* Descrição inline — ambas views */}
          <div className="flex items-start gap-6 border-b border-gray-800/40 pb-2.5 pt-1">
            <span className="text-gray-500 text-[10px] uppercase font-black w-24 shrink-0 tracking-widest pt-0.5">Descrição</span>
            <p className="text-gray-400 font-mono text-[10px] leading-relaxed break-words line-clamp-3">
              {item.descricao_raw || 'Não capturada.'}
            </p>
          </div>
        </div>

        {/* Tendência bloco (list — lado direito) */}
        {variant === 'list' && (
          <div className="bg-black/40 rounded-xl p-4 border border-gray-800/60 flex flex-col shadow-inner justify-between">
            <span className="text-gray-500 text-[9px] uppercase font-black tracking-[0.2em] text-center mb-2">Tendência 30 Dias (USD)</span>
            {renderTrend()}
          </div>
        )}
      </div>

      {/* Catalogs Table */}
      {item.ml_catalogs_json && item.ml_catalogs_json.length > 0 && (
        <div className="px-8 pb-6">
          <div className="bg-black/20 rounded-xl border border-gray-800/60 overflow-hidden">
             <div className="bg-gray-800/40 px-4 py-2 border-b border-gray-800/60 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                <span className="text-gray-400">📈 Comparação de Catálogos ML (Novos)</span>
                <span className="text-emerald-500">{item.ml_catalogs_json.length} catálogos encontrados</span>
             </div>
             <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800/40">
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Frete</th>
                    <th className="px-4 py-2 text-right">Premium (Total)</th>
                    <th className="px-4 py-2 text-right">Clássico (Total)</th>
                    <th className="px-4 py-2 text-center">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {item.ml_catalogs_json.map((c, i) => (
                    <tr key={c.catalog_id} className={cn("hover:bg-white/5", c.catalog_id === item.ml_catalog_id ? "bg-indigo-500/5" : "")}>
                      <td className="px-4 py-2 font-mono text-gray-400">
                        {c.catalog_id}
                        {c.catalog_id === item.ml_catalog_id && <span className="ml-2 text-[9px] bg-indigo-600 text-white px-1 rounded">Vencedor</span>}
                      </td>
                      <td className="px-4 py-2 uppercase font-bold text-[10px]">
                        <span className={cn(
                          c.shipping_badge === 'FULL' ? 'text-yellow-500' : 
                          c.shipping_badge === 'FLEX' ? 'text-indigo-400' : 'text-gray-500'
                        )}>
                          {c.shipping_badge}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-white">
                        {c.price_premium ? formatBRL(c.price_premium) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {c.price_classic ? formatBRL(c.price_classic) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">🔗</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {/* Tendência — full width (card only) */}
      {variant === 'card' && (
        <div className="px-8 pb-6">
          <div className="bg-black/40 rounded-xl p-4 border border-gray-800/60 flex flex-col shadow-inner">
            <span className="text-gray-500 text-[9px] uppercase font-black tracking-[0.2em] text-center mb-2">Tendência 30 Dias (USD)</span>
            {renderTrend()}
          </div>
        </div>
      )}
    </div>
  );
}
