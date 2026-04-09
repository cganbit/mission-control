'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Doc {
  id: string;
  title: string;
  doc_type: string;
  format: string;
  tags: string;
  source: string;
  created_at: string;
  excerpt: string;
  content?: string;
  agent_name: string;
  squad_name: string;
  squad_color: string;
}

interface Squad { id: string; name: string; color: string }

const DOC_TYPES = ['report', 'analysis', 'proposal', 'summary', 'alert', 'log', 'other'];

const TYPE_COLORS: Record<string, string> = {
  report:   'bg-[var(--info-muted)] text-[var(--info)]',
  analysis: 'bg-[var(--bg-muted)] text-[var(--chart-5)]',
  proposal: 'bg-[var(--accent-muted)] text-[var(--accent)]',
  summary:  'bg-[var(--success-muted)] text-[var(--success)]',
  alert:    'bg-[var(--destructive-muted)] text-[var(--destructive)]',
  log:      'bg-[var(--bg-muted)] text-[var(--text-primary)]',
  other:    'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
};

const TYPE_ICONS: Record<string, string> = {
  report: '📊', analysis: '🔍', proposal: '📋', summary: '📝',
  alert: '🚨', log: '🗒️', other: '📄',
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function DocViewer({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    fetch(`/api/documents/${docId}`).then(r => r.json()).then(setDoc);
  }, [docId]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9998, animation: 'fadeIn 0.2s ease' }} />
      <div style={{ position: 'fixed', right: 0, top: 0, height: '100%', width: '640px', backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', zIndex: 9999, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', animation: 'slideIn 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        {!doc ? (
          <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">Carregando...</div>
        ) : (
          <>
            <div className="flex items-start gap-4 p-6 border-b border-[var(--border)]">
              <span className="text-2xl">{TYPE_ICONS[doc.doc_type] ?? '📄'}</span>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-[var(--text-primary)] leading-snug">{doc.title}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${TYPE_COLORS[doc.doc_type] ?? TYPE_COLORS.other}`}>
                    {doc.doc_type}
                  </span>
                  {doc.agent_name && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: doc.squad_color ?? 'var(--chart-5)' }} />
                      🤖 {doc.agent_name}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">{formatDate(doc.created_at)}</span>
                </div>
              </div>
              <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl flex-shrink-0">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed font-mono bg-[var(--bg-muted)]/50 rounded-lg p-4">
                {doc.content}
              </pre>
              {doc.tags && (
                <div className="flex gap-1.5 mt-4 flex-wrap">
                  {doc.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="text-[10px] bg-[var(--bg-muted)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

export default function DocumentsPage() {
  const [docs, setDocs]     = useState<Doc[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType]   = useState('');
  const [filterSquad, setFilterSquad] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm] = useState({ squad_id: '', title: '', content: '', doc_type: 'report', tags: '', source: '' });
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = search) => {
    const p = new URLSearchParams();
    if (q)           p.set('q', q);
    if (filterType)  p.set('doc_type', filterType);
    if (filterSquad) p.set('squad_id', filterSquad);
    const [docsRes, squadsRes] = await Promise.all([
      fetch(`/api/documents?${p}`).then(r => r.json()),
      fetch('/api/squads').then(r => r.json()),
    ]);
    setDocs(Array.isArray(docsRes) ? docsRes : []);
    setSquads(Array.isArray(squadsRes) ? squadsRes : []);
  }, [search, filterType, filterSquad]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(val), 300);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ squad_id: '', title: '', content: '', doc_type: 'report', tags: '', source: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Apagar documento?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Documentos</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Relatórios e análises gerados pelos agentes</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] text-sm font-medium rounded-lg transition-colors"
        >
          + Novo Documento
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">🔍</span>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por título, conteúdo ou tags..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none">
          <option value="">Todos os tipos</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
        </select>
        <select value={filterSquad} onChange={e => setFilterSquad(e.target.value)}
          className="px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none">
          <option value="">Todos os squads</option>
          {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-6">
          <h2 className="font-semibold text-[var(--text-primary)] mb-4">Novo Documento</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Squad *</label>
                <select value={form.squad_id} onChange={e => setForm(f => ({ ...f, squad_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none" required>
                  <option value="">Selecione...</option>
                  {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Tipo</label>
                <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none">
                  {DOC_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Fonte</label>
                <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="ex: n8n, agente, manual"
                  className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Título *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Nome do documento" required
                className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Conteúdo *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={6} required placeholder="Conteúdo do documento (markdown ou texto)..."
                className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none font-mono" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Tags</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="ex: paraguai, margem, semanal"
                className="w-full px-3 py-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-[var(--bg-muted)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] text-sm rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-sm text-[var(--text-muted)]">{docs.length} documento{docs.length !== 1 ? 's' : ''}</div>

      {docs.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] py-20 text-center">
          <div className="text-4xl mb-3">📂</div>
          <p className="text-[var(--text-secondary)] text-sm">Nenhum documento encontrado</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">Use POST /api/documents para registrar via agentes</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setViewing(doc.id)}
              className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-5 text-left hover:border-[var(--border-strong)] transition-colors group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xl flex-shrink-0">{TYPE_ICONS[doc.doc_type] ?? '📄'}</span>
                  <h3 className="font-semibold text-[var(--text-primary)] text-sm leading-snug truncate">{doc.title}</h3>
                </div>
                <button
                  onClick={e => handleDelete(doc.id, e)}
                  className="text-[var(--text-muted)] hover:text-[var(--destructive)] text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >✕</button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-3">{doc.excerpt}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${TYPE_COLORS[doc.doc_type] ?? TYPE_COLORS.other}`}>
                  {doc.doc_type}
                </span>
                {doc.agent_name && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: doc.squad_color ?? 'var(--chart-5)' }} />
                    {doc.agent_name}
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-muted)] ml-auto">{formatDate(doc.created_at)}</span>
              </div>
              {doc.tags && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {doc.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 4).map(tag => (
                    <span key={tag} className="text-[9px] bg-[var(--bg-muted)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {viewing && <DocViewer docId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
