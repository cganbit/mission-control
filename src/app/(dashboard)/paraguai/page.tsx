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
  title?: string;
  url: string;
  shipping_badge?: string;
  price_premium: number | null;
  price_classic: number | null;
  is_winner?: boolean;
  seller_count?: number;
  sold_quantity?: number;
  available_quantity?: number;
  updated_at?: string;
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
  margem_premium: number | null;
  lucro_premium: number | null;
  margem_classico: number | null;
  lucro_classico: number | null;
  margem_pct: number | null;
  no_carrinho: boolean;
  monitorando: boolean;
  descricao_raw: string;
  ml_enriched_json: {
    sold_quantity?: number | null;
    rating?: string | null;
    ranking_position?: number | null;
    ranking_category?: string | null;
    best_price_seller?: string | null;
    winner_seller?: string | null;
  } | null;
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

// ─── Catalog Proxy (roda localmente na máquina do usuário — sem bloqueio de IP) ──

const CATALOG_PROXY = 'http://localhost:3099';

async function proxyHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${CATALOG_PROXY}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function proxySearchCatalog(q: string): Promise<{ catalog_id: string; title: string; price: number; url: string }[]> {
  const res = await fetch(`${CATALOG_PROXY}/search?q=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`);
  const { catalogs } = await res.json();
  return catalogs;
}

