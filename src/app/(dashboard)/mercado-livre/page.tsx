'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ShoppingCart, TrendingUp, MessageSquare, AlertCircle, CheckCircle2,
  RefreshCw, Package, DollarSign, ChevronDown, Send, Loader2, Edit2,
  Bell, BellOff, ExternalLink, Users, ChevronRight, ChevronDown as ChevronDownIcon,
  PlusCircle,
} from 'lucide-react';

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(' '); }
function fmt(value: number) { return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtBRL(value: number) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }); }
function getMesAtual() { return new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }); }

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StoreStats {
  nickname: string; seller_id: number; status: string;
  sales_count: number; revenue: number;
  pending_questions: number;
  pending_payment_count?: number;
  error?: string;
}

type Period = 'today' | '7d' | '30d' | '90d' | 'custom';
const PERIOD_LABELS: Record<Period, string> = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', custom: 'Período' };
interface Listing {
  id: string; title: string; price: number; available_quantity: number;
  sold_quantity: number; status: string; permalink: string; thumbnail: string;
}
interface Question {
  question_id: number; question_text: string; item_id: string;
  item_title: string; item_description: string; date_created: string;
  seller_id: number; nickname: string;
}
interface DREAccount {
  seller_id: number; nickname: string; period: { from: string; to: string };
  total_orders: number; faturamento_bruto: number;
  comissao_ml: number; faturamento_liquido: number; ticket_medio: number;
  error?: string;
}

// ─── Overview Components ────────────────────────────────────────────────────────

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-[var(--bg-muted)]/50 rounded-lg min-w-0">
      <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1 truncate w-full text-center">{label}</span>
      <span className="text-lg font-black text-[var(--text-primary)] w-full text-center truncate leading-tight" title={String(value)}>{value}</span>
      {sub && <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</span>}
    </div>
  );
}

