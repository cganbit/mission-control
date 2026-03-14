'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Connector definitions ────────────────────────────────────────────────────

interface Field {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

interface ConnectorDef {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  fields: Field[];
  docsUrl?: string;
  alwaysConnected?: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  // ── LLMs ──
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'LLM principal dos agentes OpenClaw. Haiku para resumos, Sonnet para análises, Opus para tarefas complexas.',
    category: 'LLM',
    icon: '🧠',
    color: '#d97706',
    fields: [
      { key: 'anthropic_api_key', label: 'API Key', placeholder: 'sk-ant-api03-...', secret: true },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    description: 'GPT-4o e embeddings. Alternativa ao Claude para tarefas específicas.',
    category: 'LLM',
    icon: '⚡',
    color: '#10b981',
    fields: [
      { key: 'openai_api_key', label: 'API Key', placeholder: 'sk-...', secret: true },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    description: 'Gemini Pro para multimodal e análises de imagem. Gratuito até certo limite.',
    category: 'LLM',
    icon: '💎',
    color: '#6366f1',
    fields: [
      { key: 'gemini_api_key', label: 'API Key', placeholder: 'AIza...', secret: true },
    ],
  },

  // ── Data Sources ──
  {
    id: 'youtube',
    name: 'YouTube Data API',
    description: 'Monitora canais para o Daily Briefing Agent. Gratuito até 10k req/dia.',
    category: 'Fonte de Dados',
    icon: '▶️',
    color: '#ef4444',
    fields: [
      { key: 'youtube_api_key', label: 'API Key v3', placeholder: 'AIza...', secret: true },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub Trending e repositórios de IA. Aumenta rate limit de 60 para 5000 req/h.',
    category: 'Fonte de Dados',
    icon: '🐙',
    color: '#8b5cf6',
    fields: [
      { key: 'github_token', label: 'Personal Access Token', placeholder: 'ghp_...', secret: true },
    ],
  },
  {
    id: 'arxiv',
    name: 'ArXiv API',
    description: 'Papers de IA/ML em tempo real. Sem autenticação necessária.',
    category: 'Fonte de Dados',
    icon: '📄',
    color: '#14b8a6',
    fields: [],
    alwaysConnected: true,
  },

  // ── Communication ──
  {
    id: 'evolution',
    name: 'WhatsApp (Evolution API)',
    description: 'Envio de alertas e briefings via WhatsApp. Rodando no VPS na porta 8080.',
    category: 'Comunicação',
    icon: '💬',
    color: '#22c55e',
    fields: [
      { key: 'evolution_api_url',  label: 'URL da API',     placeholder: 'http://localhost:8080' },
      { key: 'evolution_api_key',  label: 'API Key',        placeholder: 'sua-api-key', secret: true },
      { key: 'whatsapp_number',    label: 'Número destino', placeholder: '5511999999999' },
    ],
  },

  // ── Infrastructure ──
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Banco de dados principal do Mission Control. Rodando no VPS como container Docker.',
    category: 'Infraestrutura',
    icon: '🗄️',
    color: '#3b82f6',
    fields: [],
    alwaysConnected: true,
  },
];

const CATEGORIES = ['LLM', 'Fonte de Dados', 'Comunicação', 'Infraestrutura'];

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

// ─── ConnectorCard ─────────────────────────────────────────────────────────────

function ConnectorCard({
  def,
  config,
  onSave,
}: {
  def: ConnectorDef;
  config: Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg]       = useState('');
  const [show, setShow]             = useState<Record<string, boolean>>({});

  // Determine if connector has any values saved
  const isConfigured = def.alwaysConnected ||
    def.fields.some(f => config[f.key] && config[f.key].length > 0);

  function startEdit() {
    const initial: Record<string, string> = {};
    def.fields.forEach(f => { initial[f.key] = config[f.key] ?? ''; });
    setForm(initial);
    setEditing(true);
    setTestStatus('idle');
    setTestMsg('');
  }

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setEditing(false);
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestMsg('');
    // Use saved values merged with current form values
    const effectiveConfig: Record<string, string> = {};
    def.fields.forEach(f => { effectiveConfig[f.key] = (editing ? form[f.key] : config[f.key]) ?? ''; });
    try {
      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector: def.id, config: effectiveConfig }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setTestStatus(data.ok ? 'ok' : 'error');
      setTestMsg(data.message);
    } catch (e) {
      setTestStatus('error');
      setTestMsg('Erro de rede ao testar');
    }
  }

  const statusDot = def.alwaysConnected
    ? 'bg-green-400'
    : isConfigured
    ? testStatus === 'ok'    ? 'bg-green-400'
    : testStatus === 'error' ? 'bg-red-400'
    : 'bg-yellow-400'
    : 'bg-gray-600';

