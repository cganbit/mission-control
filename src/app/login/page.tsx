'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        let msg = 'Credenciais inválidas';
        try {
          const data = await res.json() as { error?: string };
          msg = data.error ?? msg;
        } catch { /* body vazio ou inválido */ }
        setError(msg);
        setLoading(false);
      }
    } catch {
      setError('Erro de conexão. Verifique o servidor e tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎯</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Mission Control</h1>
          <p className="text-[var(--text-secondary)] mt-1">WingX</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--bg-surface)] rounded-xl p-8 border border-[var(--border)] shadow-2xl space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="w-full px-4 py-3 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-4 py-3 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-[var(--destructive)]/10 border border-[var(--destructive)] rounded-lg text-[var(--destructive)] text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-muted)] disabled:cursor-not-allowed text-[var(--text-primary)] font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
