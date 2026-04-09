'use client';

const DOCS = [
  {
    slug: 'harness-v3',
    title: 'Harness V3 (Agent Pipeline)',
    description: 'Arquitetura do pipeline paralelo com State Gates, comandos de entrada e checkpoints rigorosos.',
    icon: '⚡',
    sprint: 'Sprint 39',
  },
  {
    slug: 'dual-identity',
    title: 'Dual Identity (Dois Terminais, Um Jarvis)',
    description: 'Como o Jarvis opera via CLI interativa e via orquestração E2E Autônoma simultaneamente.',
    icon: '🧠',
    sprint: 'Sprint 39',
  },
  {
    slug: 'slash-commands',
    title: 'CLI Slash Commands V3',
    description: 'Guia visual do fluxo entre /spec, /task, e /close-sprint e sua orquestração dos agentes.',
    icon: '⌨️',
    sprint: 'Sprint 39',
  },
  {
    slug: 'multi-tenant-accounts',
    title: 'Multi-Tenant ML Accounts',
    description: 'Estado atual vs ajustes necessários vs roadmap SaaS para contas Mercado Livre.',
    icon: '🏪',
    sprint: 'Sprint 18',
  },
  {
    slug: 'fluxo-impressao',
    title: 'Fluxo de Impressão',
    description: 'Arquitetura completa do sistema de fila de impressão de etiquetas ML.',
    icon: '🖨️',
    sprint: 'Sprint 17',
  },
  {
    slug: 'sprint-ml-impressao',
    title: 'Sprint ML + Impressão',
    description: 'Resumo técnico da sprint de integração Mercado Livre e fila de impressão.',
    icon: '📋',
    sprint: 'Sprint 17',
  },
  {
    slug: 'agents-system',
    title: 'Sistema de Agentes',
    description: 'Arquitetura dos agentes Claude Code e skills do projeto.',
    icon: '🤖',
    sprint: 'Infra',
  },
  {
    slug: 'deploy-evolution',
    title: 'Deploy Evolution API',
    description: 'Guia de deploy da Evolution API no VPS com Docker Compose.',
    icon: '🚀',
    sprint: 'Infra',
  },
  {
    slug: 'skills-index',
    title: 'Skills Index',
    description: 'Índice visual de todas as skills disponíveis no projeto.',
    icon: '📚',
    sprint: 'Infra',
  },
  {
    slug: 'mercado-turbo-changelog',
    title: 'Inteligência Competitiva — Mercado Turbo',
    description: 'Timeline de features lançadas pelo Mercado Turbo (fev–mar 2026). Análise de concorrência para priorização de roadmap.',
    icon: '🔍',
    sprint: 'Competitivo',
  },
];

export default function InfograficosPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Infográficos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Documentação visual do projeto — acesso restrito a administradores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {DOCS.map(doc => (
          <a
            key={doc.slug}
            href={`/api/docs/${doc.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-5 transition-all hover:bg-[var(--bg-muted)]/60"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{doc.icon}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border)] group-hover:border-[var(--accent)] group-hover:text-[var(--accent)] transition-colors">
                {doc.sprint}
              </span>
            </div>
            <div className="font-semibold text-[var(--text-primary)] text-sm mb-1 group-hover:text-[var(--accent)] transition-colors">
              {doc.title}
            </div>
            <div className="text-xs text-[var(--text-muted)] leading-relaxed">
              {doc.description}
            </div>
            <div className="mt-4 text-xs text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-1">
              Abrir infográfico →
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
