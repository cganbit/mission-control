'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, TrendingUp, MessageSquare, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(' '); }

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function getMesAtual() {
  return new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

interface StoreStats {
  nickname: string;
  seller_id: number;
  status: string;
  sales_today: number;
  sales_total: number;
  month_revenue: number;
  pending_questions: number;
  error?: string;
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 bg-slate-800/50 rounded-lg">
      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">{label}</span>
      <span className="text-2xl font-black text-white">{value}</span>
      {sub && <span className="text-[10px] text-slate-600 mt-0.5">{sub}</span>}
    </div>
  );
}

function StoreCard({ store }: { store: StoreStats }) {
  const isError = store.status === 'error';
  return (
    <div className={cn(
      "bg-slate-900/50 border rounded-xl overflow-hidden shadow-xl transition-all duration-300 group",
      isError ? "border-rose-800/50" : "border-slate-800 hover:border-indigo-500/50"
    )}>
      {/* Header */}
      <div className="px-5 py-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
        <h3 className="font-bold text-base text-slate-100 group-hover:text-indigo-400 transition-colors tracking-wide">
          {store.nickname}
        </h3>
        {isError
          ? <AlertCircle className="h-4 w-4 text-rose-500" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        }
      </div>

      {isError ? (
        <div className="p-5 text-sm text-rose-400">{store.error || 'Erro ao carregar dados'}</div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Vendas: Hoje vs Total */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Hoje" value={fmt(store.sales_today)} />
            <StatBox label="Total" value={
              store.sales_total >= 1000
                ? `${(store.sales_total / 1000).toFixed(1)}k`
                : fmt(store.sales_total)
            } />
          </div>

          {/* Perguntas pendentes */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-slate-400">
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

          {/* Faturamento do Mês */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                Faturamento — {getMesAtual()}
              </span>
            </div>
            <p className="text-xl font-black text-emerald-400 tabular-nums">
              {fmtBRL(store.month_revenue)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MercadoLivrePage() {
  const [stats, setStats] = useState<StoreStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchStats = () => {
    setLoading(true);
    fetch('/api/mercado-livre/stats')
      .then(r => r.json())
      .then(data => {
        setStats(Array.isArray(data) ? data : []);
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const totalHoje = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.sales_today || 0), 0);
  const totalMes = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.month_revenue || 0), 0);
  const totalPerguntas = stats.filter(s => s.status === 'active').reduce((a, s) => a + (s.pending_questions || 0), 0);
  const activeCount = stats.filter(s => s.status === 'active').length;

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-72 bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-6 bg-slate-800 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-52 bg-slate-900 border border-slate-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-indigo-400" />
            Gestão Mercado Livre
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {activeCount} {activeCount === 1 ? 'loja ativa' : 'lojas ativas'}
            {lastUpdate && (
              <span className="ml-2 text-slate-600">
                · Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-all"
        >
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </button>
      </div>

      {/* Totalizadores */}
      {activeCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Vendas Hoje (Total)</p>
            <p className="text-3xl font-black text-white">{fmt(totalHoje)}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Faturamento {getMesAtual()}</p>
            <p className="text-2xl font-black text-emerald-400">{fmtBRL(totalMes)}</p>
          </div>
          <div className={cn(
            "border rounded-xl p-4 text-center",
            totalPerguntas > 0 ? "bg-red-900/20 border-red-800/50" : "bg-slate-900/60 border-slate-800"
          )}>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Perguntas Pendentes</p>
            <p className={cn("text-3xl font-black", totalPerguntas > 0 ? "text-red-400" : "text-emerald-400")}>
              {totalPerguntas}
            </p>
          </div>
        </div>
      )}

      {/* Cards por loja */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {stats.map(store => <StoreCard key={store.seller_id} store={store} />)}
      </div>

      {/* Placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 opacity-50">
        <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
          <div className="p-4 border-b border-slate-800 font-bold text-xs text-slate-500 uppercase tracking-widest">
            Unified Inbox ⌨️
          </div>
          <div className="p-10 flex items-center justify-center text-slate-600 text-sm italic">
            Integração de chat em tempo real — próximas sprints
          </div>
        </div>
        <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
          <div className="p-4 border-b border-slate-800 font-bold text-xs text-slate-500 uppercase tracking-widest">
            Logística Baterias 🔋
          </div>
          <div className="p-10 flex items-center justify-center text-slate-600 text-sm italic text-center">
            Cotação automática via Melhor Envio — em breve
          </div>
        </div>
      </div>
    </div>
  );
}
