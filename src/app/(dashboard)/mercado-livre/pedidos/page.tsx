'use client';

import React, { useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Error boundary to catch and display render errors
class DrawerErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error) { console.error('MeDrawer crash:', e); }
  render() {
    if (this.state.error) {
      return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-slate-900 p-6 rounded-xl max-w-md space-y-3">
            <p className="text-red-400 font-bold text-sm">Erro no Drawer</p>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap">{this.state.error}</pre>
            <button onClick={this.props.onClose} className="px-4 py-2 bg-slate-700 text-white rounded text-sm">Fechar</button>
          </div>
        </div>,
        document.body
      );
    }
    return this.props.children;
  }
}

interface OrderItem {
  title: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: number;
  ml_order_id: string;
  ml_shipment_id: string | null;
  seller_nickname: string | null;
  seller_id: number | null;
  pack_id: string | null;
  status: string;
  items_json: OrderItem[] | null;
  total: number | null;
  logistic_type: string | null;
  listing_type: string | null;
  shipping_status: string | null;
  buyer_name: string | null;
  created_at: string;
  updated_at: string;
  print_status: string | null;
  has_label: boolean | null;
  error_msg: string | null;
  // Melhor Envio fields
  me_order_id: string | null;
  me_tracking_code: string | null;
  me_label_url: string | null;
  me_status: string | null;
  me_carrier: string | null;
  me_cost: number | null;
  me_delivery_address: Record<string, string> | null;
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
  return lt === 'self_service' || lt === 'custom';
}

function translateLogistic(logistic: string | null): { label: string; color: string } {
  if (!logistic) return { label: '—', color: 'text-slate-500' };
  const lt = logistic.toLowerCase();
  if (lt === 'fulfillment') return { label: 'Full', color: 'bg-purple-900/60 text-purple-300 border-purple-700/40' };
  if (['xd_drop_off', 'drop_off', 'cross_docking'].includes(lt)) return { label: 'Mercado Envios', color: 'bg-blue-900/60 text-blue-300 border-blue-700/40' };
  if (['self_service', 'custom'].includes(lt)) return { label: 'Envio próprio', color: 'bg-amber-900/60 text-amber-300 border-amber-700/40' };
  if (['me1', 'flex'].includes(lt)) return { label: 'Flex', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/40' };
  return { label: logistic, color: 'bg-slate-700 text-slate-300 border-slate-600' };
}

function translateListingType(lt: string | null): { label: string; color: string } | null {
  if (!lt) return null;
  if (lt === 'gold_special') return { label: 'Premium', color: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/40' };
  if (lt === 'gold_pro') return { label: 'Clássico', color: 'bg-sky-900/60 text-sky-300 border-sky-700/40' };
  if (lt === 'free') return { label: 'Grátis', color: 'bg-slate-700 text-slate-400 border-slate-600' };
  return { label: lt, color: 'bg-slate-700 text-slate-300 border-slate-600' };
}

function translateShippingStatus(s: string | null): { label: string; color: string } | null {
  if (!s) return null;
  const st = s.toLowerCase();
  if (st === 'delivered') return { label: 'Entregue', color: 'bg-emerald-900/60 text-emerald-300' };
  if (st === 'shipped' || st === 'ready_to_ship') return { label: 'A caminho', color: 'bg-blue-900/60 text-blue-300' };
  if (st === 'not_delivered') return { label: 'Não entregue', color: 'bg-red-900/60 text-red-400' };
  if (st === 'pending') return { label: 'Pendente', color: 'bg-slate-700 text-slate-300' };
  return { label: s, color: 'bg-slate-700 text-slate-300' };
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  paid: 'Pago',
  payment_required: 'Aguardando pgto',
  cancelled: 'Cancelado',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  paid: 'bg-emerald-900 text-emerald-300',
  payment_required: 'bg-amber-900 text-amber-300',
  cancelled: 'bg-red-900 text-red-400',
};

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
                  <span className="text-xs text-slate-400">{s.delivery_range ? `${s.delivery_range.min}-${s.delivery_range.max} dias uteis` : '—'}</span>
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


// ─── ME Status ──────────────────────────────────────────────────────────────

const ME_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  pending_address: 'Aguard. endereço',
  address_confirmed: 'Endereço OK',
  simulated: 'Simulado',
  label_generated: 'Etiqueta gerada',
  posted: 'Postado',
  in_transit: 'Em trânsito',
  delivered: 'Entregue',
  error: 'Erro',
};

const ME_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-700 text-slate-300',
  pending_address: 'bg-amber-900/60 text-amber-300',
  address_confirmed: 'bg-sky-900/60 text-sky-300',
  simulated: 'bg-indigo-900/60 text-indigo-300',
  label_generated: 'bg-purple-900/60 text-purple-300',
  posted: 'bg-blue-900/60 text-blue-300',
  in_transit: 'bg-cyan-900/60 text-cyan-300',
  delivered: 'bg-emerald-900/60 text-emerald-300',
  error: 'bg-red-900/60 text-red-400',
};