async function proxyGetCatalogPrices(catalogId: string, minPrice = 0): Promise<{
  catalog_id: string; title: string;
  price_premium: number | null; price_classic: number | null;
  seller_count: number; sold_quantity: number; available_quantity: number;
  seller_nickname: string; url: string; updated_at: string;
}> {
  const res = await fetch(`${CATALOG_PROXY}/prices?id=${catalogId}&min=${minPrice}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`);
  return res.json();
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

function NovoProdutoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [precoUsd, setPrecoUsd] = useState('');
  const [fornecedor, setFornecedor] = useState('Manual');
  const [categoria, setCategoria] = useState('smartphone');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fingerprint = titulo.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

  async function save() {
    if (!titulo.trim() || !precoUsd) { setError('Preencha título e preço.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/paraguai/produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), preco_usd: parseFloat(precoUsd), fornecedor, categoria }),
      });
      const data = await res.json();
      if (data.ok) { onSaved(); }
      else { setError(data.error || 'Erro ao salvar.'); }
    } catch { setError('Erro na requisição.'); }
    finally { setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-gray-900 border border-gray-700 rounded-xl w-[440px] p-6 space-y-4">
        <h2 className="text-white font-bold text-lg">+ Novo Produto</h2>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Título do produto</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="Apple AirPods Pro 3rd Generation" />
          {titulo && (
            <p className="text-gray-600 text-[10px] mt-1 font-mono">fingerprint: {fingerprint}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Preço USD</label>
            <input type="number" min={0} step={0.01} value={precoUsd} onChange={e => setPrecoUsd(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="150.00" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Fornecedor</label>
            <input value={fornecedor} onChange={e => setFornecedor(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Manual" />
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Categoria</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
            {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
          </select>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Cadastrar'}
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
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [normalizingId, setNormalizingId] = useState<string | null>(null);
  const [selectedForNormalize, setSelectedForNormalize] = useState<Set<string>>(new Set());
  const [batchNormalizing, setBatchNormalizing] = useState(false);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showNovoProduto, setShowNovoProduto] = useState(false);

  // Filters
  const [filterMarca, setFilterMarca] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFornecedor, setFilterFornecedor] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterMinMargem, setFilterMinMargem] = useState(0);
  const [fornecedores, setFornecedores] = useState<string[]>([]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadOportunidades = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMarca) params.set('marca', filterMarca);
    if (filterCat) params.set('categoria', filterCat);
    if (filterFornecedor) params.set('fornecedor', filterFornecedor);
    if (filterCatalog) params.set('has_catalog', filterCatalog);
    if (filterMinMargem > 0) params.set('min_margem', String(filterMinMargem));
    if (debouncedSearch) params.set('search', debouncedSearch);
    
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
  }, [filterMarca, filterCat, filterFornecedor, filterCatalog, filterMinMargem, debouncedSearch]);

  const refreshCatalog = async (fingerprint: string) => {
    try {
      setRefreshingId(fingerprint);

      const item = items.find(i => i.fingerprint === fingerprint);
      const productName = item?.titulo_amigavel
        ?? fingerprint.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      const minPrice = (item?.melhor_preco_usd ?? 0) * 4.0;

      // 1. Enqueue job on VPS
      const enqueueRes = await fetch('/api/paraguai/catalogo/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, product_name: productName, min_price: minPrice }),
      });
      if (!enqueueRes.ok) {
        alert('Erro ao criar job de refresh: ' + (await enqueueRes.text()));
        return;
      }

      // 2. Poll for completion (up to 90s, check every 3s)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`/api/paraguai/catalogo/queue?fingerprint=${fingerprint}`);
        if (statusRes.ok) {
          const { status } = await statusRes.json();
          if (status === 'done') {
            await loadOportunidades();
            return;
          }
          if (status === 'error') {
            alert('Worker reportou erro ao buscar catálogo. Verifique o terminal do proxy.');
            return;
          }
        }
      }

      alert(
        '⏳ Timeout: worker não respondeu em 90s.\n\n' +
        'Certifique-se que o worker está rodando:\n\n' +
        '  cd C:\\Users\\Bolota\\Desktop\\Wingx\\Paraguai\n' +
        '  node catalog-proxy.mjs\n\n' +
        'O worker processa automaticamente. Tente novamente.'
      );
    } catch (e: any) {
      console.error(e);
      alert('Erro: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setRefreshingId(null);
    }
  };

  const enrichCatalog = async (fingerprint: string) => {
    setEnrichingId(fingerprint);
    try {
      const res = await fetch('/api/paraguai/catalogo/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadOportunidades();
      } else {
        alert('Erro ao enriquecer: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setEnrichingId(null);
    }
  };

  const normalizeItem = async (item: Oportunidade) => {
    try {
      setNormalizingId(item.fingerprint);
      const res = await fetch('/api/paraguai/normalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: item.fingerprint, descricao_raw: item.descricao_raw }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadOportunidades();
      } else {
        alert('Erro ao normalizar: ' + (data.results?.[0]?.error || 'Erro desconhecido'));
      }
    } catch {
      alert('Erro na requisição de normalização');
    } finally {
      setNormalizingId(null);
    }
  };

  const batchNormalize = async () => {
    setBatchNormalizing(true);
    const fingerprints = Array.from(selectedForNormalize);
    try {
      const res = await fetch('/api/paraguai/normalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprints }),
      });
      const data = await res.json();
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      if (failed > 0) alert(`${fingerprints.length - failed} normalizados. ${failed} falharam.`);
      setSelectedForNormalize(new Set());
      await loadOportunidades();
    } catch {
      alert('Erro na normalização em lote');
    } finally {
      setBatchNormalizing(false);
    }
  };

  const batchRefreshCatalogs = async () => {
    setBatchRefreshing(true);
    const fingerprints = Array.from(selectedForNormalize);
    let ok = 0;
    for (const fp of fingerprints) {
      try {
        await refreshCatalog(fp);
        ok++;
      } catch { /* continue */ }
    }
    alert(`Catálogos atualizados: ${ok}/${fingerprints.length}`);
    setSelectedForNormalize(new Set());
    setBatchRefreshing(false);
  };

  const batchDelete = async () => {
    const fingerprints = Array.from(selectedForNormalize);
    if (!confirm(`Deletar ${fingerprints.length} produto(s)? Esta ação não pode ser desfeita.`)) return;
    setBatchDeleting(true);
    try {
      const res = await fetch('/api/paraguai/produto', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprints }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedForNormalize(new Set());
        await loadOportunidades();
        await loadCarrinho();
      } else {
        alert('Erro ao deletar: ' + data.error);
      }
    } catch {
      alert('Erro na requisição de delete');
    } finally {
      setBatchDeleting(false);
    }
  };

  const toggleSelectNormalize = (fingerprint: string) => {
    setSelectedForNormalize(prev => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

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
          <button onClick={() => setShowNovoProduto(true)}
            className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-600 flex items-center gap-2">
            + Produto
          </button>
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
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            <input 
              type="text" 
              placeholder="Pesquisar produto, marca ou categoria..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
            />
          </div>

          <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700 mx-2">
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
            <input type="number" min={0} max={100} value={filterMinMargem}
              onChange={e => setFilterMinMargem(parseInt(e.target.value) || 0)}
              placeholder="0%"
              className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          {selectedForNormalize.size > 0 && (
            <div className="flex items-center gap-2 pl-2 border-l border-gray-700">
              <span className="text-gray-500 text-xs font-semibold">{selectedForNormalize.size} selecionado(s)</span>
              <button
                onClick={batchNormalize}
                disabled={batchNormalizing}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Normalizar com IA"
              >
                {batchNormalizing ? '⏳' : '🤖'} Normalizar
              </button>
              <button
                onClick={batchRefreshCatalogs}
                disabled={batchRefreshing}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Buscar catálogos ML"
              >
                {batchRefreshing ? '⏳' : '⚡'} Catálogos
              </button>
              <button
                onClick={batchDelete}
                disabled={batchDeleting}
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-600 shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Deletar produtos selecionados"
              >
                {batchDeleting ? '⏳' : '🗑'} Deletar
              </button>
              <button
                onClick={() => setSelectedForNormalize(new Set())}
                className="text-gray-500 hover:text-gray-300 text-xs px-1"
                title="Limpar seleção"
              >
                ✕
              </button>
            </div>
          )}
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
              onNormalize={() => normalizeItem(item)}
              normalizing={normalizingId === item.fingerprint}
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto shadow-xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800/50 text-gray-400 font-semibold border-b border-gray-700 uppercase text-[11px] tracking-wider">
                <th className="px-3 py-3 text-center w-8">
                  <input
                    type="checkbox"
                    checked={selectedForNormalize.size === items.length && items.length > 0}
                    onChange={e => setSelectedForNormalize(e.target.checked ? new Set(items.map(i => i.fingerprint)) : new Set())}
                    className="accent-amber-500"
                  />
                </th>
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Fornecedor</th>
                <th className="px-4 py-3 text-right">Preço USD</th>
                <th className="px-4 py-3 text-right">Preço BRL</th>
                <th className="px-4 py-3 text-right">Preço ML</th>
                <th className="px-4 py-3 text-right">Margem</th>
                <th className="px-4 py-3 text-right">Lucro</th>
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
                    <td className="px-3 py-3 text-center align-middle" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedForNormalize.has(item.fingerprint)}
                        onChange={() => toggleSelectNormalize(item.fingerprint)}
                        className="accent-amber-500"
                      />
                    </td>
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
                     <td className="px-4 py-3 align-middle">
                       <span className="text-gray-300 text-[13px]">{item.melhor_fornecedor}</span>
                       {item.num_suppliers > 1 && (
                         <span className="ml-2 bg-blue-900/40 text-blue-400 text-[10px] px-1.5 py-0.5 rounded">+{item.num_suppliers-1}</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-right text-gray-300 text-[13px] align-middle whitespace-nowrap">
                       {formatUSD(item.melhor_preco_usd)}
                     </td>
                     <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                       <span className="text-gray-300 text-[13px]">{formatBRL(item.melhor_preco_usd * 5.80)}</span>
                     </td>
                     <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                       {(() => {
                         const cats = item.ml_catalogs_json;
                         const bestP = cats?.length ? Math.min(...cats.map(c => c.price_premium).filter((v): v is number => v != null)) : (item.ml_price_premium ?? null);
                         const bestC = cats?.length ? Math.min(...cats.map(c => c.price_classic).filter((v): v is number => v != null)) : (item.ml_price_classic ?? null);
                         return (
                           <div className="flex flex-col leading-[1.5]">
                             <div className="flex items-center justify-end gap-1.5 py-1">
                               <span className="text-[10px]" title="Premium">👑</span>
                               <span className="text-gray-300 text-[13px]">{bestP && isFinite(bestP) ? formatBRL(bestP) : '—'}</span>
                             </div>
                             <div className="border-t border-gray-700/20 flex items-center justify-end gap-1.5 py-1">
                               <span className="text-[10px]" title="Clássico">🏷️</span>
                               <span className="text-gray-300 text-[13px]">{bestC && isFinite(bestC) ? formatBRL(bestC) : formatBRL(item.preco_ml_real || 0)}</span>
                             </div>
                           </div>
                         );
                       })()}
                     </td>
                     <td className="px-4 py-3 text-right align-middle">
                       <div className="flex flex-col leading-[1.5]">
                         <div className="py-1">
                           <span className={cn("text-[13px]", margemColor(item.margem_premium))}>
                             {item.margem_premium != null ? `${item.margem_premium}%` : '—'}
                           </span>
                         </div>
                         <div className="border-t border-gray-700/20 py-1">
                           <span className={cn("text-[13px]", margemColor(item.margem_classico))}>
                             {item.margem_classico != null ? `${item.margem_classico}%` : '—'}
                           </span>
                         </div>
                       </div>
                     </td>
                     <td className="px-4 py-3 text-right align-middle">
                       <div className="flex flex-col leading-[1.5]">
                         <div className="py-1">
                            <span className={cn("text-[13px]", (item.lucro_premium ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {item.lucro_premium != null ? formatBRL(item.lucro_premium) : '—'}
                            </span>
                         </div>
                         <div className="border-t border-gray-700/20 py-1">
                            <span className={cn("text-[13px]", (item.lucro_classico ?? 0) >= 0 ? "text-emerald-500" : "text-red-400")}>
                              {item.lucro_classico != null ? formatBRL(item.lucro_classico) : '—'}
                            </span>
                         </div>
                       </div>
                     </td>
                     <td className="px-4 py-3 text-center align-middle">
                        <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                           <button
                             onClick={() => normalizeItem(item)}
                             disabled={normalizingId === item.fingerprint}
                             className={cn("p-1.5 rounded transition-colors", normalizingId === item.fingerprint ? "text-amber-400 bg-amber-900/30 animate-pulse" : "text-gray-500 hover:text-white hover:bg-amber-700")}
                             title="Normalizar com IA"
                           >
                             🤖
                           </button>
                           <button
                             onClick={() => refreshCatalog(item.fingerprint)}
                             disabled={refreshingId === item.fingerprint}
                             className={cn("p-1.5 rounded transition-colors", refreshingId === item.fingerprint ? "text-indigo-400 animate-pulse" : "text-indigo-400 hover:text-white hover:bg-indigo-600")}
                             title="Atualizar Catálogo (Real-Time)"
                           >
                             ⚡
                           </button>
                           <button
                             onClick={() => enrichCatalog(item.fingerprint)}
                             disabled={enrichingId === item.fingerprint || !item.ml_catalog_id}
                             className="p-1.5 rounded text-purple-400 hover:text-white hover:bg-purple-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                             title="Enriquecer com Firecrawl (sold_quantity, rating, sellers)"
                           >
                             {enrichingId === item.fingerprint ? '⏳' : '✨'}
                           </button>
                           <button onClick={() => toggleWatch(item)} className={cn("p-1.5 rounded transition-colors", item.monitorando ? "text-amber-400 bg-amber-900/30" : "text-gray-500 hover:text-white hover:bg-gray-700")} title="Monitorar">🔔</button>
                           <button 
                            onClick={() => addToCart(item)} 
                            disabled={item.no_carrinho}
                            className={cn("p-1.5 rounded transition-colors", item.no_carrinho ? "text-emerald-500 bg-emerald-900/30 cursor-not-allowed" : "text-gray-500 hover:text-white hover:bg-gray-700")} 
                            title={item.no_carrinho ? "Já no carrinho" : "Adicionar ao Carrinho"}
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
                      <td colSpan={9} className="p-0 border-b border-gray-800">
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
      {showNovoProduto && (
        <NovoProdutoModal
          onClose={() => setShowNovoProduto(false)}
          onSaved={() => { setShowNovoProduto(false); loadOportunidades(); }}
        />
      )}
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
  onNormalize,
  normalizing,
}: {
  item: Oportunidade;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddToCart: () => void;
  onToggleWatch: () => void;
  onNormalize: () => void;
  normalizing: boolean;
}) {
  const emoji = CATEGORIA_EMOJI[item.categoria] || '📦';
  const cats = item.ml_catalogs_json;
  const bestP = cats?.length ? Math.min(...cats.map(c => c.price_premium).filter((v): v is number => v != null)) : (item.ml_price_premium ?? null);
  const bestC = cats?.length ? Math.min(...cats.map(c => c.price_classic).filter((v): v is number => v != null)) : (item.ml_price_classic ?? null);
  const bestPSafe = bestP != null && isFinite(bestP) ? bestP : null;
  const bestCSafe = bestC != null && isFinite(bestC) ? bestC : null;

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
            {item.ml_catalogs_json && item.ml_catalogs_json.length > 1 && (
              <Badge label={`${item.ml_catalogs_json.length} catálogos`} color="bg-indigo-900 text-indigo-300" />
            )}
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
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-1">Canais Mercado Livre</p>
          {(item.ml_price_premium || item.ml_price_classic || item.preco_ml_real || item.ml_catalogs_json?.length) ? (
              <div className="flex flex-col leading-[1.5]">
               {/* Premium row */}
               <div className="flex items-center justify-between py-2">
                 <div className="flex flex-col text-left">
                   <div className="flex items-center gap-1.5">
                     <span className="text-gray-300 text-[13px]">{formatBRL(bestPSafe ?? item.preco_ml_real ?? 0)}</span>
                     <span className="text-xs" title="Premium">👑</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className={cn("text-[13px]", margemColor(item.margem_premium))}>
                     {item.margem_premium != null ? `${item.margem_premium}%` : '—'}
                   </span>
                   <span className={cn("text-[11px] mt-0.5", (item.lucro_premium ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                     {item.lucro_premium != null ? formatBRL(item.lucro_premium) : '—'}
                   </span>
                 </div>
               </div>

               {/* Classic row */}
               <div className="flex items-center justify-between py-2 border-t border-gray-700/20">
                 <div className="flex flex-col text-left">
                   <div className="flex items-center gap-1.5">
                     <span className="text-gray-300 text-[13px]">{formatBRL(bestCSafe ?? item.preco_ml_real ?? 0)}</span>
                     <span className="text-xs" title="Clássico">🏷️</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className={cn("text-[13px]", margemColor(item.margem_classico))}>
                     {item.margem_classico != null ? `${item.margem_classico}%` : '—'}
                   </span>
                   <span className={cn("text-[11px] mt-0.5", (item.lucro_classico ?? 0) >= 0 ? "text-emerald-500/80" : "text-red-400/80")}>
                     {item.lucro_classico != null ? formatBRL(item.lucro_classico) : '—'}
                   </span>
                 </div>
               </div>
             </div>
          ) : (
            <div className="bg-gray-900/30 rounded p-4 border border-dashed border-gray-800 text-center">
              <p className="text-gray-600 text-xs italic">Nenhum dado do Mercado Livre disponível</p>
            </div>
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
          onClick={onNormalize}
          disabled={normalizing}
          className={cn(
            "px-3.5 py-2.5 rounded-xl transition-all shadow-md",
            normalizing ? "bg-amber-900 text-amber-300 animate-pulse" : "bg-gray-800 text-gray-400 hover:bg-amber-700 hover:text-white"
          )}
          title="Normalizar com IA">
          🤖
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
  const [chartCurrency, setChartCurrency] = useState<'BRL' | 'USD'>('BRL');

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

  // Trend Sparkline — custo histórico + referências ML horizontais (só quando catálogo buscado)
  const renderTrend = () => {
    if (!item.price_history || item.price_history.length < 2) {
      return <div className="text-xs text-gray-600 italic h-[40px] flex items-center justify-center">Sem histórico 30d</div>;
    }

    const cambio = 5.80;
    const isBRL = chartCurrency === 'BRL';
    const fmt = isBRL ? formatBRL : (v: any) => `$${parseFloat(v).toFixed(2)}`;

    // Apenas custo do fornecedor como linha histórica
    const pyPrices = item.price_history.map(h =>
      isBRL ? h.min_preco_usd * cambio * 1.15 * 1.18 : h.min_preco_usd
    );

    // Referências ML horizontais — só se catálogo foi buscado (has_catalog = true)
    const hasCatalog = item.has_catalog;
    const cats = item.ml_catalogs_json;
    const rawClassic = hasCatalog
      ? (cats?.length ? Math.min(...cats.map(c => c.price_classic).filter((v): v is number => v != null && isFinite(v))) : (item.ml_price_classic ?? null))
      : null;
    const rawPremium = hasCatalog
      ? (cats?.length ? Math.min(...cats.map(c => c.price_premium).filter((v): v is number => v != null && isFinite(v))) : (item.ml_price_premium ?? null))
      : null;
    const classicRef = rawClassic != null && isFinite(rawClassic) ? (isBRL ? rawClassic : rawClassic / cambio) : null;
    const premiumRef = rawPremium != null && isFinite(rawPremium) ? (isBRL ? rawPremium : rawPremium / cambio) : null;

    // Escala incluindo referências ML se existirem
    const allVals = [
      ...pyPrices,
      ...(classicRef != null ? [classicRef] : []),
      ...(premiumRef != null ? [premiumRef] : []),
    ];
    const minP = Math.min(...allVals);
    const maxP = Math.max(...allVals);
    const range = maxP - minP || 1;

    const getX = (i: number) => (i / (item.price_history!.length - 1)) * 100;
    const getY = (v: number) => 30 - (((v - minP) / range) * 30);

    const pyPoints = pyPrices.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

    return (
      <div>
        <div className="flex justify-end mb-1">
          <div className="flex bg-gray-800 rounded-md p-0.5 border border-gray-700">
            {(['BRL', 'USD'] as const).map(cur => (
              <button key={cur} onClick={() => setChartCurrency(cur)}
                className={cn("text-[9px] font-bold px-2 py-0.5 rounded transition-colors",
                  chartCurrency === cur ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300")}>
                {cur}
              </button>
            ))}
          </div>
        </div>
        <div className="relative h-[60px] w-full group">
          <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            {/* Grid lines */}
            <line x1="0" y1={getY(minP)} x2="100" y2={getY(minP)} stroke="#2a2a2a" strokeWidth="0.4" strokeDasharray="2,2" />
            <line x1="0" y1={getY(maxP)} x2="100" y2={getY(maxP)} stroke="#2a2a2a" strokeWidth="0.4" strokeDasharray="2,2" />

            {/* ML Clássico — referência horizontal (Emerald), só se catálogo buscado */}
            {classicRef != null && (
              <line x1="0" y1={getY(classicRef)} x2="100" y2={getY(classicRef)}
                stroke="#10b981" strokeWidth="1" strokeDasharray="4,2" opacity="0.7" />
            )}
            {/* ML Premium — referência horizontal (Amber), só se catálogo buscado */}
            {premiumRef != null && (
              <line x1="0" y1={getY(premiumRef)} x2="100" y2={getY(premiumRef)}
                stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,2" opacity="0.7" />
            )}

            {/* Custo Fornecedor — linha histórica (Indigo) */}
            <polyline points={pyPoints} fill="none" stroke="#6366f1" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          </svg>

          <div className="flex gap-3 mt-1 text-[8px] uppercase tracking-tighter">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              <span className="text-gray-400">Custo PY</span>
            </div>
            {classicRef != null && (
              <div className="flex items-center gap-1">
                <div className="w-3 border-t border-dashed border-emerald-500" />
                <span className="text-gray-400">ML Clássico {fmt(classicRef)}</span>
              </div>
            )}
            {premiumRef != null && (
              <div className="flex items-center gap-1">
                <div className="w-3 border-t border-dashed border-amber-500" />
                <span className="text-gray-400">ML Premium {fmt(premiumRef)}</span>
              </div>
            )}
          </div>
          <div className="absolute -top-4 left-0 text-[8px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 rounded px-1">Máx: {fmt(maxP)}</div>
          <div className="absolute -bottom-1 left-0 text-[8px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 rounded px-1">Mín: {fmt(minP)}</div>
        </div>
        {!hasCatalog && (
          <p className="text-[9px] text-gray-600 italic text-center mt-1">Clique ⚡ para ver referências ML no gráfico</p>
        )}
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
          <div className="bg-black/20 rounded-xl border border-gray-800/60 overflow-x-auto">
             <div className="bg-gray-800/40 px-4 py-2 border-b border-gray-800/60 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                <span className="text-gray-400">📈 Comparação de Catálogos ML (Novos)</span>
                <span className="text-emerald-500">{item.ml_catalogs_json.length} catálogos encontrados</span>
             </div>
             <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800/40">
                    <th className="px-4 py-2">Catálogo</th>
                    <th className="px-4 py-2">Frete</th>
                    <th className="px-4 py-2 text-right">Premium 👑 (Lucro)</th>
                    <th className="px-4 py-2 text-right">Clássico 🏷️ (Lucro)</th>
                    <th className="px-4 py-2 text-right">Vendedores</th>
                    <th className="px-4 py-2 text-right">Vendidos</th>
                    <th className="px-4 py-2 text-center">Atualizado</th>
                    <th className="px-4 py-2 text-center">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {item.ml_catalogs_json.map((c) => {
                    const isWinner = c.is_winner || c.catalog_id === item.ml_catalog_id;
                    const isFull = isWinner && c.price_premium != null;
                    const updatedDaysAgo = c.updated_at
                      ? Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000)
                      : null;
                    return (
                      <tr key={c.catalog_id} className={cn("hover:bg-white/5", isWinner ? "bg-indigo-500/5" : "")}>
                        <td className="px-4 py-2 max-w-[180px]">
                          <div className="flex flex-col gap-0.5">
                            {c.title && <span className="text-white text-[11px] line-clamp-1">{c.title}</span>}
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-gray-500 text-[9px]">{c.catalog_id}</span>
                              {isWinner && <span className="text-[8px] bg-indigo-600 text-white px-1 py-0.5 rounded font-bold">PRINCIPAL</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 uppercase font-bold text-[10px]">
                          <span className={isFull ? 'text-yellow-400' : 'text-gray-500'}>
                            {isFull ? 'FULL' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex flex-col items-end">
                             <span className="font-bold text-white">{c.price_premium ? formatBRL(c.price_premium) : '—'}</span>
                             {c.price_premium && (
                               <span className={cn("text-[9px]", ((c.price_premium * 0.82) - (item.melhor_preco_usd * 6 * 1.6)) >= 0 ? "text-emerald-400" : "text-red-400")}>
                                 {formatBRL((c.price_premium * 0.82) - (item.melhor_preco_usd * 6 * 1.6))}
                               </span>
                             )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex flex-col items-end">
                             <span className="text-gray-300">{c.price_classic ? formatBRL(c.price_classic) : '—'}</span>
                             {c.price_classic && (
                               <span className={cn("text-[9px]", ((c.price_classic * 0.84) - (item.melhor_preco_usd * 6 * 1.6)) >= 0 ? "text-emerald-500" : "text-red-500")}>
                                 {formatBRL((c.price_classic * 0.84) - (item.melhor_preco_usd * 6 * 1.6))}
                               </span>
                             )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          {c.seller_count != null ? c.seller_count : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          {c.sold_quantity != null ? c.sold_quantity.toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-2 text-center text-[10px]">
                          {updatedDaysAgo === 0
                            ? <span className="text-emerald-400">Hoje</span>
                            : updatedDaysAgo != null
                            ? <span className="text-gray-500">{updatedDaysAgo}d atrás</span>
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">🔗</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {/* Enriched Data (Firecrawl) */}
      {item.ml_enriched_json && (
        <div className="px-8 pb-2">
          <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
            {item.ml_enriched_json.sold_quantity != null && (
              <span>📦 {item.ml_enriched_json.sold_quantity.toLocaleString('pt-BR')}+ vendidos</span>
            )}
            {item.ml_enriched_json.rating && (
              <span>⭐ {item.ml_enriched_json.rating}</span>
            )}
            {item.ml_enriched_json.ranking_position != null && (
              <span>🏆 {item.ml_enriched_json.ranking_position}º em {item.ml_enriched_json.ranking_category}</span>
            )}
            {item.ml_enriched_json.best_price_seller && (
              <span>💰 Melhor preço: {item.ml_enriched_json.best_price_seller}</span>
            )}
            {item.ml_enriched_json.winner_seller && item.ml_enriched_json.winner_seller !== item.ml_enriched_json.best_price_seller && (
              <span>🥇 Winner: {item.ml_enriched_json.winner_seller}</span>
            )}
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
