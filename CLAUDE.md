# Mission Control — Contexto para Claude Code

## O que é

Dashboard de comando para gerenciar múltiplos squads de agentes IA no OpenClaw.
Next.js 16 (App Router) + PostgreSQL. Deployado no VPS como container Docker.

**URL:** http://187.77.43.141:3001
**Login padrão:** admin / REDACTED_ADMIN_PASS (criado automaticamente no primeiro acesso)
**Projeto local:** `C:\Users\Bolota\Desktop\paraguai\mission-control\`
**Script de deploy:** `C:\Users\Bolota\Desktop\paraguai\deploy_mc.py`
**Contexto completo do projeto pai:** `C:\Users\Bolota\Desktop\paraguai\CLAUDE.md`

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16, App Router, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API Routes (route handlers) |
| Banco | PostgreSQL (container `evolution-api-h4pg-postgres-1` no VPS) |
| Auth | JWT (jose) via cookie httpOnly `mc_token`, PBKDF2-SHA512 para senhas |
| Deploy | Docker container `mission-control`, porta 3001 |
| Rede | `evolution-api-h4pg_default` (acessa postgres pelo hostname `postgres`) |

---

## Credenciais

```
DATABASE_URL=postgresql://evolution:REDACTED_PG_PASS@postgres:5432/mission_control
JWT_SECRET=REDACTED_JWT_SECRET
ADMIN_PASSWORD=REDACTED_ADMIN_PASS
SESSION_HOURS=24
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
│   ├── page.tsx                         → redireciona para /login ou /dashboard
│   ├── login/page.tsx                   → tela de login (username + password)
│   ├── (dashboard)/
│   │   ├── layout.tsx                   → layout com Sidebar (overflow-auto — usar createPortal para drawers/modais fixos)
│   │   ├── dashboard/page.tsx           → visão geral (estatísticas, squads, atividade)
│   │   ├── squads/
│   │   │   ├── page.tsx                 → lista e CRUD de squads
│   │   │   └── [id]/page.tsx            → detalhe do squad (agentes, tarefas, overview)
│   │   ├── tasks/page.tsx               → Kanban board (drag-and-drop + confetti ao concluir)
│   │   ├── agents/page.tsx              → TABS: Configuração (agentes + drawer) | Status ao Vivo (heartbeat, toggle ativo/idle/stop)
│   │   ├── activity/page.tsx            → activity feed SSE em tempo real
│   │   ├── calendar/page.tsx            → calendário mensal de tarefas com due_date
│   │   ├── memory/page.tsx              → memórias dos agentes com busca global
│   │   ├── documents/page.tsx           → documentos gerados pelos agentes (grid + viewer)
│   │   ├── tokens/page.tsx              → consumo de tokens por agente + histórico diário
│   │   ├── connectors/page.tsx          → integrações externas (LLMs, YouTube, GitHub, WhatsApp, etc.) — admin only
│   │   └── users/page.tsx               → TABS: Usuários (CRUD) | Logs de Acesso — admin only
│   └── api/
│       ├── auth/login/route.ts          → POST login (auto-cria tabelas + admin bootstrap)
│       ├── auth/logout/route.ts         → POST logout (registra em access_logs)
│       ├── auth/me/route.ts             → GET { id, username, name, role }
│       ├── users/route.ts               → GET list, POST create — admin only
│       ├── users/[id]/route.ts          → PATCH, DELETE — admin only
│       ├── access-logs/route.ts         → GET logs com duração (JOIN login+logout por session_id)
│       ├── connectors/route.ts          → GET/PUT connector_configs — admin only
│       ├── connectors/test/route.ts     → POST testa conectividade de cada conector
│       ├── setup/route.ts               → POST (cria tabelas + seed)
│       ├── squads/route.ts              → GET list, POST create
│       ├── squads/[id]/route.ts         → GET, PATCH, DELETE
│       ├── tasks/route.ts               → GET (filtro por squad/status), POST create
│       ├── tasks/[id]/route.ts          → PATCH, DELETE
│       ├── agents/route.ts              → GET (filtro por squad), POST create
│       ├── agents/[id]/route.ts         → GET, PATCH (system_prompt, tools, workflow), DELETE
│       ├── activity/route.ts            → GET (filtro por squad, limit)
│       ├── activity/stream/route.ts     → GET SSE stream em tempo real
│       ├── memories/route.ts            → GET (busca full-text), POST create
│       ├── memories/[id]/route.ts       → DELETE
│       ├── documents/route.ts           → GET (busca, filtro tipo/squad), POST create
│       ├── documents/[id]/route.ts      → GET (conteúdo completo), DELETE
│       └── tokens/route.ts              → GET (por agente/squad/período), POST registrar uso
├── components/
│   └── Sidebar.tsx                      → navegação lateral com filtro por role (minRole por rota)
├── lib/
│   ├── db.ts                            → Pool pg, funções query() e queryOne()
│   ├── auth.ts                          → signToken, verifyToken, hashPassword, verifyPassword, hasRole
│   └── utils.ts                         → cn(), formatDate(), constantes de status/cor
└── proxy.ts                             → Next.js 16 (renomeado de middleware.ts — apenas passa adiante)
```

---

## Schema do Banco (mission_control)

```sql
-- Squads e agentes
squads          (id UUID, name, description, mission, color, created_at)
agents          (id UUID, squad_id, name, role, status, last_heartbeat, system_prompt, tools, workflow, created_at)
tasks           (id UUID, squad_id, agent_id, title, description, status, priority, due_date, created_by, created_at, updated_at)
activity_log    (id UUID, squad_id, agent_id, action, detail, timestamp)
token_usage     (id UUID, agent_id, squad_id, model, tokens_in, tokens_out, cost_usd, session_id, date, created_at)
agent_memories  (id UUID, agent_id, squad_id, content, category, tags, source, created_at)
agent_documents (id UUID, agent_id, squad_id, title, content, doc_type, format, tags, source, created_at)

