---
name: dev
description: Skill geral de desenvolvimento pra projetos consumer da @wingx-app/platform. Cobre estrutura de knowledge/, consumo da platform, instrumentação de telemetria, padrões de workflow. Usar ao iniciar trabalho em projeto novo ou antes de tarefa implementar.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# `dev` — Skill geral de desenvolvimento

> Skill default carregada ao iniciar task genérica em projeto consumer. Cobre:
> - Estrutura esperada do repositório consumer
> - Como consumir `@wingx-app/platform`
> - Instrumentação de telemetria pra Mission Control
> - Fluxo de trabalho padrão (plan → implement → verify → document)

---

## Estrutura esperada do consumer

```
projeto-consumer/
├── package.json              (com "@wingx-app/platform" em dependencies)
├── AGENTS.md + CLAUDE.md     entry points cross-tool
├── BACKLOG.md                checklist de sprint/milestone
├── README.md                 overview público
├── .env.example              envvars documentadas
├── knowledge/                pasta canônica de conhecimento do projeto
│   ├── concepts/             arquitetura, domain, database schema
│   ├── decisions/            ADRs
│   ├── prds/                 PRDs ativos
│   ├── runbooks/             deploy, incident response, ops
│   ├── lessons/              gotchas datados, postmortems
│   ├── logs/                 sprints antigos arquivados
│   ├── change-impact.yaml    regras pro hook change-impact
│   └── handoffs/             prompts de retomada por sessão
├── agents/  skills/  commands/  hooks/    (se consumer customiza; senão usa o da platform)
└── src/ | app/ | lib/        código do projeto
```

**Regra de ouro:** tudo que o Claude Code precisa pra continuar trabalho amanhã **sem memória** deve estar em `knowledge/`. Memória pessoal (`~/.claude/memory/`) complementa, não substitui.

---

## Consumir `@wingx-app/platform`

### Instalar

```bash
npm install @wingx-app/platform
# ou
pnpm add @wingx-app/platform
```

**Autenticação pra NPM privado:** GitHub Packages exige `NODE_AUTH_TOKEN` configurado em `.npmrc` do consumer:

```
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
@wingx-app:registry=https://npm.pkg.github.com
```

### Registrar hooks e primitives

```bash
npx wingx register
# Instala hooks/ (pre-commit, session-start, user-prompt-submit)
# Valida knowledge/ structure
# Confirma change-impact.yaml se existe
```

### Usar mc-telemetry (pipeline_runs)

```typescript
import { McTelemetry } from '@wingx-app/platform';

const mc = new McTelemetry({
  mcUrl: process.env.MC_URL,
  projectId: process.env.MC_PROJECT_ID, // UUID do projeto em mission-control
  workerKey: process.env.MC_WORKER_KEY,
});

await mc.createRun({
  kind: 'batch-import',
  meta: { source: 'melhor-envio', count: 42 },
});
```

Detalhes: `@wingx-app/platform/lib/mc-telemetry.ts` + testes (`lib/mc-telemetry.test.ts`).

---

## Workflow padrão: plan → implement → verify → document

### 1. Plan
- Ler `project_current_work.md` (memória)
- Ler PRD ativo (`knowledge/prds/`)
- Ler BACKLOG (checklist atual)
- Se task nova, alinhar escopo com dono antes de codar

### 2. Implement
- Aplicar R1-R10 (ver [_rules](../_rules/SKILL.md))
- Editar em fases (R2), verificando entre cada
- Usar sub-agents pra 5+ arquivos independentes (R5)

### 3. Verify
- `pnpm typecheck` + `pnpm lint` + `pnpm test`
- Rodar o feature no navegador / CLI (R4) — type check ≠ feature check
- Se UI, exercitar golden path + edge case

### 4. Document
- Atualizar BACKLOG se item fechou
- Atualizar `project_current_work.md` se estado mudou
- Se descoberta surpreendente, adicionar em `knowledge/lessons/`
- Handoff prompt em `knowledge/handoffs/` se sessão está fechando

---

## Quando escrever novo knowledge doc

| Tipo | Quando criar |
|---|---|
| **concepts/** | Arquitetura/domain/schema mudou; doc antigo virou stale |
| **decisions/** (ADR) | Decisão não-trivial entre ≥ 2 opções; vale registrar trade-offs |
| **prds/** | Feature nova significativa (semanas de trabalho) |
| **runbooks/** | Operação manual que você já fez 2+ vezes |
| **lessons/** | Gotcha encontrado; postmortem de incidente |
| **logs/** | Sprint fechado; arquivar BACKLOG da época |
| **handoffs/** | Fim de sessão com trabalho incompleto; retomada futura |

**Regra:** não escreva doc porque "é boa prática". Escreva porque **alguém vai precisar** — você no próximo mês ou o próximo colaborador.

---

## Padrões TypeScript (quando o consumer é TS)

- Naming: `camelCase` em TS, `snake_case` na wire/DB (ver mapping em [api-patterns](../api-patterns/SKILL.md) e [database-design](../database-design/SKILL.md))
- Tipos em arquivo dedicado (`types.ts`) quando compartilhados; co-locados quando locais ao módulo
- `strict: true` no tsconfig; evitar `any` (usar `unknown` + narrowing)
- Zod pra parsing de input externo (API request, env, config)
- `pnpm` como package manager default (lockfile determinístico)

---

## Padrões Git

- Commit message: `type(scope): short description` (conventional commits)
  - `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`
  - Ex: `feat(mc-telemetry): extract McTelemetry from Paraguai harness`
- Branch naming: `feat/<short>`, `fix/<short>`, `chore/<short>`
- PR description com link pro PRD/issue/backlog item
- Nunca `git push --force` em `master`/`main` sem autorização explícita
- Nunca `--no-verify` (ver [_rules](../_rules/SKILL.md) anti-bypass)

---

## Anti-Patterns

❌ Começar a codar sem ler `project_current_work.md` + BACKLOG
❌ Commitar sem rodar typecheck/lint
❌ Criar `knowledge/` ad-hoc sem seguir a estrutura padrão (cada consumer inventar a própria é churn)
❌ Hardcode de secret em código commitado (ver [security](../security/SKILL.md))
❌ Endpoint novo sem considerar auth + rate limit (ver [api-patterns](../api-patterns/SKILL.md))
❌ Telemetry síncrona/bloqueante — usar `McTelemetry` que é fire-and-forget
❌ Não instrumentar telemetria em operação de valor (MC fica sem dado)
❌ Escrever documentação que repete o código (comentários duplicam signal, decaem, geram drift)

---

## Skills relacionadas

- [_rules](../_rules/SKILL.md) — regras canônicas universais
- [api-patterns](../api-patterns/SKILL.md) — design de API REST/GraphQL
- [database-design](../database-design/SKILL.md) — schema, index, migrations
- [nextjs-react-expert](../nextjs-react-expert/SKILL.md) — Next.js performance
- [systematic-debugging](../systematic-debugging/SKILL.md) — metodologia 4 fases
- [security](../security/SKILL.md) — secrets, OWASP, rotação
- [token-optimizer](../token-optimizer/SKILL.md) — gestão de contexto
- [change-impact](../change-impact/SKILL.md) — dependências entre docs/arquivos
- [deploy-safety](../deploy-safety/SKILL.md) — pre/durante/pós-deploy
