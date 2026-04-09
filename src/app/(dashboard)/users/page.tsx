'use client';

import { useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: 'admin' | 'member' | 'viewer';
  active: boolean;
  created_at: string;
  last_login: string | null;
}

interface AccessLog {
  id: string;
  user_id: string | null;
  username: string;
  session_id: string;
  action: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  logout_at: string | null;
  duration_minutes: number | null;
}

const ROLE_COLOR: Record<string, string> = {
  admin:  'bg-[var(--brand)]/15 text-[var(--brand)] border-[var(--brand)]/40',
  member: 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/40',
  viewer: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border-[var(--border-strong)]',
};
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', member: 'Membro', viewer: 'Viewer' };

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'nunca';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s atrás`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function formatDuration(min: number | null): string {
  if (min === null) return '—';
  if (min < 1)  return '< 1min';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function shortUA(ua: string | null): string {
  if (!ua) return '—';
  if (ua.includes('Chrome'))  return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari'))  return 'Safari';
  if (ua.includes('Edge'))    return 'Edge';
  return ua.slice(0, 30);
}

type Tab = 'users' | 'logs';

export default function UsersPage() {
  const [tab, setTab]           = useState<Tab>('users');
  const [users, setUsers]       = useState<User[]>([]);
  const [logs, setLogs]         = useState<AccessLog[]>([]);
  const [me, setMe]             = useState<{ id: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm]         = useState({
    username: '', name: '', email: '', password: '', confirmPassword: '', role: 'viewer',
  });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [logFilter, setLogFilter] = useState('');

  const load = useCallback(async () => {
    const [usersRes, meRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    setMe(meRes as { id: string });
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await fetch('/api/access-logs?limit=200');
    if (res.ok) setLogs(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  function startCreate() {
    setForm({ username: '', name: '', email: '', password: '', confirmPassword: '', role: 'viewer' });
    setEditUser(null);
    setError('');
    setShowForm(true);
  }

  function startEdit(user: User) {
    setForm({ username: user.username, name: user.name, email: user.email ?? '', password: '', confirmPassword: '', role: user.role });
    setEditUser(user);
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validate password confirmation
    if (!editUser && form.password !== form.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    if (editUser && form.password && form.password !== form.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setSaving(true);
    try {
      if (editUser) {
        const body: Record<string, string | boolean | null> = {
          name: form.name,
          email: form.email || null,
          role: form.role,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/users/${editUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Erro ao atualizar');
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: form.username.toLowerCase().trim(),
            name: form.name,
            email: form.email || undefined,
            password: form.password,
            role: form.role,
          }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Erro ao criar');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    await load();
  }

  async function deleteUser(user: User) {
    if (!confirm(`Deletar usuário "${user.name}"? Esta ação é irreversível.`)) return;
    await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    await load();
  }

  const adminCount   = users.filter(u => u.role === 'admin').length;
  const filteredLogs = logFilter
    ? logs.filter(l => l.username.includes(logFilter.toLowerCase()) || (l.ip ?? '').includes(logFilter))
    : logs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Usuários</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { load(); if (tab === 'logs') loadLogs(); }}
            className="px-3 py-1.5 bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] text-xs rounded-lg transition-colors">
            ↻ Atualizar
          </button>
          {tab === 'users' && (
            <button onClick={startCreate}
              className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] text-sm font-medium rounded-lg transition-colors">
              + Novo Usuário
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-1 w-fit">
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'users' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          👤 Usuários
        </button>
        <button onClick={() => setTab('logs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'logs' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          📋 Logs de Acesso
        </button>
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Admins',  value: users.filter(u => u.role === 'admin').length,  icon: '🔑' },
              { label: 'Membros', value: users.filter(u => u.role === 'member').length, icon: '👥' },
              { label: 'Viewers', value: users.filter(u => u.role === 'viewer').length, icon: '👁️' },
            ].map(s => (
              <div key={s.label} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{s.value}</div>
                  <div className="text-xs text-[var(--text-muted)]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          {showForm && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="font-semibold text-[var(--text-primary)] mb-4">
                {editUser ? `Editar — ${editUser.name}` : 'Novo Usuário'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Username *</label>
                    <input
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                      disabled={!!editUser}
                      placeholder="joao.silva"
                      className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
                      required={!editUser}
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">Apenas letras minúsculas, números e pontos</p>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Nome Completo *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="João Silva"
                      className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">E-mail de recuperação</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="joao@empresa.com"
                      className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Role *</label>
                    <select
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="viewer">Viewer — somente leitura</option>
                      <option value="member">Membro — lê e edita</option>
                      <option value="admin">Admin — acesso total</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">
                      Senha {editUser ? '(deixe em branco para manter)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className={`w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                        form.confirmPassword && form.password !== form.confirmPassword
                          ? 'border-[var(--destructive)]' : 'border-[var(--border)]'
                      }`}
                      required={!editUser}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">
                      Confirmar senha {editUser ? '' : '*'}
                    </label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className={`w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                        form.confirmPassword && form.password !== form.confirmPassword
                          ? 'border-[var(--destructive)]' : 'border-[var(--border)]'
                      }`}
                      required={!editUser}
                    />
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <p className="text-xs text-[var(--destructive)] mt-1">As senhas não coincidem</p>
                    )}
                    {form.confirmPassword && form.password === form.confirmPassword && form.password && (
                      <p className="text-xs text-[var(--accent)] mt-1">✓ Senhas coincidem</p>
                    )}
                  </div>
                </div>

                {/* Role cards */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {[
                    { role: 'viewer', label: 'Viewer', desc: 'Ver dashboards, tarefas, agentes. Não edita.' },
                    { role: 'member', label: 'Membro', desc: 'Criar e editar squads, tarefas, agentes. Sem Conectores.' },
                    { role: 'admin',  label: 'Admin',  desc: 'Acesso total: conectores, usuários, configurações.' },
                  ].map(r => (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, role: r.role }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${form.role === r.role ? ROLE_COLOR[r.role] : 'bg-[var(--bg-muted)]/50 border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}
                    >
                      <div className="font-semibold mb-1">{r.label}</div>
                      <div className="opacity-80 leading-relaxed">{r.desc}</div>
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="px-4 py-2 bg-[var(--destructive)]/10 border border-[var(--destructive)] rounded-lg text-[var(--destructive)] text-sm">{error}</div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving || (!editUser && form.password !== form.confirmPassword)}
                    className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-muted)] disabled:cursor-not-allowed text-[var(--text-primary)] text-sm font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Salvando...' : editUser ? 'Salvar Alterações' : 'Criar Usuário'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm rounded-lg transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Usuário</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">E-mail</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Último login</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/50">
                {users.map(user => {
                  const isSelf = me?.id === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-[var(--bg-muted)]/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-muted)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)] flex-shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{user.name}</div>
                            <div className="text-xs text-[var(--text-muted)] font-mono">@{user.username}</div>
                          </div>
                          {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-muted)]">você</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--text-muted)]">{user.email ?? <span className="text-[var(--text-muted)] italic">—</span>}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLOR[user.role]}`}>
                          {ROLE_LABEL[user.role]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
                          <span className={`text-xs ${user.active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                            {user.active ? 'Ativo' : 'Desativado'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--text-muted)]">{timeAgo(user.last_login)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => startEdit(user)}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-muted)] transition-colors">
                            Editar
                          </button>
                          {!isSelf && (
                            <>
                              <button onClick={() => toggleActive(user)}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  user.active
                                    ? 'text-[var(--warning)] hover:bg-[var(--warning)]/10'
                                    : 'text-[var(--accent)] hover:bg-[var(--accent)]/10'
                                }`}>
                                {user.active ? 'Desativar' : 'Ativar'}
                              </button>
                              {!(user.role === 'admin' && adminCount <= 1) && (
                                <button onClick={() => deleteUser(user)}
                                  className="text-xs text-[var(--destructive)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-[var(--destructive)]/10 transition-colors">
                                  Deletar
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── LOGS TAB ── */}
      {tab === 'logs' && (
        <>
          <div className="flex items-center gap-3">
            <input
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              placeholder="Filtrar por usuário ou IP..."
              className="px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] w-64"
            />
            <span className="text-xs text-[var(--text-muted)]">{filteredLogs.length} registros</span>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Usuário</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Data/Hora</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">IP</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Navegador</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Logout</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/50">
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-[var(--text-muted)] text-sm">Nenhum log encontrado</td></tr>
                ) : filteredLogs.map(log => {
                  const stillActive = !log.logout_at;
                  return (
                    <tr key={log.id} className="hover:bg-[var(--bg-muted)]/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${stillActive ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
                          <span className="font-mono text-sm text-[var(--text-primary)]">@{log.username}</span>
                          {stillActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)]">online</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                        <div className="text-[var(--text-muted)] text-[10px] mt-0.5">{timeAgo(log.created_at)}</div>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-[var(--text-muted)]">{log.ip ?? '—'}</td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">{shortUA(log.user_agent)}</td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                        {log.logout_at
                          ? new Date(log.logout_at).toLocaleString('pt-BR')
                          : <span className="text-[var(--accent)] text-[10px]">sessão ativa</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)] font-medium">
                        {formatDuration(log.duration_minutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
