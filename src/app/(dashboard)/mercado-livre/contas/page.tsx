'use client';

import { useEffect, useState } from 'react';

interface Account {
  id: number;
  seller_id: string;
  nickname: string;
  owner_username: string | null;
  print_queue_enabled: boolean;
  notification_group: string;
  created_at: string;
}

interface AvailableToken {
  seller_id: number;
  nickname: string;
}


export default function ContasMLPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [availableTokens, setAvailableTokens] = useState<AvailableToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: number; value: string } | null>(null);
  const [form, setForm] = useState({ seller_id: '', nickname: '', notification_group: '', print_queue_enabled: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/mercado-livre/accounts');
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts);
      setAvailableTokens(data.availableTokens);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!form.seller_id || !form.notification_group) {
      setError('Selecione uma conta e informe o grupo de notificação');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch('/api/mercado-livre/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, seller_id: Number(form.seller_id) }),
    });
    setSaving(false);
    if (res.ok) {
      setShowAdd(false);
      setForm({ seller_id: '', nickname: '', notification_group: '', print_queue_enabled: true });
      load();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Erro ao salvar');
    }
  }

  async function togglePrint(id: number, current: boolean) {
    await fetch(`/api/mercado-livre/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ print_queue_enabled: !current }),
    });
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, print_queue_enabled: !current } : a));
  }

  async function saveGroup(id: number, value: string) {
    if (!value.trim()) return;
    await fetch(`/api/mercado-livre/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_group: value.trim() }),
    });
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, notification_group: value.trim() } : a));
    setEditingGroup(null);
  }

  async function handleDelete(id: number, nickname: string) {
    if (!confirm(`Remover conta ${nickname}?`)) return;
    await fetch(`/api/mercado-livre/accounts/${id}`, { method: 'DELETE' });
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Contas Mercado Livre</h1>
          <p className="text-sm text-slate-400 mt-0.5">Gerencie grupos de notificação e fila de impressão por conta</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Adicionar Conta
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Nenhuma conta configurada. Clique em "Adicionar Conta" para começar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Conta</th>
                <th className="text-left px-4 py-3 font-medium">Seller ID</th>
                <th className="text-left px-4 py-3 font-medium">Grupo de Notificação</th>
                <th className="text-center px-4 py-3 font-medium">Impressão</th>
                <th className="text-left px-4 py-3 font-medium">Dono</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {accounts.map(acc => (
                <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{acc.nickname}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{acc.seller_id}</td>
                  <td className="px-4 py-3">
                    {editingGroup?.id === acc.id ? (
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                          value={editingGroup.value}
                          onChange={e => setEditingGroup({ id: acc.id, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveGroup(acc.id, editingGroup.value); if (e.key === 'Escape') setEditingGroup(null); }}
                          autoFocus
                        />
                        <button onClick={() => saveGroup(acc.id, editingGroup.value)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded">✓</button>
                        <button onClick={() => setEditingGroup(null)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingGroup({ id: acc.id, value: acc.notification_group })}
                        className="text-slate-300 hover:text-white font-mono text-xs truncate max-w-[200px] block text-left hover:underline"
                        title={acc.notification_group}
                      >
                        {acc.notification_group}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePrint(acc.id, acc.print_queue_enabled)}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${acc.print_queue_enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
                      title={acc.print_queue_enabled ? 'Impressão ativa — clique para desativar' : 'Impressão desativada — clique para ativar'}
                    >
                      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${acc.print_queue_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{acc.owner_username ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          if (confirm(`Para reconectar "${acc.nickname}", você precisa estar logado no Mercado Livre com essa conta neste navegador.\n\nContinuar?`)) {
                            window.open('/api/mercado-livre/oauth/authorize', '_blank');
                          }
                        }}
                        className="text-amber-400 hover:text-amber-300 transition-colors text-xs font-medium"
                      >
                        Reconectar
                      </button>
                      <button
                        onClick={() => handleDelete(acc.id, acc.nickname)}
                        className="text-slate-500 hover:text-red-400 transition-colors text-xs"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Adicionar */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold">Adicionar Conta ML</h2>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Conta</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                value={form.seller_id}
                onChange={e => {
                  const token = availableTokens.find(t => String(t.seller_id) === e.target.value);
                  setForm(f => ({ ...f, seller_id: e.target.value, nickname: token?.nickname ?? '' }));
                }}
              >
                <option value="">Selecione uma conta...</option>
                {availableTokens.map(t => (
                  <option key={t.seller_id} value={t.seller_id}>{t.nickname} ({t.seller_id})</option>
                ))}
              </select>
              {availableTokens.length === 0 && (
                <p className="text-xs text-slate-500">Todas as contas do ml_tokens_json já estão configuradas.</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Grupo de Notificação</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="5511999999999@s.whatsapp.net ou grupo@g.us"
                value={form.notification_group}
                onChange={e => setForm(f => ({ ...f, notification_group: e.target.value }))}
              />
              <p className="text-xs text-slate-500">remoteJid do contato ou grupo WhatsApp</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm(f => ({ ...f, print_queue_enabled: !f.print_queue_enabled }))}
                className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${form.print_queue_enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
              >
                <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${form.print_queue_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-slate-300">Fila de impressão ativa</span>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(null); }}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