-- Multi-user auth (criadas automaticamente no primeiro POST /api/auth/login)
users           (id UUID, username VARCHAR(50) UNIQUE, name, email, password_hash, role CHECK('admin','member','viewer'), active BOOL, created_at, last_login)
access_logs     (id UUID, user_id UUID→users, username, session_id VARCHAR(36), action CHECK('login','logout'), ip, user_agent, created_at)

-- Conectores externos
connector_configs (id UUID, key VARCHAR(100) UNIQUE, value TEXT, updated_at)
```

**Roles:** `admin (3) > member (2) > viewer (1)` — definido em `ROLE_LEVEL` map em `lib/auth.ts`
**Status de tarefa:** `backlog | assigned | in_progress | review | done`
**Status de agente:** `active | idle | stopped`
**Prioridade:** `low | medium | high | urgent`
**Categorias de memória:** `general | fact | preference | rule | observation | decision`
**Tipos de documento:** `report | analysis | proposal | summary | alert | log | other`
**Modelos e custo:**
- `claude-opus-4-6` → $15.00/$75.00 por 1M tokens (input/output)
- `claude-sonnet-4-6` → $3.00/$15.00 por 1M tokens
- `claude-haiku-4-5` → $0.80/$4.00 por 1M tokens

---

## Permissões por Role

| Página / Ação | viewer | member | admin |
|---------------|--------|--------|-------|
| Dashboard, Squads, Tasks, Activity, Calendar | ✅ | ✅ | ✅ |
| Memory, Documents, Tokens | ✅ | ✅ | ✅ |
| Agents (ver + Status ao Vivo) | ✅ | ✅ | ✅ |
| Agents (editar system_prompt, tools, workflow) | ❌ | ✅ | ✅ |
| Connectors | ❌ | ❌ | ✅ |
| Users + Logs de Acesso | ❌ | ❌ | ✅ |

---

## Auth — Notas Técnicas

- **`hashPassword(password)`** → PBKDF2-SHA512, salt aleatório 16 bytes, formato `${salt}:${hash}`
- **`verifyPassword(password, stored)`** → `timingSafeEqual` para comparação segura
- **`signToken(payload)`** → JWT com exp `SESSION_HOURS`h (default 24h)
- **`verifyToken(token)`** → rejeita tokens sem `sub`, `username`, `role`, `sid` (evita crash com tokens antigos)
- **`hasRole(session, minRole)`** → `ROLE_LEVEL[session.role] >= ROLE_LEVEL[minRole]`
- **`sessionId` (sid)** → UUID gerado no login, embarcado no JWT, usado para parear login+logout nos access_logs
- **Bootstrap:** se tabela `users` estiver vazia, cria admin com `ADMIN_PASSWORD` automaticamente
- **Cookie:** `mc_token`, `httpOnly: true`, `secure: false` (VPS roda HTTP), `maxAge = SESSION_HOURS * 3600`

---

## Squads Existentes

| Squad ID | Nome | Cor |
|----------|------|-----|
| a1b2c3d4-0000-0000-0000-000000000001 | Paraguai Arbitrage Engine | #10b981 |

**8 agentes pré-seed:** Project Manager, Supplier Agent, Product Agent, Finance Agent, Market Agent, Logistics Agent, Alert Agent, Report Agent

---

## Fases

### Fase 1 — COMPLETA
- [x] Auth JWT (cookie httpOnly, `secure: false` pois VPS roda HTTP)
- [x] CRUD de Squads com seletor de cor
- [x] Task Board Kanban (drag-and-drop, confetti ao mover para "Concluído")
- [x] Agentes por squad (drawer slide-in via createPortal: system_prompt, tools, workflow, tokens 30d)
- [x] Activity Feed com SSE em tempo real (ponto verde pulsante "Ao vivo")
- [x] Squad Paraguai pré-seed com 8 agentes
- [x] Deploy Docker no VPS

### Fase 2 — COMPLETA
- [x] Activity Feed SSE (`/api/activity/stream`) — conexão persistente, ponto verde ao vivo
- [x] Calendar mensal — tarefas com due_date, navegação ‹ ›, atrasadas em vermelho
- [x] Memory Screen — busca global, 6 categorias com cores, tags, fonte, DELETE hover
- [x] Document Screen — grid 2col, viewer slide-in via createPortal, 7 tipos, busca full-text
- [x] Tokens & Custo — gráfico de barras diário, tabela por agente, pricing por modelo, widget no drawer

### Fase 3 — COMPLETA
- [x] Página Agents com tabs: "Configuração" + "Status ao Vivo" (heartbeat, ativo/idle/stop)
- [x] Três modos de visualização: Lista / Grid / Tabela compacta
- [x] Connectors page: 8 integrações (Claude, OpenAI, Gemini, YouTube, GitHub, ArXiv, WhatsApp/Evolution, PostgreSQL)
- [x] Multi-user access control: 3 roles (admin/member/viewer), login com username/password
- [x] Sidebar com filtro por role (minRole por rota), card do usuário logado no rodapé
- [x] Users page: CRUD de usuários + tab de Logs de Acesso com duração de sessão
- [x] Username sempre lowercase, confirmação de senha, email opcional
- [x] Session timeout configurável via `SESSION_HOURS` (padrão 24h)
- [x] Access logs: IP, browser, duração da sessão, "online" se ainda conectado

### Fase 4 — PENDENTE
- [ ] Agent Communication Log (@menções entre agentes)
- [ ] Standups diários automáticos
- [ ] Agentes criando e reivindicando tarefas automaticamente
- [ ] Botão start/stop por agente
- [ ] Content Pipeline customizável por squad

---

## APIs para os Agentes Usarem

```
POST /api/activity      { squad_id, agent_id?, action, detail }       → registrar ação no feed
POST /api/tokens        { squad_id, agent_id?, model, tokens_in, tokens_out, session_id? } → registrar consumo
POST /api/memories      { squad_id, agent_id?, content, category, tags?, source? } → salvar memória
POST /api/documents     { squad_id, agent_id?, title, content, doc_type, tags?, source? } → salvar documento
POST /api/tasks         { squad_id, agent_id?, title, description?, priority?, due_date? } → criar tarefa
PATCH /api/tasks/:id    { status }  → mover tarefa no kanban
```

---

## Deploy (Rebuild e Redeploy)

Script: `C:\Users\Bolota\Desktop\paraguai\deploy_mc.py`

```python
import paramiko, tarfile, os, io