function StoreCard({ store, periodLabel }: { store: StoreStats; periodLabel: string }) {
  const isError = store.status === 'error';
  return (
    <div className={cn(
      "bg-[var(--bg-surface)]/50 border rounded-xl overflow-hidden shadow-xl transition-all duration-300 group",
      isError ? "border-rose-800/50" : "border-[var(--border)] hover:border-[var(--accent)]/50"
    )}>
      <div className="px-5 py-3.5 bg-[var(--bg-surface)]/80 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors tracking-wide">
          {store.nickname}
        </h3>
        <div className="flex items-center gap-2">
          <a href="/mercado-livre/contas" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors" title="Configurar conta">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {isError ? <AlertCircle className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>
      </div>
      {isError ? (
        <div className="p-5 text-sm text-rose-400">{store.error || 'Erro ao carregar dados'}</div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Vendas" value={fmt(store.sales_count)} />
            <StatBox label="Faturamento" value={fmtBRL(store.revenue)} />
          </div>
          {(store.pending_payment_count ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                ⏳ {store.pending_payment_count} aguardando pagamento
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium">Perguntas pendentes</span>
            </div>
            {store.pending_questions > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-red-900/50 text-red-400 border border-red-500/50">
                {store.pending_questions} pendentes
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-900/30 text-emerald-400 border border-emerald-800/50">
                Em dia ✓
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Anúncios Tab ───────────────────────────────────────────────────────────────

function ListingsTab({ accounts }: { accounts: StoreStats[] }) {
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const activeAccounts = accounts.filter(a => a.status === 'active');

  const fetchListings = (sid: number) => {
    setSellerId(sid);
    setLoading(true);
    fetch(`/api/mercado-livre/listings?seller_id=${sid}&status=active`)
      .then(r => r.json())
      .then(d => { setListings(d.items || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const saveEdit = async (itemId: string) => {
    setSaving(true);
    const body: any = { seller_id: sellerId, item_id: itemId };
    if (editPrice) body.price = parseFloat(editPrice);
    if (editQty) body.available_quantity = parseInt(editQty);
    const res = await fetch('/api/mercado-livre/listings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());
    setSaving(false);
    setEditing(null);
    setMsg(res.ok ? 'Anúncio atualizado!' : `Erro: ${res.error}`);
    if (res.ok && sellerId) fetchListings(sellerId);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Seletor de conta */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            className="bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 pr-8 appearance-none focus:border-[var(--accent)] outline-none"
            onChange={e => fetchListings(Number(e.target.value))}
            defaultValue=""
          >
            <option value="" disabled>Selecionar conta…</option>
            {activeAccounts.map(a => (
              <option key={a.seller_id} value={a.seller_id}>{a.nickname}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-[var(--text-secondary)] pointer-events-none" />
        </div>
        {sellerId && <span className="text-xs text-[var(--text-muted)]">{total} anúncios</span>}
        {msg && <span className="text-xs text-emerald-400">{msg}</span>}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando anúncios…
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Anúncio</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-right">Estoque</th>
                <th className="px-4 py-3 text-right">Vendidos</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/50">
              {listings.map(item => (
                <tr key={item.id} className="hover:bg-[var(--bg-muted)]/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.thumbnail && (
                        <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover bg-[var(--bg-muted)] flex-shrink-0" />
                      )}
                      <div>
                        <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                          className="text-[var(--text-primary)] hover:text-[var(--accent)] font-medium line-clamp-2 transition-colors text-xs leading-snug">
                          {item.title}
                        </a>
                        <span className="text-[var(--text-muted)] text-[10px]">{item.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)] font-semibold">
                    {editing === item.id ? (
                      <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                        placeholder={String(item.price)}
                        className="w-24 bg-[var(--bg-muted)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded px-2 py-1 text-xs text-right" />
                    ) : fmtBRL(item.price)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                    {editing === item.id ? (
                      <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                        placeholder={String(item.available_quantity)}
                        className="w-16 bg-[var(--bg-muted)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded px-2 py-1 text-xs text-right" />
                    ) : item.available_quantity}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">{item.sold_quantity}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                      item.status === 'active' ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50" :
                      item.status === 'paused' ? "bg-amber-900/30 text-amber-400 border border-amber-800/50" :
                      "bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border)]"
                    )}>{item.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing === item.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => saveEdit(item.id)} disabled={saving}
                          className="text-[10px] px-2 py-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded font-bold disabled:opacity-50">
                          {saving ? '…' : 'Salvar'}
                        </button>
                        <button onClick={() => { setEditing(null); setEditPrice(''); setEditQty(''); }}
                          className="text-[10px] px-2 py-1 bg-[var(--bg-muted)] hover:bg-[var(--border)] text-[var(--text-primary)] rounded">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditing(item.id); setEditPrice(''); setEditQty(''); }}
                        className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors p-1.5 rounded hover:bg-[var(--bg-muted)]">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !listings.length && sellerId && (
        <div className="text-[var(--text-muted)] text-sm p-8 text-center border border-dashed border-[var(--border)] rounded-xl">
          Nenhum anúncio ativo encontrado.
        </div>
      )}

      {!sellerId && (
        <div className="text-[var(--text-muted)] text-sm p-12 text-center border border-dashed border-[var(--border)] rounded-xl">
          Selecione uma conta para ver os anúncios.
        </div>
      )}
    </div>
  );
}

// ─── Perguntas Tab ──────────────────────────────────────────────────────────────

function QuestionsTab({ accounts }: { accounts: StoreStats[] }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchQuestions = () => {
    setLoading(true);
    fetch('/api/mercado-livre/questions')
      .then(r => r.json())
      .then(d => { setQuestions(Array.isArray(d) ? d.filter((q: any) => !q.error) : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchQuestions(); }, []);

  const sendAnswer = async (q: Question) => {
    if (!answerText.trim()) return;
    setSending(true);
    const res = await fetch('/api/mercado-livre/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seller_id: q.seller_id, question_id: q.question_id, text: answerText }),
    }).then(r => r.json());
    setSending(false);
    setAnswering(null);
    setAnswerText('');
    setMsg(res.ok ? 'Resposta enviada!' : `Erro: ${res.error}`);
    if (res.ok) setQuestions(prev => prev.filter(p => p.question_id !== q.question_id));
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">{questions.length} pergunta(s) pendente(s)</span>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-[var(--accent)]">{msg}</span>}
          <button onClick={fetchQuestions}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando perguntas…
        </div>
      )}

      {!loading && questions.length === 0 && (
        <div className="text-[var(--text-muted)] text-sm p-12 text-center border border-dashed border-[var(--border)] rounded-xl">
          <CheckCircle2 className="h-8 w-8 text-[var(--accent)] mx-auto mb-3" />
          Nenhuma pergunta pendente. Todas respondidas!
        </div>
      )}

      <div className="space-y-3">
        {questions.map(q => (
          <div key={q.question_id} className="bg-[var(--bg-surface)]/50 border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30 rounded-full font-bold uppercase tracking-wider">
                    {q.nickname}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] truncate max-w-xs">{q.item_title}</span>
                </div>
                <p className="text-[var(--text-primary)] text-sm font-medium">{q.question_text}</p>
                {q.item_description && (
                  <p className="text-[var(--text-muted)] text-xs line-clamp-2">{q.item_description}</p>
                )}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                {new Date(q.date_created).toLocaleDateString('pt-BR')}
              </span>
            </div>

            {answering === q.question_id ? (
              <div className="space-y-2">
                <textarea
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  placeholder="Digite sua resposta…"
                  rows={3}
                  className="w-full bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 resize-none focus:border-[var(--accent)] outline-none"
                />
                <div className="flex items-center gap-2">
                  <button onClick={() => sendAnswer(q)} disabled={sending || !answerText.trim()}
                    className="flex items-center gap-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 rounded-lg font-bold disabled:opacity-50 transition-colors">
                    {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Enviar
                  </button>
                  <button onClick={() => { setAnswering(null); setAnswerText(''); }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAnswering(q.question_id)}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--accent)]/30 hover:border-[var(--accent)] px-3 py-1.5 rounded-lg transition-all">
                Responder
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Financeiro (DRE) Tab ───────────────────────────────────────────────────────

function FinanceiroTab() {
  const [dre, setDre] = useState<{ period: any; accounts: DREAccount[]; consolidated: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'current' | 'last'>('current');

  const fetchDRE = (p: 'current' | 'last') => {
    setPeriod(p);
    setLoading(true);
    const now = new Date();
    let from: string, to: string;
    if (p === 'current') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
    }
    fetch(`/api/mercado-livre/dre?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => r.json())
      .then(d => { setDre(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchDRE('current'); }, []);

  return (
    <div className="space-y-5">
      {/* Seletor de período */}
      <div className="flex items-center gap-2">
        {['current', 'last'].map(p => (
          <button key={p} onClick={() => fetchDRE(p as any)}
            className={cn(
              "text-xs px-4 py-1.5 rounded-lg border font-medium transition-all",
              period === p
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            )}>
            {p === 'current' ? 'Mês Atual' : 'Mês Anterior'}
          </button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />}
      </div>

      {/* Consolidado */}
      {dre?.consolidated && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-surface)]/60 border border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Faturamento Bruto</p>
            <p className="text-2xl font-black text-[var(--text-primary)]">{fmtBRL(dre.consolidated.faturamento_bruto)}</p>
          </div>
          <div className="bg-[var(--bg-surface)]/60 border border-[var(--brand)]/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Comissão ML (~18%)</p>
            <p className="text-2xl font-black text-[var(--brand)]">- {fmtBRL(dre.consolidated.comissao_ml)}</p>
          </div>
          <div className="bg-[var(--bg-surface)]/60 border border-[var(--accent)]/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Faturamento Líquido</p>
            <p className="text-2xl font-black text-[var(--accent)]">{fmtBRL(dre.consolidated.faturamento_liquido)}</p>
          </div>
        </div>
      )}

      {/* Por conta */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dre?.accounts.map(acc => (
          <div key={acc.seller_id} className={cn(
            "bg-[var(--bg-surface)]/50 border rounded-xl overflow-hidden",
            acc.error ? "border-rose-800/50" : "border-[var(--border)]"
          )}>
            <div className="px-4 py-3 bg-[var(--bg-surface)]/80 border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--text-primary)]">{acc.nickname}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{acc.total_orders} pedidos</span>
            </div>
            {acc.error ? (
              <div className="p-4 text-sm text-rose-400">{acc.error}</div>
            ) : (
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Bruto</span>
                  <span className="text-[var(--text-primary)] font-semibold">{fmtBRL(acc.faturamento_bruto)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Comissão ML</span>
                  <span className="text-[var(--brand)]">- {fmtBRL(acc.comissao_ml)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[var(--border)] pt-2 mt-2">
                  <span className="text-[var(--text-secondary)] font-bold">Líquido</span>
                  <span className="text-[var(--accent)] font-bold">{fmtBRL(acc.faturamento_liquido)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Ticket médio</span>
                  <span className="text-[var(--text-muted)]">{fmtBRL(acc.ticket_medio)}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Notificações (webhook) ──────────────────────────────────────────────────

function NotificacoesCard() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchSubs = () => {
    setLoading(true);
    fetch('/api/mercado-livre/webhook/register')
      .then(r => r.json())
      .then(d => { setSubs(Array.isArray(d) ? d : (d.subscriptions ?? [])); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchSubs(); }, []);

  const register = async () => {
    if (!callbackUrl.trim()) return;
    setSaving(true);
    const res = await fetch('/api/mercado-livre/webhook/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_url: callbackUrl.trim() }),
    }).then(r => r.json());
    setSaving(false);
    if (res.ok) {
      setMsg({ text: 'Webhook registrado!', ok: true });
      setCallbackUrl('');
      fetchSubs();
    } else {
      setMsg({ text: res.error ?? 'Erro ao registrar', ok: false });
    }
    setTimeout(() => setMsg(null), 5000);
  };

  const remove = async (id: string) => {
    await fetch('/api/mercado-livre/webhook/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: id }),
    });
    fetchSubs();
  };

  const activeSubs = subs.filter(s => s.active !== false);
  const hasActive = activeSubs.length > 0;

  return (
    <div className="bg-[var(--bg-surface)]/50 border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 bg-[var(--bg-surface)]/80 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasActive
            ? <Bell className="h-4 w-4 text-[var(--accent)]" />
            : <BellOff className="h-4 w-4 text-[var(--text-muted)]" />}
          <h3 className="font-bold text-sm text-[var(--text-primary)]">Notificações de Venda</h3>
        </div>
        {hasActive && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-900/30 text-emerald-400 border border-emerald-800/50">
            {activeSubs.length} ativo(s)
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando webhooks…
          </div>
        ) : activeSubs.length > 0 ? (
          <div className="space-y-2">
            {activeSubs.map((s, i) => (
              <div key={s.id ?? i} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] flex-shrink-0" />
                  <span className="text-[var(--text-secondary)] truncate">{s.callback_url ?? s.callbackUrl ?? 'orders_v2'}</span>
                </div>
                <button onClick={() => remove(s.id)}
                  className="text-[var(--destructive)] hover:text-[var(--destructive)] text-[10px] flex-shrink-0 px-2 py-0.5 border border-[var(--destructive)]/30 hover:border-[var(--destructive)] rounded transition-colors">
                  Remover
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-muted)] text-xs">Nenhum webhook ativo. Registre abaixo para receber notificações de venda no WhatsApp.</p>
        )}

        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Registrar Webhook</p>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={callbackUrl}
              onChange={e => setCallbackUrl(e.target.value)}
              placeholder="https://seu-dominio.com/api/mercado-livre/webhook"
              className="flex-1 bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button onClick={register} disabled={saving || !callbackUrl.trim()}
              className="flex items-center gap-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-2 rounded-lg font-bold disabled:opacity-50 transition-colors flex-shrink-0">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
              Ativar
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            ML exige HTTPS. Use um domínio com SSL ou configure Nginx + Let&apos;s Encrypt no VPS.
          </p>
          {msg && (
            <p className={cn("text-xs", msg.ok ? "text-emerald-400" : "text-rose-400")}>{msg.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Clientes Tab ───────────────────────────────────────────────────────────────

interface Pedido {
  order_id: number; seller: string; items: { title: string; quantity: number; unit_price: number }[];
  total: number; status: string; data: string;
}
interface Cliente {
  id: number; ml_buyer_id: number; nome: string; cpf: string; telefone: string;
  endereco_json: any; lead: boolean; total_pedidos: number; total_gasto: number;
  ultima_compra: string; primeira_compra: string; pedidos: Pedido[];
}

function ClientesTab() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchClientes = (q = '') => {
    setLoading(true);
    fetch(`/api/mercado-livre/clientes?limit=50&q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { setClientes(d.clientes ?? []); setTotal(d.total ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchClientes(); }, []);

  return (
    <div className="space-y-4">
      {/* Header + busca */}
      <div className="flex items-center gap-3">
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchClientes(search)}
          placeholder="Buscar por nome, CPF ou telefone…"
          className="flex-1 bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-lg px-3 py-2 focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button onClick={() => fetchClientes(search)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3 py-2 rounded-lg transition-all">
          <RefreshCw className="h-3.5 w-3.5" /> Buscar
        </button>
        <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{total} cliente(s)</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando clientes…
        </div>
      )}

      {!loading && clientes.length === 0 && (
        <div className="text-[var(--text-muted)] text-sm p-12 text-center border border-dashed border-[var(--border)] rounded-xl">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
          Nenhum cliente ainda. Os compradores aparecem aqui automaticamente após a primeira venda.
        </div>
      )}

      <div className="space-y-2">
        {clientes.map(c => (
          <div key={c.id} className="bg-[var(--bg-surface)]/50 border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Linha principal */}
            <button
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--bg-muted)]/30 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--accent-muted)] border border-[var(--accent)]/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[var(--accent)] text-xs font-bold">{(c.nome ?? '?')[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[var(--text-primary)] font-medium text-sm truncate">{c.nome ?? 'Sem nome'}</p>
                  {c.lead && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-900/40 text-amber-400 border border-amber-800/50 flex-shrink-0">
                      🔋 Lead
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {c.telefone && <span className="text-[var(--text-muted)] text-xs">📱 {c.telefone}</span>}
                  {c.cpf && <span className="text-[var(--text-muted)] text-xs">🪪 {c.cpf}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0 space-y-0.5">
                <p className="text-[var(--accent)] font-bold text-sm">
                  R$ {Number(c.total_gasto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
                <p className="text-[var(--text-muted)] text-[10px]">{c.total_pedidos} pedido(s)</p>
              </div>
              <div className="text-[var(--text-muted)] text-[10px] text-right flex-shrink-0 hidden md:block w-24">
                {c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('pt-BR') : '—'}
              </div>
              {expanded === c.id
                ? <ChevronDownIcon className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                : <ChevronRight className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />}
            </button>

            {/* Histórico expandido */}
            {expanded === c.id && (
              <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
                {/* Endereço */}
                {c.endereco_json && (
                  <div className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
                    <span>📍</span>
                    <span>
                      {c.endereco_json.street_name}, {c.endereco_json.street_number}
                      {c.endereco_json.comment ? ` (${c.endereco_json.comment})` : ''} —{' '}
                      {c.endereco_json.city?.name} / {c.endereco_json.state?.name}, CEP {c.endereco_json.zip_code}
                    </span>
                  </div>
                )}

                {/* Pedidos */}
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Histórico de Pedidos</p>
                <div className="space-y-2">
                  {(c.pedidos ?? []).map((p, i) => (
                    <div key={p.order_id ?? i} className="bg-[var(--bg-muted)]/50 rounded-lg px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Pedido #{p.order_id}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)]">{p.seller}</span>
                          <span className="text-[var(--accent)] font-bold text-xs">
                            R$ {Number(p.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      {(p.items ?? []).map((item, j) => (
                        <p key={j} className="text-xs text-[var(--text-muted)]">
                          • {item.quantity}x {item.title}
                        </p>
                      ))}
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {p.data ? new Date(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'anuncios' | 'perguntas' | 'financeiro' | 'clientes';

export default function MercadoLivrePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<StoreStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [periodLabel, setPeriodLabel] = useState('Hoje');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const fetchStats = useCallback((p: Period, cf?: string, ct?: string) => {
    setLoading(true);
    let url = `/api/mercado-livre/stats?period=${p}`;
    if (p === 'custom' && cf) {
      url += `&from=${cf}`;
      if (ct) url += `&to=${ct}`;
    }
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.accounts)) setStats(data.accounts);
        setPeriodLabel(data.period ?? PERIOD_LABELS[p]);
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStats('today'); }, [fetchStats]);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    setShowCustom(p === 'custom');
    if (p !== 'custom') fetchStats(p);
  };

  const totalVendas = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.sales_count || 0), 0);
  const totalRevenue = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.revenue || 0), 0);
  const totalPerguntas = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.pending_questions || 0), 0);
  const activeCount = stats.filter(s => s.status === 'active').length;

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: ShoppingCart },
    { id: 'anuncios' as Tab, label: 'Anúncios', icon: Package },
    { id: 'perguntas' as Tab, label: 'Perguntas', icon: MessageSquare, badge: totalPerguntas || null },
    { id: 'financeiro' as Tab, label: 'Financeiro', icon: DollarSign },
    { id: 'clientes' as Tab, label: 'Clientes', icon: Users },
  ];

  if (loading && !stats.length) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-72 bg-[var(--bg-muted)] rounded-lg" />
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-6 bg-[var(--bg-muted)] rounded-lg" />)}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-52 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-[var(--accent)]" />
            Gestão Mercado Livre
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {activeCount} {activeCount === 1 ? 'loja ativa' : 'lojas ativas'}
            {lastUpdate && (
              <span className="ml-2 text-[var(--text-muted)]">
                · Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Filtro de período */}
          <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-1">
            {(['today', '7d', '30d', '90d', 'custom'] as Period[]).map(p => (
              <button key={p} onClick={() => handlePeriod(p)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-all",
                  period === p ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <a href="/api/mercado-livre/oauth/authorize"
            className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--accent)]/50 hover:border-[var(--accent)] px-3 py-1.5 rounded-lg transition-all font-medium">
            <PlusCircle className="h-3.5 w-3.5" /> Conectar conta
          </a>
          <button onClick={() => fetchStats(period, customFrom || undefined, customTo || undefined)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-0">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                tab === t.id
                  ? "text-[var(--accent)] border-[var(--accent)]"
                  : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:border-[var(--border)]"
              )}>
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge ? (
                <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Datas personalizadas */}
          {showCustom && (
            <div className="flex items-center gap-2 bg-[var(--bg-surface)]/60 border border-[var(--border)] rounded-xl p-3">
              <span className="text-xs text-[var(--text-secondary)] font-medium flex-shrink-0">De</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] text-xs rounded-lg px-2 py-1.5 focus:border-[var(--accent)] outline-none" />
              <span className="text-xs text-[var(--text-secondary)] font-medium flex-shrink-0">até</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] text-xs rounded-lg px-2 py-1.5 focus:border-[var(--accent)] outline-none" />
              <button onClick={() => fetchStats('custom', customFrom || undefined, customTo || undefined)} disabled={!customFrom}
                className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
                Buscar
              </button>
            </div>
          )}

          {activeCount > 0 && (
            <div className={cn("grid grid-cols-3 gap-3 transition-opacity duration-200", loading && "opacity-40")}>
              <div className="bg-[var(--bg-surface)]/60 border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1 flex items-center justify-center gap-1">
                  Vendas — {periodLabel}
                  {loading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                </p>
                <p className="text-3xl font-black text-white">{fmt(totalVendas)}</p>
              </div>
              <div className="bg-[var(--bg-surface)]/60 border border-[var(--border)] rounded-xl p-4 text-center">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1 flex items-center justify-center gap-1">
                  Faturamento — {periodLabel}
                  {loading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                </p>
                <p className="text-2xl font-black text-emerald-400">{fmtBRL(totalRevenue)}</p>
              </div>
              <div className={cn("border rounded-xl p-4 text-center", totalPerguntas > 0 ? "bg-[var(--destructive)]/20 border-[var(--destructive)]/50" : "bg-[var(--bg-surface)]/60 border-[var(--border)]")}>
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest mb-1">Perguntas Pendentes</p>
                <p className={cn("text-3xl font-black", totalPerguntas > 0 ? "text-red-400" : "text-emerald-400")}>{totalPerguntas}</p>
              </div>
            </div>
          )}
          <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-5 transition-opacity duration-200", loading && "opacity-40 pointer-events-none")}>
            {stats.map(store => <StoreCard key={store.seller_id} store={store} periodLabel={periodLabel} />)}
          </div>
          <NotificacoesCard />
        </div>
      )}

      {tab === 'anuncios' && <ListingsTab accounts={stats} />}
      {tab === 'perguntas' && <QuestionsTab accounts={stats} />}
      {tab === 'financeiro' && <FinanceiroTab />}
      {tab === 'clientes' && <ClientesTab />}
    </div>
  );
}