const ME_TIMELINE_STEPS = [
  'pending', 'address_confirmed', 'simulated', 'label_generated', 'posted', 'in_transit', 'delivered',
];

function getMeStepIndex(status: string | null): number {
  if (!status) return -1;
  return ME_TIMELINE_STEPS.indexOf(status);
}

// ─── ME Detail Drawer ───────────────────────────────────────────────────────

function MeDrawer({
  order,
  onClose,
  onAction,
}: {
  order: Order;
  onClose: () => void;
  onAction: () => void;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editingAddr, setEditingAddr] = useState(false);
  const [addrForm, setAddrForm] = useState({
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', nome: '', telefone: '',
  });
  const [addrLoading, setAddrLoading] = useState(false);
  const [simServices, setSimServices] = useState<FreightService[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const currentStep = getMeStepIndex(order.me_status);

  // Simulate freight for a given CEP
  const simulateFreight = useCallback(async (cep: string) => {
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await fetch('/api/melhor-envio/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.ml_order_id, to_zip: cep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro na simulação');
      setSimServices(data.services ?? []);
    } catch (e: any) {
      setSimError(e.message);
    }
    setSimLoading(false);
  }, [order.ml_order_id]);

  // Load address from ML API
  const loadAddress = useCallback(async () => {
    setAddrLoading(true);
    try {
      const res = await fetch(`/api/melhor-envio/confirm-address/${order.ml_order_id}`);
      const data = await res.json();
      const src = data.me_delivery_address ?? data.ml_address;
      if (src) {
        const filled = {
          cep: src.cep ?? '', rua: src.rua ?? '', numero: src.numero ?? '',
          complemento: src.complemento ?? '', bairro: src.bairro ?? '',
          cidade: src.cidade ?? '', estado: src.estado ?? '',
          nome: src.nome ?? '', telefone: src.telefone ?? '',
        };
        setAddrForm(prev => ({ ...prev, ...filled }));

        // Auto-save if from ML API and not yet saved
        if (!data.me_delivery_address && data.ml_address && filled.cep) {
          fetch(`/api/melhor-envio/confirm-address/${order.ml_order_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filled),
          }).catch(() => {});
        }

        return filled.cep;
      }
    } catch { /* ignore */ }
    setAddrLoading(false);
    return null;
  }, [order.ml_order_id]);

  const saveAddress = async () => {
    setActionLoading('save-addr');
    setActionError(null);
    try {
      const res = await fetch(`/api/melhor-envio/confirm-address/${order.ml_order_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addrForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');
      setEditingAddr(false);
      setActionSuccess('save-addr');
      // Auto-simulate BEFORE reloading (onAction may reset drawer)
      if (addrForm.cep && addrForm.cep.length >= 8 && !order.me_order_id) {
        simulateFreight(addrForm.cep);
      }
      onAction();
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(null);
  };

  // Single init effect: load address if needed, then auto-simulate
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Small delay to let portal mount cleanly
      await new Promise(r => setTimeout(r, 150));
      if (cancelled) return;

      const existingCep = order.me_delivery_address?.cep;
      if (existingCep && existingCep.length >= 8) {
        // Already have address — just simulate
        if (!order.me_order_id) {
          simulateFreight(existingCep);
        }
      } else {
        // No address — try loading from ML API
        const cep = await loadAddress();
        if (!cancelled && cep && cep.length >= 8 && !order.me_order_id) {
          simulateFreight(cep);
        }
      }
    };
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const doAction = async (action: string, url: string, method = 'POST', body?: object) => {
    setActionLoading(action);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setActionSuccess(action);
      onAction(); // reload orders
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(null);
  };

  // Use DB address or fall back to locally loaded address (from ML API)
  const addr = order.me_delivery_address ?? (addrForm.cep ? addrForm : null);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-700/50 h-full overflow-y-auto p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Envio Próprio</h2>
            <p className="text-xs text-slate-500 font-mono">#{order.ml_order_id}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">&times;</button>
        </div>

        {/* Timeline */}
        <div className="space-y-1">
          <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Timeline</h3>
          <div className="flex items-center gap-1">
            {ME_TIMELINE_STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${i <= currentStep
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-500'
                    }
                    ${i === currentStep ? 'ring-2 ring-emerald-400' : ''}
                  `}
                  title={ME_STATUS_LABEL[step] ?? step}
                >
                  {i + 1}
                </div>
                {i < ME_TIMELINE_STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 ${i < currentStep ? 'bg-emerald-600' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Status: <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ME_STATUS_COLOR[order.me_status ?? ''] ?? 'bg-slate-700 text-slate-300'}`}>
              {ME_STATUS_LABEL[order.me_status ?? ''] ?? order.me_status ?? '—'}
            </span>
          </p>
        </div>

        {/* Delivery Address */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Endereço de Entrega</h3>
            {!editingAddr && (
              <button
                onClick={() => { setEditingAddr(true); loadAddress(); }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                {addr ? 'Editar' : 'Preencher'}
              </button>
            )}
          </div>

          {editingAddr ? (
            <div className="bg-slate-800 rounded-lg p-3 space-y-2">
              {addrLoading ? (
                <p className="text-xs text-slate-500">Buscando endereço...</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="CEP *" maxLength={9} className="col-span-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.cep} onChange={e => setAddrForm(f => ({ ...f, cep: e.target.value.replace(/\D/g, '') }))} />
                    <input placeholder="Estado (UF) *" maxLength={2} className="col-span-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 uppercase"
                      value={addrForm.estado} onChange={e => setAddrForm(f => ({ ...f, estado: e.target.value.toUpperCase() }))} />
                  </div>
                  <input placeholder="Rua / Logradouro *" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    value={addrForm.rua} onChange={e => setAddrForm(f => ({ ...f, rua: e.target.value }))} />
                  <div className="grid grid-cols-3 gap-2">
                    <input placeholder="Número" className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.numero} onChange={e => setAddrForm(f => ({ ...f, numero: e.target.value }))} />
                    <input placeholder="Complemento" className="col-span-2 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.complemento} onChange={e => setAddrForm(f => ({ ...f, complemento: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Bairro" className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.bairro} onChange={e => setAddrForm(f => ({ ...f, bairro: e.target.value }))} />
                    <input placeholder="Cidade *" className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.cidade} onChange={e => setAddrForm(f => ({ ...f, cidade: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Nome destinatário" className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.nome} onChange={e => setAddrForm(f => ({ ...f, nome: e.target.value }))} />
                    <input placeholder="Telefone" className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      value={addrForm.telefone} onChange={e => setAddrForm(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveAddress} disabled={actionLoading === 'save-addr'}
                      className="flex-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 text-white text-xs font-medium rounded transition-colors">
                      {actionLoading === 'save-addr' ? 'Salvando...' : 'Confirmar Endereço'}
                    </button>
                    <button onClick={() => setEditingAddr(false)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors">
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : addr ? (
            <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-0.5">
              {addr.nome && <p className="text-white font-medium">{addr.nome}</p>}
              <p>{addr.rua || (addr as any).logradouro}, {addr.numero}{addr.complemento ? ` - ${addr.complemento}` : ''}</p>
              <p>{addr.bairro} — {addr.cidade}/{addr.estado}</p>
              <p className="font-mono">{addr.cep}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Endereço não confirmado — clique em &quot;Preencher&quot;</p>
          )}
        </div>

        {/* Freight Simulation — inline card */}
        {!order.me_order_id && addr?.cep && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Simulação de Frete</h3>
              <button
                onClick={() => simulateFreight(addr.cep)}
                disabled={simLoading}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-slate-600"
              >
                {simLoading ? 'Cotando...' : '↻ Recotar'}
              </button>
            </div>

            {simLoading && (
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 animate-pulse">Consultando Melhor Envio...</p>
              </div>
            )}

            {simError && (
              <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3">
                <p className="text-xs text-red-400">{simError}</p>
              </div>
            )}

            {!simLoading && simServices.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {simServices.filter(s => !s.error).map(s => (
                  <div key={s.id} className={`p-3 rounded-xl border ${s.name === 'PAC' ? 'border-emerald-700/50 bg-emerald-950/30' : 'border-blue-700/50 bg-blue-950/30'}`}>
                    <p className="text-xs font-semibold text-white mb-1">{s.name}</p>
                    <p className="text-lg font-bold text-white">R$ {s.price}</p>
                    {s.delivery_range && (
                      <p className="text-[10px] text-slate-400 mt-1">{s.delivery_range.min}–{s.delivery_range.max} dias úteis</p>
                    )}
                    {s.adicional && (
                      <p className="text-[10px] text-amber-400 mt-0.5">+R$ {s.adicional} vs PAC</p>
                    )}
                  </div>
                ))}
                {simServices.some(s => s.error) && (
                  <p className="col-span-2 text-[10px] text-amber-400">
                    {simServices.filter(s => s.error).map(s => `${s.name}: ${s.error}`).join(' | ')}
                  </p>
                )}
              </div>
            )}

            {!simLoading && simServices.length === 0 && !simError && (
              <p className="text-xs text-slate-500">Nenhum serviço disponível.</p>
            )}
          </div>
        )}

        {/* ME Info */}
        {order.me_order_id && (
          <div className="space-y-1">
            <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Etiqueta</h3>
            <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-1">
              <p>Transportadora: <span className="text-white font-medium">{order.me_carrier?.toUpperCase() ?? '—'}</span></p>
              <p>Custo: <span className="text-white font-medium">R$ {order.me_cost?.toFixed(2) ?? '—'}</span></p>
              {order.me_tracking_code && (
                <p>Rastreio: <span className="text-white font-mono font-medium">{order.me_tracking_code}</span></p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Ações</h3>

          {/* Gerar Etiqueta — only when address confirmed in DB */}
          {(!order.me_order_id || order.me_status === 'error') && order.me_delivery_address?.cep && (
            <div className="flex gap-2">
              <button
                disabled={!!actionLoading}
                onClick={() => doAction('create-pac', '/api/melhor-envio/create-label', 'POST', { ml_order_id: order.ml_order_id, carrier: 'pac' })}
                className="flex-1 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {actionLoading === 'create-pac' ? 'Gerando...' : '📦 PAC (grátis)'}
              </button>
              <button
                disabled={!!actionLoading}
                onClick={() => doAction('create-sedex', '/api/melhor-envio/create-label', 'POST', { ml_order_id: order.ml_order_id, carrier: 'sedex' })}
                className="flex-1 px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {actionLoading === 'create-sedex' ? 'Gerando...' : `⚡ SEDEX${simServices.find(s => s.name === 'SEDEX')?.adicional ? ` (+R$ ${simServices.find(s => s.name === 'SEDEX')?.adicional})` : ''}`}
              </button>
            </div>
          )}

          {/* Enviar Rastreio — available when label generated */}
          {order.me_tracking_code && order.me_status === 'label_generated' && (
            <button
              disabled={!!actionLoading}
              onClick={() => doAction('send-tracking', `/api/melhor-envio/send-tracking/${order.ml_order_id}`, 'POST')}
              className="w-full px-3 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {actionLoading === 'send-tracking' ? 'Enviando...' : '📨 Enviar Rastreio ao Comprador'}
            </button>
          )}

          {/* Ver Rastreio — available when posted or later */}
          {order.me_order_id && ['posted', 'in_transit', 'delivered'].includes(order.me_status ?? '') && (
            <button
              disabled={!!actionLoading}
              onClick={() => doAction('track', `/api/melhor-envio/track/${order.ml_order_id}`, 'GET')}
              className="w-full px-3 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {actionLoading === 'track' ? 'Consultando...' : '🔍 Atualizar Rastreio'}
            </button>
          )}

          {/* Cancelar Etiqueta — available when label generated but not yet posted */}
          {order.me_order_id && ['label_generated', 'error'].includes(order.me_status ?? '') && (
            <button
              disabled={!!actionLoading}
              onClick={() => doAction('cancel-label', `/api/melhor-envio/cancel/${order.ml_order_id}`, 'POST')}
              className="w-full px-3 py-2 bg-red-900/60 hover:bg-red-800 disabled:bg-slate-700 text-red-300 text-xs font-medium rounded-lg border border-red-700/50 transition-colors"
            >
              {actionLoading === 'cancel-label' ? 'Cancelando...' : '✕ Cancelar Etiqueta (estorna saldo)'}
            </button>
          )}

          {/* Label PDF link */}
          {order.me_label_url && (
            <a
              href={order.me_label_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg border border-slate-600 transition-colors"
            >
              🖨️ Abrir Etiqueta PDF
            </a>
          )}

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          {actionSuccess && <p className="text-xs text-emerald-400">✓ {{
            'save-addr': 'Endereço de entrega salvo com sucesso!',
            'create-pac': 'Etiqueta PAC gerada! Verifique a fila de impressão.',
            'create-sedex': 'Etiqueta SEDEX gerada! Verifique a fila de impressão.',
            'send-tracking': 'Rastreio enviado ao comprador!',
            'track': 'Rastreio atualizado!',
            'cancel-label': 'Etiqueta cancelada! Saldo estornado.',
          }[actionSuccess] ?? `${actionSuccess} executado com sucesso`}</p>}
        </div>

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

const PRINT_STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  pending: 'Pendente',
  printing: 'Imprimindo',
  done: 'Impresso',
  error: 'Erro',
};

const PRINT_STATUS_COLOR: Record<string, string> = {
  queued: 'bg-slate-700 text-slate-300',
  pending: 'bg-blue-900 text-blue-300',
  printing: 'bg-amber-900 text-amber-300',
  done: 'bg-emerald-900 text-emerald-300',
  error: 'bg-red-900 text-red-400',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function formatItems(items: OrderItem[] | null): string {
  if (!items || items.length === 0) return '—';
  return items.map(i => `${i.quantity}x ${i.title}`).join(', ');
}

export default function PedidosMLPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [freightModal, setFreightModal] = useState<string | null>(null);
  const [meDrawerOrder, setMeDrawerOrder] = useState<Order | null>(null);

  const [filterAccount, setFilterAccount] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo());
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
      setOrders(data.orders);
      setAccounts(data.accounts);
    }
    setLoading(false);
  }, [filterAccount, filterStatus, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const counts = {
    paid: orders.filter(o => o.status === 'paid').length,
    pending: orders.filter(o => o.status === 'payment_required').length,
    delivered: orders.filter(o => o.shipping_status === 'delivered').length,
    envioProprio: orders.filter(o => isEnvioProprio(o.logistic_type)).length,
  };

  return (
    <div className="p-6 space-y-6">
      {freightModal && (
        <FreightModal
          orderId={freightModal}
          onClose={() => setFreightModal(null)}
        />
      )}
      {meDrawerOrder && (
        <DrawerErrorBoundary onClose={() => setMeDrawerOrder(null)}>
          <MeDrawer
            order={meDrawerOrder}
            onClose={() => setMeDrawerOrder(null)}
            onAction={() => { load(); }}
          />
        </DrawerErrorBoundary>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Pedidos Mercado Livre</h1>
          <p className="text-sm text-slate-400 mt-0.5">Todos os pedidos por conta, status e período</p>
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
          { label: 'Pagos', value: counts.paid, color: 'text-emerald-300' },
          { label: 'Aguardando pgto', value: counts.pending, color: 'text-amber-300' },
          { label: 'Entregues', value: counts.delivered, color: 'text-blue-300' },
          { label: 'Envio próprio', value: counts.envioProprio, color: 'text-amber-400' },
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
              <option value="paid">Pago</option>
              <option value="payment_required">Aguardando pgto</option>
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
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Nenhum pedido encontrado no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Pedido</th>
                  <th className="text-left px-4 py-3 font-medium">Conta</th>
                  <th className="text-left px-4 py-3 font-medium">Comprador</th>
                  <th className="text-left px-4 py-3 font-medium">Itens</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 font-medium">Logística</th>
                  <th className="text-center px-4 py-3 font-medium">Anúncio</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Entrega</th>
                  <th className="text-center px-4 py-3 font-medium">Impressão</th>
                  <th className="text-center px-4 py-3 font-medium">ME Envio</th>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orders.map(order => {
                  const logistic = translateLogistic(order.logistic_type);
                  const listing = translateListingType(order.listing_type);
                  const shipping = translateShippingStatus(order.shipping_status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        #{order.ml_order_id}
                      </td>
                      <td className="px-4 py-3 text-white text-xs">{order.seller_nickname ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{order.buyer_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[220px] truncate" title={formatItems(order.items_json)}>
                        {formatItems(order.items_json)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-white whitespace-nowrap">
                        {order.total != null ? `R$ ${Number(order.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${logistic.color}`}>
                          {logistic.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {listing ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${listing.color}`}>
                            {listing.label}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLOR[order.status] ?? 'bg-slate-700 text-slate-300'}`}>
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {shipping ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${shipping.color}`}>
                            {shipping.label}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {order.print_status ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PRINT_STATUS_COLOR[order.print_status] ?? 'bg-slate-700 text-slate-300'}`}>
                            {PRINT_STATUS_LABEL[order.print_status] ?? order.print_status}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                        {order.print_status === 'error' && order.error_msg && (
                          <div className="text-xs text-red-400 mt-0.5 max-w-[120px] truncate" title={order.error_msg}>
                            {order.error_msg}
                          </div>
                        )}
                      </td>
                      {/* ME Envio status */}
                      <td className="px-4 py-3 text-center text-xs">
                        {isEnvioProprio(order.logistic_type) && order.me_status ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ME_STATUS_COLOR[order.me_status] ?? 'bg-slate-700 text-slate-300'}`}>
                            {ME_STATUS_LABEL[order.me_status] ?? order.me_status}
                          </span>
                        ) : isEnvioProprio(order.logistic_type) ? (
                          <span className="text-slate-600 text-xs">pendente</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isEnvioProprio(order.logistic_type) && (
                            <button
                              onClick={() => setMeDrawerOrder(order)}
                              className="text-indigo-400 hover:text-indigo-300 transition-colors text-xs font-medium whitespace-nowrap"
                              title="Gerenciar envio próprio (endereço + cotação + etiqueta)"
                            >
                              📦 Envio
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