project_dir = r'C:\Users\Bolota\Desktop\paraguai\mission-control'
exclude = {'node_modules', '.next', '.git'}

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tar:
    for root, dirs, files in os.walk(project_dir):
        dirs[:] = [d for d in dirs if d not in exclude]
        for file in files:
            fp = os.path.join(root, file)
            tar.add(fp, arcname=os.path.relpath(fp, project_dir))
buf.seek(0)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('187.77.43.141', username='root', password='REDACTED_VPS_PASS')
ssh.open_sftp().putfo(buf, '/tmp/mc.tar.gz')

for cmd in [
    'rm -rf /opt/mission-control && mkdir -p /opt/mission-control',
    'tar -xzf /tmp/mc.tar.gz -C /opt/mission-control',
    'cd /opt/mission-control && docker build -t mission-control:latest . 2>&1 | tail -5',
    'docker rm -f mission-control 2>/dev/null || true',
    'docker run -d --name mission-control --restart unless-stopped -p 3001:3001 -e DATABASE_URL="postgresql://evolution:REDACTED_PG_PASS@postgres:5432/mission_control" -e JWT_SECRET="REDACTED_JWT_SECRET" -e ADMIN_PASSWORD="REDACTED_ADMIN_PASS" --network evolution-api-h4pg_default mission-control:latest',
    'sleep 3 && docker logs mission-control --tail 10',
]:
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(f'CMD: {cmd[:80]}')
    if out: print('OUT:', out[:300])
    if err and 'WARNING' not in err: print('ERR:', err[:200])
ssh.close()
```

---

## Notas Técnicas Importantes

- **`proxy.ts`** (não `middleware.ts`) — Next.js 16 renomeou o arquivo, função exportada se chama `proxy`
- **`secure: false`** no cookie — VPS roda HTTP, não HTTPS. `secure: true` faz o browser não enviar o cookie
- **`createPortal`** — obrigatório para drawers/modais fixos. O `<main>` tem `overflow-auto` que cria stacking context e clippa elementos `fixed`
- **Animação confetti** — `canvas-confetti` no Task Board ao mover para "done"
- **SSE stream** — `/api/activity/stream` usa `ReadableStream` do Next.js, polling fallback no cliente a cada 10s
- **Tokens antigos invalidados** — `verifyToken` rejeita JWTs sem `sid` (evita crash do Sidebar com cookies anteriores ao multi-user)

---

## Como Retomar em Nova Sessão

```
Leia C:\Users\Bolota\Desktop\paraguai\mission-control\CLAUDE.md e me ajude a
implementar a Fase 4 do Mission Control. [descreva o que quer fazer]
```
