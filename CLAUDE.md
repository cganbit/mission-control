# Mission Control — Contexto para Claude Code

## O que é

Dashboard de comando para gerenciar múltiplos squads de agentes IA no OpenClaw.
Next.js 16 (App Router) + PostgreSQL. Deployado no VPS como container Docker.

**URL:** http://187.77.43.141:3001 (senha: `openclaw2024`)
**Projeto local:** `C:\Users\Bolota\Desktop\mission-control\`
**Contexto completo do projeto pai:** `C:\Users\Bolota\Desktop\paraguai\CLAUDE.md`

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16, App Router, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API Routes (route handlers) |
| Banco | PostgreSQL (container `evolution-api-h4pg-postgres-1` no VPS) |
| Auth | JWT (jose) via cookie httpOnly `mc_token` |
| Deploy | Docker container `mission-control`, porta 3001 |
| Rede | `evolution-api-h4pg_default` (acessa postgres pelo hostname `postgres`) |

---

## Credenciais

```
DATABASE_URL=postgresql://evolution:rRbUmQvIwduoclyN1gA5gI4RWVzYC1GQ@postgres:5432/mission_control
JWT_SECRET=mission-control-super-secret-key-2024-change-this
ADMIN_PASSWORD=openclaw2024
```

Para desenvolvimento local, usar SSH tunnel:
```bash
ssh -L 5432:localhost:5432 root@187.77.43.141 -N
# Depois usar localhost:5432 no DATABASE_URL
```

---

## Estrutura de Arquivos

```
src/
├── app/
│   ├── page.tsx                    → redireciona para /login ou /dashboard
│   ├── login/page.tsx              → tela de login
│   ├── (dashboard)/
│   │   ├── layout.tsx              → layout com Sidebar
│   │   ├── dashboard/page.tsx      → visão geral (estatísticas, squads, atividade)
│   │   ├── squads/
│   │   │   ├── page.tsx            → lista e CRUD de squads
│   │   │   └── [id]/page.tsx       → detalhe do squad (agentes, tarefas, overview)
│   │   ├── tasks/page.tsx          → Kanban board (drag-and-drop)
│   │   ├── agents/page.tsx         → agentes agrupados por squad
│   │   └── activity/page.tsx       → activity feed (auto-refresh 10s)
│   └── api/
│       ├── auth/login/route.ts     → POST login
│       ├── auth/logout/route.ts    → POST logout
│       ├── setup/route.ts          → POST (cria tabelas + seed)
│       ├── squads/route.ts         → GET list, POST create
│       ├── squads/[id]/route.ts    → GET, PATCH, DELETE
│       ├── tasks/route.ts          → GET (filtro por squad/status), POST create
│       ├── tasks/[id]/route.ts     → PATCH, DELETE
│       ├── agents/route.ts         → GET (filtro por squad), POST create
│       └── activity/route.ts       → GET (filtro por squad, limit)
├── components/
│   └── Sidebar.tsx                 → navegação lateral fixa
├── db/
│   └── schema.ts                   → SQL de criação das tabelas e seed
├── lib/
│   ├── db.ts                       → Pool pg, funções query() e queryOne()
│   ├── auth.ts                     → signToken, verifyToken, getSession
│   └── utils.ts                    → cn(), formatDate(), constantes de status/cor
└── middleware.ts                   → protege rotas, redireciona para /login
```

---

## Schema do Banco (mission_control)

```sql
squads        (id UUID, name, description, mission, color, created_at)
agents        (id UUID, squad_id, name, role, status, last_heartbeat, system_prompt, created_at)
tasks         (id UUID, squad_id, agent_id, title, description, status, priority, due_date, created_by, created_at, updated_at)
activity_log  (id UUID, squad_id, agent_id, action, detail, timestamp)
auth_sessions (id UUID, token_hash, created_at, expires_at, revoked)
```

**Status de tarefa:** `backlog | assigned | in_progress | review | done`
**Status de agente:** `active | idle | stopped`
**Prioridade:** `low | medium | high | urgent`

---

## Squads Existentes

| Squad ID | Nome | Cor |
|----------|------|-----|
| a1b2c3d4-0000-0000-0000-000000000001 | Paraguai Arbitrage Engine | #10b981 |

**8 agentes pré-seed:** Project Manager, Supplier Agent, Product Agent, Finance Agent, Market Agent, Logistics Agent, Alert Agent, Report Agent

---

## Fase 1 — COMPLETA

- [x] Auth JWT (cookie httpOnly, 7 dias)
- [x] CRUD de Squads com seletor de cor
- [x] Task Board Kanban (drag-and-drop)
- [x] Agentes por squad
- [x] Activity Feed (auto-refresh 10s)
- [x] Squad Paraguai pré-seed com 8 agentes
- [x] Deploy Docker no VPS

## Fase 2 — PENDENTE

- [ ] WebSocket para Activity Feed em tempo real
- [ ] Calendar (cron jobs e tarefas agendadas)
- [ ] Memory Screen (memórias dos agentes com busca global)
- [ ] Document Screen (documentos gerados pelos agentes)

## Fase 3 — PENDENTE

- [ ] Agent Communication Log (@menções entre agentes)
- [ ] Standups diários automáticos
- [ ] Agentes criando e reivindicando tarefas automaticamente
- [ ] Team Screen com status ao vivo

## Fase 4 — PENDENTE

- [ ] Botão start/stop por agente (WebSocket)
- [ ] Cost tracking por sessão/squad
- [ ] Content Pipeline customizável por squad

---

## Deploy (Rebuild e Redeploy)

Via Python/paramiko (VPS SSH password: `@Bolota1199@`):

```python
# 1. Empacotar projeto (excluindo node_modules, .next)
# 2. Enviar para /opt/mission-control no VPS
# 3. docker build -t mission-control:latest .
# 4. docker rm -f mission-control
# 5. docker run -d --name mission-control --restart unless-stopped \
#      -p 3001:3001 \
#      -e DATABASE_URL="postgresql://evolution:rRbUmQvIwduoclyN1gA5gI4RWVzYC1GQ@postgres:5432/mission_control" \
#      -e JWT_SECRET="..." -e ADMIN_PASSWORD="openclaw2024" \
#      --network evolution-api-h4pg_default \
#      mission-control:latest
```

---

## Como Retomar em Nova Sessão

```
Leia C:\Users\Bolota\Desktop\mission-control\CLAUDE.md e me ajude a
implementar a Fase 2 do Mission Control. [descreva o que quer fazer]
```
