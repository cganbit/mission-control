'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Loader2, ChevronDown } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...inputs: (string | false | undefined | null)[]) {
  return inputs.filter(Boolean).join(' ');
}

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function relativeDate(dateStr: string) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return new Date(dateStr).toLocaleDateString('pt-BR');
  if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
  if (hours > 0) return `há ${hours}h`;
  if (mins > 0) return `há ${mins}min`;
  return 'agora';
}

function maskPhone(v: string) {
  if (!v) return '—';
  return v.replace(/(\d{2})\d{4,5}(\d{4})/, '($1) ****-$2');
}

function maskEmail(v: string) {
  if (!v) return '—';
  const [user, domain] = v.split('@');
  if (!domain) return '***';
  return user.slice(0, 2) + '***@' + domain;
}

function maskCPF(v: string) {
  if (!v) return '—';
  return v.replace(/(\d{3})\d{3}\d{3}(\d{2})/, '$1.***.***-$2');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClienteRow {
  ml_buyer_id: number;
  name: string;
  lojas: string[];
  total_pedidos: number;
  total_gasto: number;
  ultima_compra: string;
}

interface PedidoCliente {
  ml_order_id: string;
  created_at: string;
  seller_nickname: string;
  items_summary: string | null;
  quantity: number | null;
  valor: number;
  logistic_type: string | null;
  has_label: boolean;
  label_url: string | null;
  status: string;
}

interface LojaSummary {
  nickname: string;
  total_pedidos: number;
  total_gasto: number;
}

interface ClientePerfil {
  ml_buyer_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  notes: string | null;
  lojas: LojaSummary[];
  pedidos: PedidoCliente[];
}

// ─── Shipment Badge ───────────────────────────────────────────────────────────

function ShipmentBadge({ type }: { type: string | null }) {
  const t = (type ?? '').toLowerCase();
  if (t === 'me2' || t === 'drop_off' || t.includes('me2'))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-900/60 text-blue-300 border border-blue-700/50">🚚 Mercado Envios</span>;
  if (t === 'me1' || t.includes('flex'))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-900/60 text-purple-300 border border-purple-700/50">⚡ ME Flex</span>;
  if (t === 'fulfillment')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">🏭 Fulfillment</span>;
  if (t === 'turbo')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-900/60 text-orange-300 border border-orange-700/50">🏎 Turbo</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50">📦 Combinar</span>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
    payment_required: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
    cancelled: 'bg-red-900/60 text-red-300 border-red-700/50',
  };
  const label: Record<string, string> = {
    paid: 'Pago',
    payment_required: 'Aguardando',
    cancelled: 'Cancelado',
  };
  const cls = map[status] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border-[var(--border)]/50';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs border', cls)}>
      {label[status] ?? status}
    </span>
  );
}

// ─── Perfil View ──────────────────────────────────────────────────────────────