  const statusLabel = def.alwaysConnected
    ? 'Disponível'
    : isConfigured
    ? testStatus === 'ok'    ? 'Conectado'
    : testStatus === 'error' ? 'Erro'
    : testStatus === 'testing' ? 'Testando...'
    : 'Configurado'
    : 'Não configurado';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Top accent */}
      <div className="h-0.5" style={{ backgroundColor: def.color }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ backgroundColor: `${def.color}20`, border: `1px solid ${def.color}40` }}>
              {def.icon}
            </div>
            <div>
              <div className="font-semibold text-white text-sm">{def.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                <span className="text-xs text-gray-500">{statusLabel}</span>
              </div>
            </div>
          </div>
          {!def.alwaysConnected && (
            <button onClick={startEdit}
              className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors">
              {isConfigured ? '✏️ Editar' : '+ Configurar'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed mb-4">{def.description}</p>

        {/* Saved field previews (non-editing) */}
        {!editing && def.fields.length > 0 && (
          <div className="space-y-2 mb-4">
            {def.fields.map(f => {
              const val = config[f.key];
              return (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{f.label}</span>
                  <span className="text-xs font-mono text-gray-400">
                    {val
                      ? f.secret
                        ? `${'•'.repeat(8)}${val.slice(-4)}`
                        : val
                      : <span className="text-gray-700 italic">não definido</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3 mb-4 pt-2 border-t border-gray-800">
            {def.fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <div className="flex gap-2">
                  <input
                    type={f.secret && !show[f.key] ? 'password' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {f.secret && (
                    <button onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
                      className="px-2 py-1 text-gray-500 hover:text-white text-xs bg-gray-800 border border-gray-700 rounded-lg transition-colors">
                      {show[f.key] ? '🙈' : '👁️'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Test result */}
        {testMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${
            testStatus === 'ok' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
          }`}>
            {testStatus === 'ok' ? '✓ ' : '✗ '}{testMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={handleTest} disabled={testStatus === 'testing'}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
                {testStatus === 'testing' ? '...' : 'Testar'}
              </button>
              <button onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
                ✕
              </button>
            </>
          ) : (
            <button onClick={handleTest} disabled={testStatus === 'testing'}
              className={`w-full py-1.5 text-xs font-medium rounded-lg transition-colors ${
                testStatus === 'ok'    ? 'bg-green-900/40 text-green-300 hover:bg-green-900/60' :
                testStatus === 'error' ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60' :
                'bg-gray-800 hover:bg-gray-700 text-gray-400'
              }`}>
              {testStatus === 'testing' ? 'Testando...' : testStatus === 'ok' ? '✓ Conectado' : testStatus === 'error' ? '✗ Testar novamente' : '↗ Testar conexão'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectorsPage() {
  const [config, setConfig]           = useState<Record<string, string>>({});
  const [activeCategory, setCategory] = useState<string>('all');
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/connectors');
    if (res.ok) setConfig(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(values: Record<string, string>) {
    await fetch('/api/connectors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    setConfig(prev => ({ ...prev, ...values }));
  }

  const configuredCount = CONNECTORS.filter(c =>
    c.alwaysConnected || c.fields.some(f => config[f.key])
  ).length;

  const filtered = activeCategory === 'all'
    ? CONNECTORS
    : CONNECTORS.filter(c => c.category === activeCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Conectores</h1>
          <p className="text-gray-400 text-sm mt-1">
            {configuredCount}/{CONNECTORS.length} conectores configurados
          </p>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
          ↻ Atualizar
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {CATEGORIES.map(cat => {
          const catConnectors = CONNECTORS.filter(c => c.category === cat);
          const configured = catConnectors.filter(c => c.alwaysConnected || c.fields.some(f => config[f.key])).length;
          const icons: Record<string, string> = {
            'LLM': '🧠', 'Fonte de Dados': '📡', 'Comunicação': '💬', 'Infraestrutura': '🏗️'
          };
          return (
            <button key={cat} onClick={() => setCategory(activeCategory === cat ? 'all' : cat)}
              className={`bg-gray-900 rounded-xl border p-4 text-left transition-colors ${
                activeCategory === cat ? 'border-indigo-500' : 'border-gray-800 hover:border-gray-700'
              }`}>
              <div className="text-xl mb-2">{icons[cat]}</div>
              <div className="text-lg font-bold text-white">{configured}/{catConnectors.length}</div>
              <div className="text-xs text-gray-500">{cat}</div>
            </button>
          );
        })}
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2">
        <button onClick={() => setCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}>
          Todos
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(activeCategory === cat ? 'all' : cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(def => (
            <ConnectorCard key={def.id} def={def} config={config} onSave={handleSave} />
          ))}
        </div>
      )}
    </div>
  );
}
