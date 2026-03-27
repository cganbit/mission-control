'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Search, Loader2, FileText } from 'lucide-react';

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
  const cls = map[status] ?? 'bg-slate-800 text-slate-400 border-slate-700/50';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs border', cls)}>
      {label[status] ?? status}
    </span>
  );
}

// ─── Masked Field ─────────────────────────────────────────────────────────────

function MaskedField({ label, raw, maskFn }: { label: string; raw: string | null; maskFn: (v: string) => string }) {
  const [revealed, setRevealed] = useState(false);
  if (!raw) return (
    <div>
      <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">{label}</span>
      <p className="text-sm text-slate-500 mt-0.5">—</p>
    </div>
  );
  return (
    <div>
      <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">{label}</span>
      <div className="flex items-center gap-2 mt-0.5">
        <p className="text-sm text-slate-200 font-mono">{revealed ? raw : maskFn(raw)}</p>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title={revealed ? 'Ocultar' : 'Revelar'}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Perfil View ──────────────────────────────────────────────────────────────

function PerfilView({ buyerId, onBack }: { buyerId: string; onBack: () => void }) {
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
        if (d) {
          setPerfil(d);
          setNotes(d.notes ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, [buyerId]);

  async function handleSaveNotes() {
    setSaving(true);
    await fetch(`/api/mercado-livre/clientes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml_buyer_id: buyerId, notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
    </div>
  );

  if (!perfil) return (
    <div className="text-center py-20 text-slate-500">Cliente não encontrado.</div>
  );

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para lista
      </button>

      {/* Card dados pessoais */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{perfil.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">ML #{perfil.ml_buyer_id}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MaskedField label="Telefone" raw={perfil.phone} maskFn={maskPhone} />
          <MaskedField label="Email" raw={perfil.email} maskFn={maskEmail} />
          <MaskedField label="CPF" raw={perfil.cpf} maskFn={maskCPF} />
        </div>

        <div>
          <label className="text-[10px] text-slate-600 uppercase tracking-widest font-bold block mb-1.5">
            Notas
          </label>
          <textarea
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Adicionar notas sobre este cliente..."
          />
          <div className="flex items-center justify-end mt-2 gap-2">
            {saved && <span className="text-xs text-emerald-400">Salvo!</span>}
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 text-indigo-300 border border-indigo-600/30 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Card comprou em */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-3">Comprou em</h3>
        <div className="flex flex-wrap gap-2">
          {perfil.lojas.map(loja => (
            <span
              key={loja.nickname}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/50"
            >
              <span className="font-bold text-slate-100">{loja.nickname}</span>
              <span className="text-slate-500">—</span>
              <span>{loja.total_pedidos} pedido{loja.total_pedidos !== 1 ? 's' : ''}</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400">{fmtBRL(loja.total_gasto)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tabela de pedidos */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700/50">
          <h3 className="text-xs text-slate-500 uppercase tracking-widest font-bold">Pedidos ({perfil.pedidos.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Data', 'Conta', 'Item + Qtd', 'Valor', 'Envio', 'Status', 'Etiqueta'].map(col => (
                  <th key={col} className="text-left text-[10px] text-slate-600 uppercase tracking-widest font-bold px-4 py-3 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfil.pedidos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-600 py-8 text-sm">Nenhum pedido encontrado.</td>
                </tr>
              ) : perfil.pedidos.map(p => (
                <tr key={p.ml_order_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{relativeDate(p.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                      {p.seller_nickname ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate text-xs" title={p.items_summary ?? ''}>
                    {p.items_summary ?? '—'}
                    {p.quantity != null && p.quantity > 1 && (
                      <span className="ml-1.5 text-slate-500">×{p.quantity}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap text-xs font-medium">
                    {fmtBRL(p.valor)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ShipmentBadge type={p.logistic_type} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.has_label && p.label_url ? (
                      <a
                        href={p.label_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700/50 hover:border-slate-500 transition-colors"
                      >
                        <FileText className="h-3 w-3" />
                        PDF
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Lista View ───────────────────────────────────────────────────────────────

function ListaView({ onSelectBuyer }: { onSelectBuyer: (id: number) => void }) {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
          <h1 className="text-xl font-bold text-slate-100">Clientes ML</h1>
          <p className="text-xs text-slate-500 mt-0.5">Histórico de compradores por conta</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nome ou ID..."
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors w-64"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Cliente', 'Lojas', 'Pedidos', 'Total Gasto', 'Última Compra', 'Ações'].map(col => (
                  <th key={col} className="text-left text-[10px] text-slate-600 uppercase tracking-widest font-bold px-4 py-3 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-500 mx-auto" />
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-600 py-12 text-sm">
                    {search ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
                  </td>
                </tr>
              ) : clientes.map(c => (
                <tr key={c.ml_buyer_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono">#{c.ml_buyer_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.lojas.map(loja => (
                        <span
                          key={loja}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 uppercase tracking-wide"
                        >
                          {loja}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{c.total_pedidos}</td>
                  <td className="px-4 py-3 text-emerald-400 font-medium whitespace-nowrap">{fmtBRL(c.total_gasto)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{relativeDate(c.ultima_compra)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onSelectBuyer(c.ml_buyer_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/50 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-900/20 transition-colors whitespace-nowrap"
                    >
                      Ver perfil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientesMLPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const buyerId = searchParams.get('buyer_id');

  function handleSelectBuyer(id: number) {
    router.push(`?buyer_id=${id}`);
  }

  function handleBack() {
    router.push('/mercado-livre/clientes');
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      <div className="max-w-7xl mx-auto">
        {buyerId ? (
          <PerfilView buyerId={buyerId} onBack={handleBack} />
        ) : (
          <ListaView onSelectBuyer={handleSelectBuyer} />
        )}
      </div>
    </div>
  );
}
