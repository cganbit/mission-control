'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

// ─── Minimal UI Components (Standardized for Mission Control) ────────────────
function cn(...inputs: any[]) { return inputs.filter(Boolean).join(' '); }

function Badge({ label, variant = "secondary" }: { label: string | number; variant?: "default" | "destructive" | "secondary" | "outline" }) {
  const styles = {
    default: "bg-indigo-600 text-white",
    destructive: "bg-red-900/50 text-red-400 border border-red-500/50",
    secondary: "bg-slate-800 text-slate-300",
    outline: "border border-slate-700 text-slate-400"
  };
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider", styles[variant])}>
      {label}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-xl", className)}>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MercadoLivrePage() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/mercado-livre/stats')
      .then((res) => res.json())
      .then((data) => {
        setStats(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-10 w-64 bg-slate-800 rounded-lg"></div>
          <div className="h-6 w-32 bg-slate-800 rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 w-full bg-slate-900 border border-slate-800 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
           Gestão Mercado Livre 🛍️
        </h1>
        <Badge label="3 Lojas Ativas" variant="outline" />
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((store) => (
          <Card key={store.seller_id} className="hover:border-indigo-500/50 transition-all duration-300 group">
            <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-100 group-hover:text-indigo-400 transition-colors">{store.nickname}</h3>
              {store.status === 'active' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-500" />
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <ShoppingCart className="h-4 w-4 text-indigo-400" />
                  <span className="text-sm font-medium">Vendas Hoje:</span>
                </div>
                <span className="text-xl font-black text-white">{store.sales_today || 0}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <MessageSquare className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">Perguntas:</span>
                </div>
                <Badge 
                  label={`${store.pending_questions || 0} pendentes`} 
                  variant={store.pending_questions > 0 ? "destructive" : "secondary"} 
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-baseline">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Receita Bruta</span>
                <span className="text-md font-bold text-emerald-400">R$ {(store.total_amount || 0).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Placeholders for Future Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
          <Card className="bg-slate-900/20 border-dashed">
             <div className="p-4 border-b border-slate-800 font-bold text-sm text-slate-400 uppercase tracking-widest">Unified Inbox ⌨️</div>
             <div className="p-10 flex items-center justify-center text-slate-500 text-sm italic">
                 Integração de chat em tempo real nas próximas sprints...
             </div>
          </Card>
          <Card className="bg-slate-900/20 border-dashed">
             <div className="p-4 border-b border-slate-800 font-bold text-sm text-slate-400 uppercase tracking-widest">Logística Baterias 🔋</div>
             <div className="p-10 flex items-center justify-center text-slate-500 text-sm italic text-center">
                 Cotação automática via Melhor Envio<br/>disponível em breve.
             </div>
          </Card>
      </div>
    </div>
  );
}
