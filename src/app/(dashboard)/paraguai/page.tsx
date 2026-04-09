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

interface CatalogEnriched {
  sold_quantity?: number | null;
  rating?: string | null;
  review_count?: number | null;
  seller_count_fc?: number | null;
  min_price_brl?: number | null;
  ranking_position?: number | null;
  ranking_category?: string | null;
  best_price_seller?: string | null;
  winner_seller?: string | null;
  sellers?: ({ name: string; price: number | null } | string)[];  // suporta formato antigo (string) e novo ({name,price})
  enriched_at?: string | null;
}

interface CatalogOffer {
  catalog_id: string;
  title?: string;
  url: string;
  shipping_badge?: string;
  price_premium: number | null;
  price_classic: number | null;
  price_winner?: number | null;
  price_winner_type?: 'classic' | 'premium' | null;
  is_winner?: boolean;
  is_manual?: boolean;
  seller_count?: number;
  sold_quantity?: number;
  available_quantity?: number;
  updated_at?: string;
  has_full?: boolean;
  enriched?: CatalogEnriched;
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
  if (m == null) return 'text-[var(--text-secondary)]';
  if (m >= 30) return 'text-[var(--success)]';
  if (m >= 20) return 'text-[var(--success)]';
  if (m >= 10) return 'text-[var(--warning)]';
  return 'text-[var(--destructive)]';
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
  cambio,
}: {
  items: CarrinhoItem[];
  onClose: () => void;
  onUpdateQty: (id: number, qty: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
  onRemove: (id: number) => void;
  cambio: number;
}) {
  const totalUSD = items.reduce((s, i) => s + i.preco_usd * i.qty, 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-[480px] bg-[var(--bg-base)] border-l border-[var(--border-default)] flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <div>
            <h2 className="text-[var(--text-primary)] font-bold text-lg">🛒 Lista de Compras</h2>
            <p className="text-[var(--text-secondary)] text-xs">{items.length} produto(s) — {formatUSD(totalUSD)} total</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <p className="text-[var(--text-muted)] text-center mt-10">Carrinho vazio</p>
          )}
          {items.map(item => (
            <div key={item.id} className="bg-[var(--bg-surface)] rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-primary)] text-sm font-medium truncate">{item.titulo_amigavel}</p>
                  <p className="text-[var(--text-secondary)] text-xs">{item.fornecedor_nome} — {formatUSD(item.preco_usd)}/un</p>
                  {item.preco_ml_real && (
                    <p className="text-xs mt-0.5">
                      ML: {formatBRL(item.preco_ml_real)}
                      {item.has_catalog && <span className="ml-1 text-[var(--success)] font-semibold">CATÁLOGO</span>}
                      {item.margem_pct != null && <span className={cn("ml-1", margemColor(item.margem_pct))}>{item.margem_pct}%</span>}
                    </p>
                  )}
                </div>
                <button onClick={() => onRemove(item.id)} className="text-[var(--text-muted)] hover:text-[var(--destructive)] text-sm">🗑</button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateQty(item.id, Math.max(1, item.qty - 1))}
                    className="w-6 h-6 rounded bg-[var(--bg-muted)] text-[var(--text-primary)] text-xs hover:bg-white/10">−</button>
                  <span className="text-[var(--text-primary)] text-sm w-6 text-center">{item.qty}</span>
                  <button onClick={() => onUpdateQty(item.id, item.qty + 1)}
                    className="w-6 h-6 rounded bg-[var(--bg-muted)] text-[var(--text-primary)] text-xs hover:bg-white/10">+</button>
                </div>
                <span className="text-[var(--text-secondary)] text-xs">= {formatUSD(item.preco_usd * item.qty)}</span>
                <div className="ml-auto flex gap-1">
                  {['pendente','comprado','descartado'].map(s => (
                    <button key={s} onClick={() => onUpdateStatus(item.id, s)}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-medium transition-colors",
                        item.status === s
                          ? s === 'comprado' ? 'bg-[var(--accent)] text-white'
                            : s === 'descartado' ? 'bg-[var(--destructive)] text-white'
                            : 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-white/10'
                      )}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--border-default)] p-4">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Total estimado</span>
            <span className="text-[var(--text-primary)] font-bold">{formatUSD(totalUSD)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
            <span>Com impostos (15%)</span>
            <span>≈ {formatBRL(totalUSD * cambio * 1.15)}</span>
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
      <div className="relative z-10 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl w-[400px] p-6 space-y-4">
        <h2 className="text-[var(--text-primary)] font-bold text-lg">⚙️ Configurações de Alertas</h2>

        <div>
          <label className="text-[var(--text-secondary)] text-xs mb-1 block">Número WhatsApp (ex: 5511961975664)</label>
          <input value={settings.whatsapp_number}
            onChange={e => setSettings(s => ({ ...s, whatsapp_number: e.target.value }))}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
            placeholder="5511999999999" />
        </div>

        <div>
          <label className="text-[var(--text-secondary)] text-xs mb-1 block">Margem mínima para alertas automáticos (%)</label>
          <input type="number" min={0} max={100} value={settings.min_margem}
            onChange={e => setSettings(s => ({ ...s, min_margem: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setSettings(s => ({ ...s, whatsapp_alerts_global: !s.whatsapp_alerts_global }))}
            className={cn("w-10 h-6 rounded-full transition-colors", settings.whatsapp_alerts_global ? 'bg-[var(--accent)]' : 'bg-[var(--bg-muted)]')}>
            <div className={cn("w-4 h-4 bg-white rounded-full mx-1 transition-transform", settings.whatsapp_alerts_global ? 'translate-x-4' : '')} />
          </button>
          <span className="text-[var(--text-secondary)] text-sm">Alertas automáticos via WhatsApp</span>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-muted)] text-[var(--text-secondary)] text-sm hover:bg-white/10">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Shared catalog URL list input ────────────────────────────────────────────
function CatalogUrlList({ urls, onChange }: { urls: string[]; onChange: (urls: string[]) => void }) {
  function update(i: number, val: string) { const n = [...urls]; n[i] = val; onChange(n); }
  function add() { onChange([...urls, '']); }
  function remove(i: number) { onChange(urls.filter((_, j) => j !== i)); }
  const extractId = (u: string) => { const m = u.match(/\/p\/(MLB\d+)|^(MLB\d+)$/i); return m ? (m[1] || m[2]) : null; };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[var(--text-secondary)] text-xs">URLs de Catálogos ML <span className="text-[var(--text-muted)]">(opcional)</span></label>
        <button type="button" onClick={add} className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-xs">+ URL</button>
      </div>
      {urls.map((u, i) => {
        const id = extractId(u);
        return (
          <div key={i} className="flex gap-2 items-center">
            <div className="flex-1">
              <input value={u} onChange={e => update(i, e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
                placeholder="https://www.mercadolivre.com.br/p/MLB..." />
              {id && <p className="text-[var(--accent)] text-[10px] mt-0.5 font-mono">{id}</p>}
              {u && !id && <p className="text-[var(--warning)] text-[10px] mt-0.5">URL inválida</p>}
            </div>
            <button type="button" onClick={() => remove(i)} className="text-[var(--text-muted)] hover:text-[var(--destructive)] text-lg leading-none mt-[-8px]">✕</button>
          </div>
        );
      })}
      {urls.length === 0 && <p className="text-[var(--text-muted)] text-xs italic">Clique em "+ URL" para adicionar catálogos</p>}
    </div>
  );
}

// ─── Edit Product Modal ────────────────────────────────────────────────────────
function EditProductModal({ item, onClose, onSaved }: { item: Oportunidade; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState(item.titulo_amigavel);
  const [precoUsd, setPrecoUsd] = useState(String(item.melhor_preco_usd));
  const [fornecedor, setFornecedor] = useState(item.melhor_fornecedor);
  const [categoria, setCategoria] = useState(item.categoria);
  const [catalogs, setCatalogs] = useState<CatalogOffer[]>(item.ml_catalogs_json ?? []);
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'info' | 'catalogs'>('info');

  async function saveInfo() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/paraguai/produto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: item.fingerprint, titulo, preco_usd: parseFloat(precoUsd), fornecedor, categoria }),
      });
      const data = await res.json();
      if (data.ok) onSaved();
      else setError(data.error || 'Erro ao salvar');
    } catch { setError('Erro na requisição'); }
    finally { setSaving(false); }
  }

  async function addCatalog() {
    if (!newUrl.trim()) return;
    setAdding(true); setError('');
    try {
      const res = await fetch('/api/paraguai/catalogo/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: item.fingerprint, catalog_url: newUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) { setCatalogs(prev => [...prev, data.catalog]); setNewUrl(''); }
      else setError(data.error || 'Erro ao adicionar');
    } catch { setError('Erro na requisição'); }
    finally { setAdding(false); }
  }

  async function removeCatalog(catalog_id: string) {
    setRemovingId(catalog_id); setError('');
    try {
      const res = await fetch(`/api/paraguai/catalogo/pin?fingerprint=${item.fingerprint}&catalog_id=${catalog_id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) setCatalogs(prev => prev.filter(c => c.catalog_id !== catalog_id));
      else setError(data.error || 'Erro ao remover');
    } catch { setError('Erro na requisição'); }
    finally { setRemovingId(null); }
  }

  async function pinCatalog(catalog_id: string) {
    try {
      const res = await fetch('/api/paraguai/catalogo/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: item.fingerprint, catalog_id }),
      });
      const data = await res.json();
      if (data.ok) setCatalogs(prev => prev.map(c => ({ ...c, is_winner: c.catalog_id === catalog_id })));
      else setError(data.error || 'Erro ao fixar');
    } catch { setError('Erro na requisição'); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl w-[540px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[var(--text-primary)] font-bold text-base">✏️ Editar Produto</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-default)] px-6">
          {(['info', 'catalogs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}>
              {t === 'info' ? '📋 Informações' : `📦 Catálogos (${catalogs.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === 'info' ? (
            <>
              <div>
                <label className="text-[var(--text-secondary)] text-xs mb-1 block">Título</label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                <p className="text-[var(--text-muted)] text-[10px] mt-1 font-mono">fingerprint: {item.fingerprint}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] text-xs mb-1 block">Preço USD</label>
                  <input type="number" min={0} step={0.01} value={precoUsd} onChange={e => setPrecoUsd(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                </div>
                <div>
                  <label className="text-[var(--text-secondary)] text-xs mb-1 block">Fornecedor</label>
                  <input value={fornecedor} onChange={e => setFornecedor(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[var(--text-secondary)] text-xs mb-1 block">Categoria</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                {catalogs.length === 0 && <p className="text-[var(--text-muted)] text-xs italic py-2">Nenhum catálogo. Adicione abaixo ou clique em ⚡ na tabela.</p>}
                {catalogs.map(c => (
                  <div key={c.catalog_id} className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg", c.is_winner ? "bg-[var(--accent-muted)] border border-[var(--accent)]/30" : "bg-[var(--bg-surface)]")}>
                    <button onClick={() => !c.is_winner && pinCatalog(c.catalog_id)}
                      className={cn("text-base shrink-0 transition-colors", c.is_winner ? "cursor-default" : "text-[var(--text-muted)] hover:text-[var(--warning)]")}
                      title={c.is_winner ? "Principal" : "Definir como principal"}>
                      {c.is_winner ? '⭐' : '☆'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-primary)] text-xs truncate">{c.title}</p>
                      <p className="text-[var(--text-muted)] font-mono text-[10px]">{c.catalog_id}</p>
                    </div>
                    <div className="text-right text-[11px] shrink-0 space-y-0.5">
                      {c.price_premium ? <div className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold">P</span><span className="text-[var(--text-secondary)]">{c.price_premium.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div> : null}
                      {c.price_classic ? <div className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-600 text-white text-[9px] font-bold">C</span><span className="text-[var(--text-secondary)]">{c.price_classic.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div> : null}
                      {!c.price_premium && !c.price_classic && <div className="text-[var(--text-muted)] text-[10px]">sem preço</div>}
                    </div>
                    <button onClick={() => removeCatalog(c.catalog_id)} disabled={removingId === c.catalog_id}
                      className="text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors disabled:opacity-40 text-base leading-none ml-1 shrink-0"
                      title="Remover">
                      {removingId === c.catalog_id ? '⏳' : '✕'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--border-default)]/50 pt-3 space-y-2">
                <label className="text-[var(--text-secondary)] text-xs block">Adicionar catálogo por URL</label>
                <div className="flex gap-2">
                  <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCatalog()}
                    className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
                    placeholder="https://www.mercadolivre.com.br/p/MLB56513855" />
                  <button onClick={addCatalog} disabled={adding || !newUrl.trim()}
                    className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap">
                    {adding ? '...' : '+ Add'}
                  </button>
                </div>
              </div>
            </>
          )}
          {error && <p className="text-[var(--destructive)] text-xs">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-[var(--border-default)]">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-muted)] text-[var(--text-secondary)] text-sm hover:bg-white/10">
            {tab === 'catalogs' ? 'Fechar e atualizar' : 'Cancelar'}
          </button>
          {tab === 'info' && (
            <button onClick={saveInfo} disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          {tab === 'catalogs' && (
            <button onClick={onSaved} className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)]">
              Aplicar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── New Product Modal ─────────────────────────────────────────────────────────
function NovoProdutoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [precoUsd, setPrecoUsd] = useState('');
  const [fornecedor, setFornecedor] = useState('Manual');
  const [categoria, setCategoria] = useState('smartphone');
  const [catalogUrls, setCatalogUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fingerprint = titulo.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

  async function save() {
    if (!titulo.trim() || !precoUsd) { setError('Preencha título e preço.'); return; }
    setSaving(true); setError('');
    try {
      // Create product with first catalog URL (if any)
      const firstUrl = catalogUrls.find(u => u.trim()) ?? '';
      const res = await fetch('/api/paraguai/produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), preco_usd: parseFloat(precoUsd), fornecedor, categoria, catalog_url: firstUrl }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Erro ao salvar.'); return; }

      // Add extra catalog URLs (2nd onwards) via pin API
      const extraUrls = catalogUrls.slice(1).filter(u => u.trim());
      for (const url of extraUrls) {
        await fetch('/api/paraguai/catalogo/pin', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: data.fingerprint, catalog_url: url.trim() }),
        });
      }
      onSaved();
    } catch { setError('Erro na requisição.'); }
    finally { setSaving(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl w-[480px] max-h-[85vh] flex flex-col p-6 gap-4 overflow-y-auto">
        <h2 className="text-[var(--text-primary)] font-bold text-lg">+ Novo Produto</h2>

        <div>
          <label className="text-[var(--text-secondary)] text-xs mb-1 block">Título do produto</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
            placeholder="Apple AirPods Pro 3rd Generation" />
          {titulo && <p className="text-[var(--text-muted)] text-[10px] mt-1 font-mono">fingerprint: {fingerprint}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[var(--text-secondary)] text-xs mb-1 block">Preço USD</label>
            <input type="number" min={0} step={0.01} value={precoUsd} onChange={e => setPrecoUsd(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
              placeholder="150.00" />
          </div>
          <div>
            <label className="text-[var(--text-secondary)] text-xs mb-1 block">Fornecedor</label>
            <input value={fornecedor} onChange={e => setFornecedor(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm"
              placeholder="Manual" />
          </div>
        </div>

        <div>
          <label className="text-[var(--text-secondary)] text-xs mb-1 block">Categoria</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm">
            {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
          </select>
        </div>

        <CatalogUrlList urls={catalogUrls} onChange={setCatalogUrls} />

        {error && <p className="text-[var(--destructive)] text-xs">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-muted)] text-[var(--text-secondary)] text-sm hover:bg-white/10">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50">
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
  const [refreshProgress, setRefreshProgress] = useState<Record<string, { label: string; pct: number }>>({});
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [normalizingId, setNormalizingId] = useState<string | null>(null);
  const [selectedForNormalize, setSelectedForNormalize] = useState<Set<string>>(new Set());
  const [batchNormalizing, setBatchNormalizing] = useState(false);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showNovoProduto, setShowNovoProduto] = useState(false);
  const [cambio, setCambio] = useState(5.80);
  const [cambioSource, setCambioSource] = useState<'live' | 'fallback'>('fallback');

  // Filters
  const [filterMarca, setFilterMarca] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFornecedor, setFilterFornecedor] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('');
  const [filterMinMargem, setFilterMinMargem] = useState(0);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [cambioLoading, setCambioLoading] = useState(false);

  // Câmbio USD→BRL — atualiza a cada 30min ou manualmente
  const fetchCambio = useCallback((bustCache = false) => {
    setCambioLoading(true);
    const url = bustCache ? '/api/paraguai/cambio?bust=1' : '/api/paraguai/cambio';
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.rate && d.rate > 0) {
          setCambio(d.rate);
          setCambioSource(d.source === 'fallback' ? 'fallback' : 'live');
        }
      })
      .catch(() => {/* mantém fallback 5.80 */})
      .finally(() => setCambioLoading(false));
  }, []);

  useEffect(() => {
    fetchCambio();
    const interval = setInterval(() => fetchCambio(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchCambio]);

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

  const setProgress = (fp: string, label: string, pct: number) => {
    setRefreshProgress(prev => ({ ...prev, [fp]: { label, pct } }));
  };

  const clearProgress = (fp: string) => {
    setRefreshProgress(prev => {
      const next = { ...prev };
      delete next[fp];
      return next;
    });
  };

  const refreshCatalog = async (fingerprint: string) => {
    setRefreshingId(fingerprint);
    setProgress(fingerprint, 'Criando job...', 5);

    const done = (success: boolean) => {
      setRefreshingId(null);
      if (!success) clearProgress(fingerprint);
    };

    try {
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
        done(false);
        return;
      }

      setProgress(fingerprint, 'Buscando catálogos...', 20);

      // 2. Poll for completion (up to 90s, check every 3s)
      // pct goes from 20 → 80 over 30 polls (each poll +2%)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pct = Math.min(80, 20 + (i + 1) * 2);
        const label = i < 3 ? 'Buscando catálogos...' : i < 10 ? 'Calculando preços...' : 'Aguardando VPS...';
        setProgress(fingerprint, label, pct);

        const statusRes = await fetch(`/api/paraguai/catalogo/queue?fingerprint=${fingerprint}`);
        if (statusRes.ok) {
          const { status, error } = await statusRes.json();
          if (status === 'done') {
            setProgress(fingerprint, 'Carregando...', 95);
            await loadOportunidades();
            setProgress(fingerprint, 'Concluído! ✓', 100);
            done(true);
            setTimeout(() => clearProgress(fingerprint), 3000);
            return;
          }
          if (status === 'error') {
            alert(`Erro ao buscar catálogo${error ? ': ' + error : ''}.\n\nVerifique os logs da VPS para detalhes.`);
            done(false);
            return;
          }
        }
      }

      alert('⏳ Timeout: VPS não respondeu em 90s. Verifique os logs do container mission-control.');
      done(false);
    } catch (e: any) {
      console.error(e);
      alert('Erro: ' + (e.message || 'Erro desconhecido'));
      done(false);
    }
  };

  const [pinningCatalog, setPinningCatalog] = useState<string | null>(null); // "fingerprint:catalog_id"
  const [editCatalogsItem, setEditCatalogsItem] = useState<Oportunidade | null>(null);

  const pinCatalog = async (fingerprint: string, catalog_id: string) => {
    setPinningCatalog(`${fingerprint}:${catalog_id}`);
    try {
      const res = await fetch('/api/paraguai/catalogo/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, catalog_id }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadOportunidades();
      } else {
        alert('Erro ao fixar catálogo: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setPinningCatalog(null);
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">🇵🇾 Oportunidades Paraguai</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-0.5 flex items-center gap-3">
            <span>{loading ? 'Carregando...' : `${items.length} produto(s) encontrado(s)`}</span>
            <button
              onClick={() => fetchCambio(true)}
              disabled={cambioLoading}
              title="Atualizar cotação do dólar"
              className={cn("text-xs px-2 py-0.5 rounded-full border transition-opacity cursor-pointer hover:opacity-80 disabled:opacity-50",
                cambioSource === 'live' ? 'text-[var(--success)] border-emerald-800 bg-[var(--success-muted)]' : 'text-[var(--warning)] border-yellow-800 bg-[var(--warning-muted)]')}>
              {cambioLoading ? '⏳' : '💱'} USD {cambioSource === 'live' ? '=' : '≈'} {formatBRL(cambio)}
            </button>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNovoProduto(true)}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] flex items-center gap-2">
            + Produto
          </button>
          <button onClick={() => setShowSettings(true)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-muted)] flex items-center gap-2">
            ⚙️ Alertas
          </button>
          <button onClick={() => setShowCarrinho(true)}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] flex items-center gap-2">
            🛒 Carrinho
            {pendentes.length > 0 && (
              <span className="bg-white text-[var(--bg-base)] text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendentes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="flex flex-col gap-3 p-3 bg-[var(--bg-base)] rounded-xl border border-[var(--border-default)]">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">🔍</span>
            <input
              type="text"
              placeholder="Pesquisar produto, marca ou categoria..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg pl-9 pr-4 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="flex bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-default)] mx-2">
            <button
              onClick={() => setViewMode('cards')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'cards' ? "bg-[var(--accent)] text-white shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
              title="Cards"
            >
              📑
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-[var(--accent)] text-white shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
              title="Lista"
            >
              ☰
            </button>
          </div>

          {/* Botão Filtros colapsável */}
          {(() => {
            const activeCount = [filterMarca, filterCat, filterFornecedor, filterCatalog].filter(Boolean).length + (filterMinMargem > 0 ? 1 : 0);
            return (
              <button
                onClick={() => setShowFilters(v => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all",
                  showFilters || activeCount > 0
                    ? "bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--accent)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M11 16h2" /></svg>
                Filtros
                {activeCount > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold">{activeCount}</span>}
                <span className="text-[10px] opacity-60">{showFilters ? '▲' : '▼'}</span>
              </button>
            );
          })()}

          {selectedForNormalize.size > 0 && (
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-default)]">
              <span className="text-[var(--text-muted)] text-xs font-semibold">{selectedForNormalize.size} selecionado(s)</span>
              <button
                onClick={batchNormalize}
                disabled={batchNormalizing}
                className="px-3 py-1.5 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold hover:bg-[var(--brand)]/80 shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Normalizar com IA"
              >
                {batchNormalizing ? '⏳' : '🤖'} Normalizar
              </button>
              <button
                onClick={batchRefreshCatalogs}
                disabled={batchRefreshing}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Buscar catálogos ML"
              >
                {batchRefreshing ? '⏳' : '⚡'} Catálogos
              </button>
              <button
                onClick={batchDelete}
                disabled={batchDeleting}
                className="px-3 py-1.5 rounded-lg bg-[var(--destructive)] text-white text-xs font-semibold hover:bg-[var(--danger)] shadow-md disabled:opacity-50 flex items-center gap-1"
                title="Deletar produtos selecionados"
              >
                {batchDeleting ? '⏳' : '🗑'} Deletar
              </button>
              <button
                onClick={() => setSelectedForNormalize(new Set())}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs px-1"
                title="Limpar seleção"
              >
                ✕
              </button>
            </div>
          )}
          <button onClick={loadOportunidades}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] shadow-md ml-auto">
            Atualizar
          </button>
        </div>

        {/* Painel de filtros colapsável */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border-default)]/60 mt-2">
            <select value={filterMarca} onChange={e => setFilterMarca(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
              <option value="">Todas as marcas</option>
              {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_EMOJI[c]} {c}</option>)}
            </select>
            <select value={filterFornecedor} onChange={e => setFilterFornecedor(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
              <option value="">Todos os fornecedores</option>
              {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={filterCatalog} onChange={e => setFilterCatalog(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
              <option value="">Catálogo e estimado</option>
              <option value="true">✅ Só catálogo ML</option>
              <option value="false">⚠️ Sem catálogo</option>
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-secondary)] text-xs font-semibold">Margem mín.</span>
              <input type="number" min={0} max={100} value={filterMinMargem}
                onChange={e => setFilterMinMargem(parseInt(e.target.value) || 0)}
                placeholder="0%"
                className="w-16 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
            </div>
            {(filterMarca || filterCat || filterFornecedor || filterCatalog || filterMinMargem > 0) && (
              <button
                onClick={() => { setFilterMarca(''); setFilterCat(''); setFilterFornecedor(''); setFilterCatalog(''); setFilterMinMargem(0); }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors px-2 py-1.5"
              >
                ✕ Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[var(--bg-base)] rounded-xl p-4 h-48 animate-pulse border border-[var(--border-default)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-[var(--text-secondary)]">Nenhuma oportunidade encontrada.</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">Aguardando listas de fornecedores via WhatsApp.</p>
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
              onPinCatalog={pinCatalog}
              pinningCatalog={pinningCatalog}
              cambio={cambio}
            />
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl overflow-x-auto shadow-xl">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--bg-overlay)]/50 text-[var(--text-secondary)] font-semibold border-b border-[var(--border-default)] uppercase text-[11px] tracking-wider">
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
            <tbody className="divide-y divide-[var(--border-default)]">
              {items.map(item => (
                <Fragment key={item.fingerprint}>
                  <tr
                    className={cn(
                      "transition-all group cursor-pointer border-l-4",
                      expandedRow === item.fingerprint
                        ? "bg-[var(--accent)]/5 border-[var(--accent)] text-[var(--text-primary)]"
                        : "hover:bg-white/5 border-transparent text-[var(--text-secondary)]"
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
                          <p className="text-[var(--text-primary)] font-medium hover:text-[var(--accent)] transition-colors line-clamp-1 text-left">
                            {item.titulo_amigavel}
                          </p>
                          <p className="text-[var(--text-muted)] text-[10px] uppercase">{item.marca} • {item.categoria}</p>
                        </div>
                      </div>
                    </td>
                     <td className="px-4 py-3 align-middle">
                       <span className="text-[var(--text-secondary)] text-[13px]">{item.melhor_fornecedor}</span>
                       {item.num_suppliers > 1 && (
                         <span className="ml-2 bg-[var(--info-muted)] text-[var(--info)] text-[10px] px-1.5 py-0.5 rounded">+{item.num_suppliers-1}</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-right text-[var(--text-secondary)] text-[13px] align-middle whitespace-nowrap">
                       {formatUSD(item.melhor_preco_usd)}
                     </td>
                     <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                       <span className="text-[var(--text-secondary)] text-[13px]">{formatBRL(item.melhor_preco_usd * cambio)}</span>
                     </td>
                     <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                       {(() => {
                         const cats = item.ml_catalogs_json;
                         const bestP = item.ml_price_premium ?? null;
                         const bestC = item.ml_price_classic ?? null;
                         return (
                           <div className="flex flex-col leading-[1.5]">
                             <div className="flex items-center justify-end gap-1.5 py-1">
                               <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold" title="Anúncio Premium do catálogo principal no Mercado Livre">P</span>
                               <span className="text-[var(--text-secondary)] text-[13px]">{bestP && isFinite(bestP) ? formatBRL(bestP) : '—'}</span>
                             </div>
                             <div className="border-t border-[var(--border-default)]/20 flex items-center justify-end gap-1.5 py-1">
                               <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-600 text-white text-[9px] font-bold" title="Anúncio de Catálogo do catálogo principal no Mercado Livre">C</span>
                               <span className="text-[var(--text-secondary)] text-[13px]">{bestC && isFinite(bestC) ? formatBRL(bestC) : '—'}</span>
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
                         <div className="border-t border-[var(--border-default)]/20 py-1">
                           <span className={cn("text-[13px]", margemColor(item.margem_classico))}>
                             {item.margem_classico != null ? `${item.margem_classico}%` : '—'}
                           </span>
                         </div>
                       </div>
                     </td>
                     <td className="px-4 py-3 text-right align-middle">
                       <div className="flex flex-col leading-[1.5]">
                         <div className="py-1">
                            <span className={cn("text-[13px]", (item.lucro_premium ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]")}>
                              {item.lucro_premium != null ? formatBRL(item.lucro_premium) : '—'}
                            </span>
                         </div>
                         <div className="border-t border-[var(--border-default)]/20 py-1">
                            <span className={cn("text-[13px]", (item.lucro_classico ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]")}>
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
                             className={cn("p-1.5 rounded transition-colors", normalizingId === item.fingerprint ? "text-[var(--brand)] bg-[var(--brand-muted)] animate-pulse" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--brand)]/20")}
                             title="Normalizar com IA"
                           >
                             🤖
                           </button>
                           {refreshProgress[item.fingerprint] ? (() => {
                             const prog = refreshProgress[item.fingerprint];
                             const done100 = prog.pct >= 100;
                             return (
                               <div className="flex flex-col items-center gap-0.5 min-w-[72px]" title={prog.label}>
                                 <span className={cn("text-[10px] leading-none truncate max-w-[70px]", done100 ? "text-[var(--success)]" : "text-[var(--accent)]")}>{prog.label}</span>
                                 <div className="w-full h-1.5 bg-[var(--bg-muted)] rounded-full overflow-hidden">
                                   <div
                                     className={cn("h-full rounded-full transition-all duration-500", done100 ? "bg-[var(--success)]" : "bg-[var(--accent)]")}
                                     style={{ width: `${prog.pct}%` }}
                                   />
                                 </div>
                                 <span className={cn("text-[10px] leading-none", done100 ? "text-[var(--success)] font-bold" : "text-[var(--accent)]")}>{prog.pct}%</span>
                               </div>
                             );
                           })() : (
                             <button
                               onClick={() => refreshCatalog(item.fingerprint)}
                               disabled={refreshingId === item.fingerprint}
                               className={cn("p-1.5 rounded transition-colors", refreshingId === item.fingerprint ? "text-[var(--accent)] animate-pulse" : "text-[var(--accent)] hover:text-white hover:bg-[var(--accent)]")}
                               title="Atualizar Catálogo (Real-Time)"
                             >
                               ⚡
                             </button>
                           )}
                           <button
                             onClick={() => enrichCatalog(item.fingerprint)}
                             disabled={enrichingId === item.fingerprint || !item.ml_catalog_id}
                             className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                             title="Enriquecer com Firecrawl (sold_quantity, rating, sellers)"
                           >
                             {enrichingId === item.fingerprint ? '⏳' : '✨'}
                           </button>
                           <button onClick={() => toggleWatch(item)} className={cn("p-1.5 rounded transition-colors", item.monitorando ? "text-[var(--brand)] bg-[var(--brand-muted)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5")} title="Monitorar">🔔</button>
                           <button
                            onClick={() => addToCart(item)}
                            disabled={item.no_carrinho}
                            className={cn("p-1.5 rounded transition-colors", item.no_carrinho ? "text-[var(--success)] bg-[var(--success-muted)] cursor-not-allowed" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5")}
                            title={item.no_carrinho ? "Já no carrinho" : "Adicionar ao Carrinho"}
                           >
                             🛒
                           </button>
                           <button
                             onClick={() => setEditCatalogsItem(item)}
                             className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                             title="Gerenciar catálogos"
                           >
                             ✏️
                           </button>
                           <div className={cn("transition-transform duration-300 ml-2", expandedRow === item.fingerprint ? "rotate-180" : "rotate-0")}>
                             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] group-hover:text-[var(--accent)]">
                               <polyline points="6 9 12 15 18 9"></polyline>
                             </svg>
                           </div>
                        </div>
                      </td>
                  </tr>
                  {expandedRow === item.fingerprint && (
                    <tr className="bg-[var(--accent)]/5 border-l-4 border-[var(--accent)]">
                      <td colSpan={9} className="p-0 border-b border-[var(--border-default)]">
                        <div className="py-2">
                          <ExpandedDetails item={item} variant="list" onPinCatalog={pinCatalog} pinningCatalog={pinningCatalog} cambio={cambio} />
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
          cambio={cambio}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {editCatalogsItem && (
        <EditProductModal
          item={editCatalogsItem}
          onClose={() => setEditCatalogsItem(null)}
          onSaved={() => { setEditCatalogsItem(null); loadOportunidades(); }}
        />
      )}
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
  onPinCatalog,
  pinningCatalog,
  cambio,
}: {
  item: Oportunidade;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddToCart: () => void;
  onToggleWatch: () => void;
  onNormalize: () => void;
  normalizing: boolean;
  onPinCatalog?: (fingerprint: string, catalog_id: string) => void;
  pinningCatalog?: string | null;
  cambio: number;
}) {
  const emoji = CATEGORIA_EMOJI[item.categoria] || '📦';
  const cats = item.ml_catalogs_json;
  const bestP = item.ml_price_premium ?? null;
  const bestC = item.ml_price_classic ?? null;
  const bestPSafe = bestP != null && isFinite(bestP) ? bestP : null;
  const bestCSafe = bestC != null && isFinite(bestC) ? bestC : null;

  return (
    <div className={cn("bg-[var(--bg-base)] border rounded-xl p-4 flex flex-col gap-3 transition-all group", expanded ? 'border-[var(--accent)] shadow-2xl' : 'border-[var(--border-default)]')}>
      {/* Title row */}
      <div className="flex items-start gap-2 cursor-pointer" onClick={onToggleExpand}>
        <span className="text-2xl mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--text-primary)] font-bold text-sm leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors text-left">
            {item.titulo_amigavel}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.has_catalog && <Badge label="CATÁLOGO" color="bg-[var(--success-muted)] text-[var(--success)]" />}
            {!item.has_catalog && <Badge label="ESTIMADO" color="bg-[var(--warning-muted)] text-[var(--warning)]" />}
            {item.ml_catalogs_json && item.ml_catalogs_json.length > 1 && (
              <Badge label={`${item.ml_catalogs_json.length} catálogos`} color="bg-[var(--accent-muted)] text-[var(--accent)]" />
            )}
            {item.num_suppliers > 1 && (
              <Badge label={`${item.num_suppliers} fornecedores`} color="bg-[var(--info-muted)] text-[var(--info)]" />
            )}
            <Badge label={item.categoria} color="bg-[var(--bg-surface)] text-[var(--text-secondary)]" />
          </div>
        </div>
        <div className={cn("transition-transform duration-300", expanded ? "rotate-180" : "rotate-0")}>
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] group-hover:text-[var(--accent)]">
             <polyline points="6 9 12 15 18 9"></polyline>
           </svg>
        </div>
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-2 mt-1 cursor-pointer" onClick={onToggleExpand}>
        <div className="bg-[var(--bg-overlay)]/50 rounded-lg p-2.5 border border-[var(--border-default)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-8 h-8 bg-[var(--accent-muted)] rounded-bl-full flex items-start justify-end p-1">
             <span className="text-[8px]">🇵🇾</span>
          </div>
          <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-wider mb-0.5">Melhor preço USD</p>
          <p className="text-[var(--text-primary)] font-black text-lg leading-none">{formatUSD(item.melhor_preco_usd)}</p>
          <p className="text-[var(--text-secondary)] text-[10px] mt-1 truncate italic">≈ {formatBRL(item.melhor_preco_usd * cambio)}</p>
        </div>
        <div className="bg-[var(--bg-overlay)]/50 rounded-lg p-2.5 border border-[var(--border-default)] relative overflow-hidden">
           <div className="absolute top-0 right-0 w-8 h-8 bg-[var(--accent-muted)] rounded-bl-full flex items-start justify-end p-1">
             <span className="text-[8px]">🇧🇷</span>
          </div>
          <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-wider mb-1">Canais Mercado Livre</p>
          {(item.ml_price_premium || item.ml_price_classic || item.preco_ml_real || item.ml_catalogs_json?.length) ? (
              <div className="flex flex-col leading-[1.5]">
               {/* Premium row */}
               <div className="flex items-center justify-between py-2">
                 <div className="flex flex-col text-left">
                   <div className="flex items-center gap-1.5">
                     <span className="text-[var(--text-secondary)] text-[13px]">{formatBRL(bestPSafe ?? item.preco_ml_real ?? 0)}</span>
                     <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-bold" title="Anúncio Premium — Mercado Livre">P</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className={cn("text-[13px]", margemColor(item.margem_premium))}>
                     {item.margem_premium != null ? `${item.margem_premium}%` : '—'}
                   </span>
                   <span className={cn("text-[11px] mt-0.5", (item.lucro_premium ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]")}>
                     {item.lucro_premium != null ? formatBRL(item.lucro_premium) : '—'}
                   </span>
                 </div>
               </div>

               {/* Classic row */}
               <div className="flex items-center justify-between py-2 border-t border-[var(--border-default)]/20">
                 <div className="flex flex-col text-left">
                   <div className="flex items-center gap-1.5">
                     <span className="text-[var(--text-secondary)] text-[13px]">{formatBRL(bestCSafe ?? item.preco_ml_real ?? 0)}</span>
                     <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-600 text-white text-[9px] font-bold" title="Anúncio Catálogo — Mercado Livre">C</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className={cn("text-[13px]", margemColor(item.margem_classico))}>
                     {item.margem_classico != null ? `${item.margem_classico}%` : '—'}
                   </span>
                   <span className={cn("text-[11px] mt-0.5", (item.lucro_classico ?? 0) >= 0 ? "text-[var(--success)]/80" : "text-[var(--destructive)]/80")}>
                     {item.lucro_classico != null ? formatBRL(item.lucro_classico) : '—'}
                   </span>
                 </div>
               </div>
             </div>
          ) : (
            <div className="bg-[var(--bg-base)]/30 rounded p-4 border border-dashed border-[var(--border-default)] text-center">
              <p className="text-[var(--text-muted)] text-xs italic">Nenhum dado do Mercado Livre disponível</p>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Content (Accordion) */}
      {expanded && (
        <div className="mt-2 pt-4 border-t border-[var(--border-default)]/50 animate-in fade-in slide-in-from-top-2 duration-200">
           <ExpandedDetails item={item} variant="card" onPinCatalog={onPinCatalog} pinningCatalog={pinningCatalog} cambio={cambio} />
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
              ? "bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-default"
              : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
          )}>
          {item.no_carrinho ? '✓ NO CARRINHO' : '+ CARRINHO'}
        </button>
        <button
          onClick={onNormalize}
          disabled={normalizing}
          className={cn(
            "px-3.5 py-2.5 rounded-xl transition-all shadow-md",
            normalizing ? "bg-[var(--brand-muted)] text-[var(--brand)] animate-pulse" : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--brand)]/20 hover:text-[var(--brand)]"
          )}
          title="Normalizar com IA">
          🤖
        </button>
        <button
          onClick={onToggleWatch}
          className={cn(
            "px-3.5 py-2.5 rounded-xl transition-all shadow-md",
            item.monitorando
              ? "bg-[var(--brand)]/20 text-[var(--brand)] hover:bg-[var(--brand)]/30"
              : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          )}>
          {item.monitorando ? '🔔' : '🔕'}
        </button>
      </div>
    </div>
  );
}

// ─── Expanded Details (Accordion Content) ────────────────────────────────────

function ExpandedDetails({ item, variant = 'list', onPinCatalog, pinningCatalog, cambio }: {
  item: Oportunidade;
  variant?: 'card' | 'list';
  onPinCatalog?: (fingerprint: string, catalog_id: string) => void;
  pinningCatalog?: string | null;
  cambio: number;
}) {
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
    if (!dateString) return <span className="text-[var(--text-muted)]">—</span>;
    const d = new Date(dateString);
    if (isToday(dateString)) {
      return (
        <span className="text-[var(--success)] font-bold">
          Hoje às {d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
        </span>
      );
    }
    return <span className="text-[var(--text-secondary)]">{d.toLocaleString('pt-BR')}</span>;
  };

  // Trend Sparkline — custo histórico + referências ML horizontais (só quando catálogo buscado)
  const renderTrend = () => {
    const hasHistory = item.price_history && item.price_history.length >= 1;
    const hasMlRef = item.has_catalog && (item.ml_price_classic || item.ml_price_premium ||
      item.ml_catalogs_json?.some(c => c.price_classic || c.price_premium));

    if (!hasHistory && !hasMlRef) {
      return <div className="text-xs text-[var(--text-muted)] italic h-[40px] flex items-center justify-center">Sem histórico 30d</div>;
    }

    const isBRL = chartCurrency === 'BRL';
    const fmt = isBRL ? formatBRL : (v: any) => `$${parseFloat(v).toFixed(2)}`;

    // Custo do fornecedor — linha histórica (vazia se sem histórico)
    const pyPrices = (item.price_history ?? []).map(h =>
      isBRL ? h.min_preco_usd * cambio * 1.15 * 1.18 : h.min_preco_usd
    );

    // Referências ML horizontais — sempre do catálogo principal selecionado
    const hasCatalog = item.has_catalog;
    const rawClassic = hasCatalog ? (item.ml_price_classic ?? null) : null;
    const rawPremium = hasCatalog ? (item.ml_price_premium ?? null) : null;
    const classicRef = rawClassic != null ? (isBRL ? rawClassic : rawClassic / cambio) : null;
    const premiumRef = rawPremium != null ? (isBRL ? rawPremium : rawPremium / cambio) : null;

    // Escala incluindo referências ML se existirem
    const allVals = [
      ...pyPrices,
      ...(classicRef != null ? [classicRef] : []),
      ...(premiumRef != null ? [premiumRef] : []),
    ];
    const minP = Math.min(...allVals);
    const maxP = Math.max(...allVals);
    const range = maxP - minP || 1;

    const histLen = pyPrices.length;
    const getX = (i: number) => histLen <= 1 ? 50 : (i / (histLen - 1)) * 100;
    const getY = (v: number) => 30 - (((v - minP) / range) * 30);

    const pyPoints = pyPrices.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

    return (
      <div>
        <div className="flex justify-end mb-1">
          <div className="flex bg-[var(--bg-surface)] rounded-md p-0.5 border border-[var(--border-default)]">
            {(['BRL', 'USD'] as const).map(cur => (
              <button key={cur} onClick={() => setChartCurrency(cur)}
                className={cn("text-[9px] font-bold px-2 py-0.5 rounded transition-colors",
                  chartCurrency === cur ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}>
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
            {histLen >= 2 && (
              <polyline points={pyPoints} fill="none" stroke="#6366f1" strokeWidth="0.8"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            )}
            {histLen === 1 && (
              <circle cx={getX(0)} cy={getY(pyPrices[0])} r="1.5" fill="#6366f1" opacity="0.9" />
            )}
            {/* Dots de hoje para ML Clássico e Premium — mesma posição X que o ponto de custo mais recente */}
            {classicRef != null && (
              <circle cx={histLen >= 2 ? 100 : 50} cy={getY(classicRef)} r="1.5" fill="#10b981" opacity="0.9" />
            )}
            {premiumRef != null && (
              <circle cx={histLen >= 2 ? 100 : 50} cy={getY(premiumRef)} r="1.5" fill="#f59e0b" opacity="0.9" />
            )}
          </svg>

          <div className="flex gap-3 mt-1 text-[8px] uppercase tracking-tighter">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full" />
              <span className="text-[var(--text-secondary)]">Custo PY</span>
            </div>
            {classicRef != null && (
              <div className="flex items-center gap-1">
                <div className="w-3 border-t border-dashed border-emerald-500" />
                <span className="text-[var(--text-secondary)]">ML Catálogo {fmt(classicRef)}</span>
              </div>
            )}
            {premiumRef != null && (
              <div className="flex items-center gap-1">
                <div className="w-3 border-t border-dashed border-amber-500" />
                <span className="text-[var(--text-secondary)]">ML Premium {fmt(premiumRef)}</span>
              </div>
            )}
          </div>
          <div className="absolute -top-4 left-0 text-[8px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-base)]/80 rounded px-1">Máx: {fmt(maxP)}</div>
          <div className="absolute -bottom-1 left-0 text-[8px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-base)]/80 rounded px-1">Mín: {fmt(minP)}</div>
        </div>
        {!hasCatalog && (
          <p className="text-[9px] text-[var(--text-muted)] italic text-center mt-1">Clique ⚡ para ver referências ML no gráfico</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 text-sm">
      {/* Informações Gerais */}
      <div className={cn("grid grid-cols-1 gap-12 px-8 py-4", variant === 'list' ? 'lg:grid-cols-2' : '')}>
        <div className="space-y-3 flex flex-col justify-start max-w-md">
          <div className="flex items-center gap-6 border-b border-[var(--border-default)]/40 pb-2.5">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Marca</span>
            <span className="text-[var(--text-primary)] font-semibold text-xs">{item.marca}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-[var(--border-default)]/40 pb-2.5">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Modelo</span>
            <span className="text-[var(--text-primary)] font-medium text-xs truncate">{item.modelo || '—'}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-[var(--border-default)]/40 pb-2.5">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Origem</span>
            <span className="text-[var(--accent)] font-bold text-xs uppercase">{item.origem || '—'}</span>
          </div>
          <div className="flex items-center gap-6 border-b border-[var(--border-default)]/40 pb-2.5">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Última Ref.</span>
            <div className="text-xs">{formatRefDate(item.ultima_atualizacao)}</div>
          </div>
          <div className="flex items-center gap-6 border-b border-[var(--border-default)]/40 pb-2.5 pt-2">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest">Fornecedor</span>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-primary)] font-bold text-xs">{item.melhor_fornecedor}</span>
              <span className="bg-[var(--brand-muted)] text-[var(--brand)] text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-500/30">BEST PRICE</span>
            </div>
          </div>
          {/* Descrição inline — ambas views */}
          <div className="flex items-start gap-6 border-b border-[var(--border-default)]/40 pb-2.5 pt-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase font-black w-24 shrink-0 tracking-widest pt-0.5">Descrição</span>
            <p className="text-[var(--text-secondary)] font-mono text-[10px] leading-relaxed break-words line-clamp-3">
              {item.descricao_raw || 'Não capturada.'}
            </p>
          </div>
        </div>

        {/* Tendência bloco (list — lado direito) */}
        {variant === 'list' && (
          <div className="bg-[var(--bg-overlay)] rounded-xl p-4 border border-[var(--border-default)]/60 flex flex-col shadow-inner justify-between">
            <span className="text-[var(--text-muted)] text-[9px] uppercase font-black tracking-[0.2em] text-center mb-2">Tendência 30 Dias (USD)</span>
            {renderTrend()}
          </div>
        )}
      </div>

      {/* Catalogs Table */}
      {item.ml_catalogs_json && item.ml_catalogs_json.length > 0 && (
        <div className="px-8 pb-6">
          <div className="bg-[var(--bg-overlay)]/50 rounded-xl border border-[var(--border-default)]/60 overflow-x-auto">
             <div className="bg-[var(--bg-surface)]/40 px-4 py-2 border-b border-[var(--border-default)]/60 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                <span className="text-[var(--text-secondary)]">📈 Comparação de Catálogos ML (Novos)</span>
                <span className="text-[var(--accent)]">{item.ml_catalogs_json.length} catálogos encontrados</span>
             </div>
             <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-[var(--text-muted)] border-b border-[var(--border-default)]/40 text-[10px]">
                    <th className="px-4 py-2">Catálogo</th>
                    <th className="px-4 py-2 text-right">Premium</th>
                    <th className="px-4 py-2 text-right">Clássico</th>
                    <th className="px-4 py-2 text-center">Avaliação</th>
                    <th className="px-4 py-2 text-right">Vendidos</th>
                    <th className="px-4 py-2 text-right">Vendedores</th>
                    <th className="px-4 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]/40">
                  {item.ml_catalogs_json.map((c) => {
                    const isWinner = c.is_winner || c.catalog_id === item.ml_catalog_id;
                    const isFull = c.has_full ?? false;
                    const e = c.enriched;
                    const isEnriched = !!e?.enriched_at;
                    // Vendidos: prefer Firecrawl (mais preciso) sobre ML API
                    const vendidos = e?.sold_quantity ?? c.sold_quantity ?? null;
                    // Vendedores: prefer Firecrawl sobre ML API
                    const vendedores = e?.seller_count_fc ?? c.seller_count ?? null;
                    return (
                      <tr key={c.catalog_id} className={cn("hover:bg-white/5", isWinner ? "bg-[var(--accent-muted)]" : "")}>
                        {/* Catálogo */}
                        <td className="px-4 py-2 max-w-[200px]">
                          <div className="flex flex-col gap-0.5">
                            {/* Título: só exibe se for diferente do catalog_id (evita duplicata) */}
                            {c.title && c.title !== c.catalog_id && (
                              <span className="text-[var(--text-primary)] text-[11px] line-clamp-1">{c.title}</span>
                            )}
                            {/* ID + badges */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-mono text-[var(--text-muted)] text-[9px]">{c.catalog_id}</span>
                              {isWinner && <span className="text-[8px] bg-[var(--accent)] text-white px-1 py-0.5 rounded font-bold">PRINCIPAL</span>}
                              {c.is_manual && <span className="text-[8px] bg-[var(--brand-muted)] text-[var(--brand)] border border-amber-500/30 px-1 py-0.5 rounded font-bold" title="Adicionado manualmente">📌</span>}
                            </div>
                            {/* Ranking — linha própria abaixo do ID */}
                            {isEnriched && e?.ranking_position != null && (
                              <span className="text-[9px] text-[var(--brand)]">🏆 {e.ranking_position}º em {e.ranking_category}</span>
                            )}
                            {/* Sellers from Firecrawl */}
                            {isEnriched && (e?.sellers?.length ?? 0) > 0 && (
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {(e?.sellers ?? []).map((s, idx) => {
                                  // Suporta formato antigo (string) e novo ({name, price})
                                  const name = typeof s === 'string' ? s : s.name;
                                  const price = typeof s === 'string' ? null : s.price;
                                  const isWinnerSeller = name === e?.winner_seller;
                                  const isBestPrice = name === e?.best_price_seller;
                                  const badge = isWinnerSeller ? 'P' : isBestPrice ? 'C' : null;
                                  const badgeColor = isWinnerSeller ? 'bg-emerald-600' : 'bg-orange-600';
                                  const colorClass = isWinnerSeller
                                    ? 'text-[var(--accent)]'
                                    : isBestPrice
                                    ? 'text-[var(--success)]'
                                    : 'text-[var(--text-muted)]';
                                  const tooltip = isWinnerSeller
                                    ? 'Vencedor do catálogo (buybox) — Premium'
                                    : isBestPrice
                                    ? 'Melhor preço — Clássico'
                                    : 'Vendedor listado no catálogo';
                                  return (
                                    <span key={name} className={`text-[9px] ${colorClass} truncate flex items-center gap-1`} title={tooltip}>
                                      {badge && <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${badgeColor} text-white text-[8px] font-bold flex-shrink-0`}>{badge}</span>}
                                      {!badge && <span className="text-[var(--text-muted)]">·</span>}
                                      {name}{price != null ? ` · ${formatBRL(price)}` : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Premium */}
                        <td className="px-4 py-2 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-[var(--text-primary)]">{c.price_premium ? formatBRL(c.price_premium) : '—'}</span>
                            {c.price_premium && (() => {
                              const lucro = (c.price_premium * 0.82) - (item.melhor_preco_usd * cambio);
                              return <span className={cn("text-[9px]", lucro >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]")}>Lucro {formatBRL(lucro)}</span>;
                            })()}
                          </div>
                        </td>
                        {/* Clássico */}
                        <td className="px-4 py-2 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-[var(--text-secondary)]">{c.price_classic ? formatBRL(c.price_classic) : '—'}</span>
                            {c.price_classic && (() => {
                              const lucro = (c.price_classic * 0.84) - (item.melhor_preco_usd * cambio);
                              return <span className={cn("text-[9px]", lucro >= 0 ? "text-[var(--success)]" : "text-[var(--destructive)]")}>Lucro {formatBRL(lucro)}</span>;
                            })()}
                          </div>
                        </td>
                        {/* Avaliação (Firecrawl) */}
                        <td className="px-4 py-2 text-center">
                          {e?.rating
                            ? <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[var(--brand)] font-bold">{e.rating} ★</span>
                                {e.review_count != null && <span className="text-[var(--text-muted)] text-[9px]">{e.review_count.toLocaleString('pt-BR')} op.</span>}
                              </div>
                            : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                        {/* Vendidos */}
                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                          {vendidos != null
                            ? <span className={isEnriched && e?.sold_quantity != null ? 'text-[var(--text-primary)]' : ''}>{vendidos.toLocaleString('pt-BR')}</span>
                            : '—'}
                        </td>
                        {/* Vendedores */}
                        <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                          {vendedores != null
                            ? <span className={isEnriched && e?.seller_count_fc != null ? 'text-[var(--text-primary)]' : ''}>{vendedores}</span>
                            : '—'}
                        </td>
                        {/* Ações */}
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {isWinner ? (
                              <span title="Catálogo principal" className="text-yellow-400 text-sm cursor-default">⭐</span>
                            ) : onPinCatalog ? (
                              <button
                                onClick={() => onPinCatalog(item.fingerprint, c.catalog_id)}
                                disabled={pinningCatalog === `${item.fingerprint}:${c.catalog_id}`}
                                title="Definir como catálogo principal"
                                className="text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors disabled:opacity-40 text-sm"
                              >
                                {pinningCatalog === `${item.fingerprint}:${c.catalog_id}` ? '⏳' : '☆'}
                              </button>
                            ) : null}
                            <a href={c.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">🔗</a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
          </div>
        </div>
      )}


      {/* Tendência — full width (card only) */}
      {variant === 'card' && (
        <div className="px-8 pb-6">
          <div className="bg-[var(--bg-overlay)] rounded-xl p-4 border border-[var(--border-default)]/60 flex flex-col shadow-inner">
            <span className="text-[var(--text-muted)] text-[9px] uppercase font-black tracking-[0.2em] text-center mb-2">Tendência 30 Dias (USD)</span>
            {renderTrend()}
          </div>
        </div>
      )}
    </div>
  );
}