function PerfilView({ buyerId }: { buyerId: string }) {
  const [perfil, setPerfil] = useState<ClientePerfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mercado-livre/clientes/${buyerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.cliente) {
          const p: ClientePerfil = {
            ml_buyer_id: d.cliente.ml_buyer_id,
            name: d.cliente.nome ?? '',
            phone: d.cliente.telefone || null,
            email: null,
            cpf: d.cliente.cpf || null,
            notes: d.cliente.notas || null,
            lojas: (d.lojas_compradas ?? []).map((l: any) => ({
              nickname: l.seller_nickname,
              total_pedidos: Number(l.total_pedidos ?? 0),
              total_gasto: Number(l.total_gasto ?? 0),
            })),
            pedidos: (d.pedidos ?? []).map((o: any) => {
              const items = Array.isArray(o.items_json) ? o.items_json : [];
              const qtyTotal = items.reduce((acc: number, i: any) => acc + Number(i.quantity ?? 0), 0);
              const summary = items.map((i: any) => i.title ?? '').filter(Boolean).join(', ') || null;
              return {
                ml_order_id: String(o.ml_order_id),
                created_at: o.date_created ?? o.created_at,
                seller_nickname: o.seller_nickname ?? '',
                items_summary: summary,
                quantity: qtyTotal || null,
                valor: Number(o.total_amount ?? 0),
                logistic_type: o.logistic_type ?? null,
                has_label: !!o.has_label,
                label_url: o.label_url ?? null,
                status: o.status ?? '',
              };
            }),
          };
          setPerfil(p);
          setNotes(p.notes ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, [buyerId]);

  async function handleSaveNotes() {
    setSaving(true);
    await fetch(`/api/mercado-livre/clientes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml_buyer_id: Number(buyerId), notas: notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
    </div>
  );

  if (!perfil) return (
    <div className="text-center py-4 text-[var(--text-muted)] text-xs">Sem dados para este cliente.</div>
  );

  return (
    <div className="space-y-4">
      {/* Meta compact: phone + email + cpf */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="text-[var(--text-muted)]">📱 <span className={perfil.phone ? 'text-[var(--text-primary)] font-mono' : 'text-[var(--text-muted)]'}>{perfil.phone || '—'}</span></span>
        <span className="text-[var(--text-muted)]">✉️ <span className={perfil.email ? 'text-[var(--text-primary)] font-mono' : 'text-[var(--text-muted)]'}>{perfil.email || '—'}</span></span>
        <span className="text-[var(--text-muted)]">🪪 <span className={perfil.cpf ? 'text-[var(--text-primary)] font-mono' : 'text-[var(--text-muted)]'}>{perfil.cpf || '—'}</span></span>
      </div>

      {/* Notas inline */}
      <div className="flex items-start gap-2">
        <textarea
          className="flex-1 bg-[var(--bg-muted)]/60 border border-[var(--border)]/50 rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors"
          rows={1}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notas sobre este cliente..."
        />
        <button
          onClick={handleSaveNotes}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>
      {/* Pedidos compactos */}
      <div className="space-y-2">
        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Histórico de Pedidos ({perfil.pedidos.length})</p>
        {perfil.pedidos.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">Nenhum pedido.</p>
        ) : perfil.pedidos.map(p => (
          <div key={p.ml_order_id} className="bg-[var(--bg-muted)]/50 rounded-lg px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <a
                  href={`https://www.mercadolivre.com.br/vendas/${p.ml_order_id}/detalhe`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-secondary)] font-medium hover:text-[var(--accent)] transition-colors"
                  title="Ver no painel ML"
                >
                  #{p.ml_order_id} ↗
                </a>
                <span className="text-[var(--text-muted)]">{relativeDate(p.created_at)}</span>
                {p.seller_nickname && <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded">{p.seller_nickname}</span>}
              </div>
              <div className="flex items-center gap-2">
                <ShipmentBadge type={p.logistic_type} />
                <StatusBadge status={p.status} />
                <span className="text-[var(--accent)] font-bold">{fmtBRL(p.valor)}</span>
              </div>
            </div>
            {p.items_summary && (
              <p className="text-[var(--text-muted)] truncate" title={p.items_summary}>
                {p.quantity && p.quantity > 1 ? `${p.quantity}× ` : ''}{p.items_summary}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lista View ───────────────────────────────────────────────────────────────

function ListaView() {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedBuyerId, setExpandedBuyerId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    const res = await fetch(`/api/mercado-livre/clientes?${params}`);
    if (res.ok) {
      const data = await res.json();
      setClientes(data.clientes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val), 400);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Clientes ML</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Histórico de compradores por conta</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nome ou ID..."
            className="bg-[var(--bg-muted)]/60 border border-[var(--border)]/50 rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors w-64"
          />
        </div>
      </div>

      {/* Cards list */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)] mx-auto" />
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] py-12 text-sm bg-[var(--bg-surface)]/50 border border-[var(--border)]/50 rounded-xl">
            {search ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
          </div>
        ) : clientes.map(c => {
          const expanded = expandedBuyerId === c.ml_buyer_id;
          return (
            <div
              key={c.ml_buyer_id}
              className={cn(
                "bg-[var(--bg-surface)]/50 rounded-xl overflow-hidden transition-all border",
                expanded
                  ? "border-[var(--accent)] shadow-lg shadow-[var(--accent)]/10"
                  : "border-[var(--border)]/50 hover:border-[var(--border-strong)]/80"
              )}
            >
              <button
                onClick={() => setExpandedBuyerId(prev => prev === c.ml_buyer_id ? null : c.ml_buyer_id)}
                className="w-full px-4 py-3 flex items-center gap-4 hover:bg-[var(--bg-muted)]/20 transition-colors text-left"
                aria-expanded={expanded}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)] text-sm truncate">{c.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">#{c.ml_buyer_id}</div>
                </div>
                <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                  {c.lojas.slice(0, 3).map(loja => (
                    <span
                      key={loja}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30 uppercase tracking-wide"
                    >
                      {loja}
                    </span>
                  ))}
                </div>
                <div className="text-right space-y-0.5 flex-shrink-0">
                  <div className="text-[var(--accent)] font-bold text-sm whitespace-nowrap">{fmtBRL(c.total_gasto)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {c.total_pedidos} pedido{c.total_pedidos !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="hidden lg:block text-[10px] text-[var(--text-muted)] text-right w-20 flex-shrink-0">
                  {relativeDate(c.ultima_compra)}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-300",
                    expanded && "rotate-180 text-[var(--accent)]"
                  )}
                />
              </button>
              {expanded && (
                <div className="border-t border-[var(--border)]/50 bg-[var(--bg-muted)]/20 p-4">
                  <PerfilView buyerId={String(c.ml_buyer_id)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientesMLPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-7xl mx-auto">
        <ListaView />
      </div>
    </div>
  );
}
