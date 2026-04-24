---
name: secret-rotation
description: Rotaciona credenciais (passwords, API keys, tokens) de infra compartilhada entre repos. Triggers: "rotate password", "rotate secret", "credentials exposed", "senha vazada", "rotacionar senha", "Basic Auth password", "API key rotation", "GH secret update", "env var credential". Foca em procedimento seguro fim-a-fim: backup → rotate → propagate runtime → validate → persist source of truth → lock source of record.
---

# Secret Rotation — Wingx Infra

Procedimento canônico pra rotacionar credencial compartilhada. Garante zero downtime em fluxos críticos (webhook ML, BD, WhatsApp), deixa trail auditável, e zero drift entre runtime + source of truth.

## Source of truth hierarchy

Pra cada credencial, defina UM único source of truth:

| Camada | Quando usar | Exemplos |
|---|---|---|
| **GH Secrets** do repo dono | credencial consumida por deploy workflow que gerencia o container | `MC_WORKER_KEY`, `DATABASE_URL`, `JWT_SECRET` (mission-control), `NODE_AUTH_TOKEN` (cross-repo npm) |
| **`.env` no VPS** | credencial consumida por container fora de CI/CD (stacks shared, manual deploy) | `N8N_BASIC_AUTH_PASSWORD`, `POSTGRES_PASSWORD` (stack evolution-api-h4pg) |
| **Password manager Cleiton** | todas credenciais têm backup aqui obrigatório | `mc_app` password, n8n admin, evolution stack passwords, ML refresh_tokens |

**Regra:** credential que vive em `.env` manual deve ter cópia no password manager + reference no GH Secret (não necessariamente consumida pelo workflow, mas garante que se VPS queimar, Cleiton consegue reconstituir).

## Inventário — stack `evolution-api-h4pg` (`/docker/evolution-api-h4pg` no VPS)

4 containers compartilhados (n8n + Evolution API + Postgres 15 + Redis). Deployment manual no VPS — NÃO gerenciado por GH Actions.

| Credencial | Container primário | Consumers secundários | Source of truth |
|---|---|---|---|
| `POSTGRES_PASSWORD` (role `evolution`, superuser) | postgres-1 | n8n-1 (DB_POSTGRESDB_PASSWORD), api-1 | VPS `.env` + pwd manager |
| `POSTGRES_PASSWORD` (role `mc_app`, NOSUPERUSER) | postgres-1 | mission-control (DATABASE_URL via GH Secret) | GH Secret `DATABASE_URL` + pwd manager (ver runbook `rotate-mc-app-password.md` — legado, absorver eventualmente nesta skill) |
| `N8N_PASSWORD` (env `.env` → interpola compose pra `N8N_BASIC_AUTH_PASSWORD`) | n8n-1 | UI login admin | VPS `.env` + pwd manager (após first-boot, n8n persiste user no DB Postgres — env ignorado) |
| `N8N_ENCRYPTION_KEY` (se set) | n8n-1 | criptografa credentials stored em n8n DB | VPS `.env` — NUNCA rotacionar sem backup DB (quebra credentials stored) |
| `AUTHENTICATION_API_KEY` (Evolution API) | api-1 | WhatsApp webhook validation | VPS `.env` + pwd manager + GH Secret `EVOLUTION_API_KEY` (consumer side) |
| `N8N_API_KEY` (gerado via UI n8n Settings → n8n API) | — (cliente-side, DB table `user_api_keys`) | mission-control SRE check (workflow monitoring) | GH Secret `N8N_API_KEY` (repo cganbit/mission-control) |
| `ML_CLIENT_SECRET`, `ML_CLIENT_ID` | mission-control | OAuth ML refresh flow | `connector_configs` DB (mission_control) |

### Cross-reference consumer/server pairs

Algumas credenciais têm dois lados separados. Rotation precisa atualizar AMBOS:

| Key Identity | Server side (env VPS) | Consumer side (GH Secret) |
|---|---|---|
| Evolution API (WhatsApp) | `/docker/evolution-api-h4pg/.env` → `AUTHENTICATION_API_KEY` | `cganbit/mission-control` → `EVOLUTION_API_KEY` (+ `EVOLUTION_URL`, `EVOLUTION_INSTANCE`) |
| Postgres `mc_app` role | `/docker/evolution-api-h4pg/.env` → `POSTGRES_PASSWORD` (da role mc_app, não da superuser evolution) | `cganbit/mission-control` → `DATABASE_URL` (connection string completa) |
| n8n API key | n8n DB `user_api_keys` table (interno ao n8n) | `cganbit/mission-control` → `N8N_API_KEY` |

### Archive note — Paraguai

**Paraguai é arquivo histórico pós-PRD-036 F7 Fase 3.** Mission Control foi extraído do Paraguai e agora é o consumer ativo dessas credenciais. Refs em `Paraguai/docs/`, `Paraguai/.skills/` sobre `paraguai-engine` ou `N8N_API_KEY` são **documentação histórica** — zero deployment ativo. Não replicar credenciais no `.env` de Paraguai nem criar workflow de deploy pra ele. ADR-002 locka Paraguai como imutável.

## Procedimento genérico

### Passo 0 — Backup fail-safe

```bash
# SSH VPS
cp /docker/evolution-api-h4pg/.env /docker/evolution-api-h4pg/.env.bak-pre-rotate-$(date +%Y%m%d-%H%M%S)
ls -la /docker/evolution-api-h4pg/.env.bak-*  # confirma backup existe
```

Sem este passo, rollback impossível se rotation quebrar dependência não óbvia.

### Passo 1 — Gerar nova credencial

Escolher generator adequado:

```bash
# Alta entropia (passwords stack): 32 chars alfanumérico
openssl rand -hex 32

# API keys (n8n, evolution): via UI do serviço — nunca adivinhar formato
```

NÃO reusar credenciais antigas. NÃO usar palavras de dicionário.

### Passo 2 — Propagar runtime

Ordem crítica pra evitar janela de downtime:

```bash
# Seta nova password em variável shell
NEW_PASS=$(openssl rand -hex 32)
# Atualiza .env (sed in-place preservando outras entries)
sed -i "s|^N8N_BASIC_AUTH_PASSWORD=.*|N8N_BASIC_AUTH_PASSWORD=$NEW_PASS|" /docker/evolution-api-h4pg/.env
# Recria APENAS o container afetado (não tooda a stack)
cd /docker/evolution-api-h4pg && docker compose up -d --force-recreate n8n
```

**Gotcha:** Recriar `postgres` afeta TODOS os consumers (MC, Evolution API, n8n). Pra rotacionar Postgres role:
- Role `evolution` (superuser) = afeta todos → manutenção programada + notificar
- Role `mc_app` (NOSUPERUSER) = só mission-control → usar runbook `rotate-mc-app-password.md`

### Passo 3 — Validar serviço funcional

Antes de declarar done, exercitar path crítico:

```bash
# n8n: login UI responde
curl -sS -o /dev/null -w "%{http_code}\n" -u admin:$NEW_PASS http://187.77.43.141:5678/rest/login

# Postgres mc_app: query real via docker exec
docker exec -i evolution-api-h4pg-postgres-1 psql -U mc_app -d mission_control -c "SELECT 1;"

# Evolution API: check endpoint
curl -sS -o /dev/null -w "%{http_code}\n" -H "apikey: $NEW_KEY" http://localhost:8080/instance/fetchInstances
```

Se fail, **IMMEDIATE rollback**:

```bash
cp /docker/evolution-api-h4pg/.env.bak-pre-rotate-<ts> /docker/evolution-api-h4pg/.env
cd /docker/evolution-api-h4pg && docker compose up -d --force-recreate <container>
```

### Passo 4 — Persistir source of truth

**Se vai em GH Secret:**
```bash
gh secret set <NAME> --repo <owner>/<repo> --body "$NEW_PASS"
# Trigger redeploy pro container consumer pegar:
# - empty commit + push, OU
# - gh workflow run deploy.yml --repo <owner>/<repo>
```

**Se fica só em `.env` VPS:** copiar pro password manager imediatamente. Não depender só do arquivo no VPS — se VPS pega fogo, perde tudo.

### Passo 5 — Cleanup backup

Após 24-48h estável (sem rollback necessário):

```bash
# Lista backups antigos
ls -la /docker/evolution-api-h4pg/.env.bak-*
# Delete ones > 7 days
find /docker/evolution-api-h4pg/ -name ".env.bak-*" -mtime +7 -delete
```

Backup cleanup previne leak histórico de senhas antigas num tar de backup.

## Gotchas conhecidos

### G1 — n8n `N8N_ENCRYPTION_KEY` é sagrada

Se rotacionar `N8N_ENCRYPTION_KEY`, **todas** as credentials que n8n armazena criptografadas no DB viram lixo (inutilizáveis). Efeito: workflows que usam creds externas (OpenAI key, Google OAuth, Postgres conn) precisam ser **reconfigurados um a um**. Nunca rotacionar sem:
1. Export de todas credentials pro n8n CLI
2. Backup completo do DB n8n
3. Re-import pós-key-rotation

### G2 — Postgres role `evolution` é superuser shared

Rotacionar senha da role `evolution` quebra: (1) container `api-1` (Evolution API), (2) `n8n-1` (DB_POSTGRESDB_PASSWORD), (3) qualquer script manual SSH + psql. Propaga pra 3 `.env` vars distintos + restart cascade. Manutenção >5min — notificar Cleiton antes.

### G3 — `docker compose up -d --force-recreate` sem `--no-deps` reinicia dependências

Se comando é `docker compose up -d --force-recreate n8n` mas n8n tem `depends_on: postgres`, compose pode re-create postgres também (dependendo da flag). **Sempre:** `docker compose up -d --force-recreate --no-deps <service>` pra isolar blast radius.

### G4 — Credenciais em `docker exec env` são visíveis pra qualquer SSH root

Passwords em plain text no `.env` são legíveis via `docker exec <c> env`. Mitigation: (1) cargas críticas via Docker secrets (não env vars), (2) SSH access limitado a `Cleiton@` key específica, (3) audit log de `docker exec` no VPS (fica pra implementar).

### G6 — n8n `N8N_BASIC_AUTH_PASSWORD` só tem efeito em first-boot (2026-04-23)

**Não-óbvio:** alterar `N8N_BASIC_AUTH_PASSWORD` no env + `docker compose up -d --force-recreate n8n` **NÃO muda a senha de login** em prod ativo. n8n persiste o user admin em tabela `user` do DB Postgres interno na primeira boot. Após isso, env é ignorado — senha real vive no DB.

**Evidência empírica:** sed do `.env` + restart → senha antiga (`Paraguai2026`) continuou HTTP 200. Teste repetido confirmou.

**Rotação real requer:**
1. **Via UI:** Settings → Users (ou Profile) → mudar senha
2. **Via reset destructive:** `docker exec n8n-1 n8n user-management:reset` (apaga user admin atual; workflows preservados em tabela separada) → update `.env` com nova senha → restart → bootstrap cria novo user com senha do env

**Post-rotation sync obrigatório:** mesmo se usar UI (opção 1), ainda atualizar `.env` + GH Secret com a nova senha pra que **futuros bootstraps** (wipe DB, novo deploy) peguem senha correta do env. Senão, next rebuild volta `Paraguai2026` (ou qualquer coisa que esteja no env).

### G7 — Variável `.env` pode não ser a mesma injetada no container

Compose pode interpolar. Exemplo real stack `evolution-api-h4pg`:
```yaml
# docker-compose.yml
environment:
  - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}  # ← interpolação
```
```env
# .env
N8N_PASSWORD=xyz   # ← var aqui
```

`docker exec env` mostra `N8N_BASIC_AUTH_PASSWORD=xyz` (nome injetado no container), mas o **sed deve editar `N8N_PASSWORD=` no `.env`** (nome da var na fonte). Grep o `docker-compose.yml` antes do sed pra identificar qual é qual.

### G8 — n8n API keys existem no DB, não em env

API keys do n8n (`Settings → n8n API → Create API key`) vivem em tabela `user_api_keys` do DB interno. **Valor completo só aparece uma vez** na criação. Depois, UI mostra só preview (últimos 4 chars). Se perder o valor, **não dá pra recuperar** — só revogar + criar nova.

**Pattern recomendado:** ao criar API key, copiar valor IMEDIATAMENTE pro GH Secret consumer + password manager. Labels descritivos (`mission-control-sre`, `<consumer>-<scope>`) facilitam auditoria de quais consumers usam qual key.

### G9 — n8n v2+ User Management bypassa Basic Auth (2026-04-23)

n8n moderno (v2.x+) introduz **User Management**: sistema de multi-usuários com email/password em tabela `user` do DB interno. Quando habilitado (default em versões recentes), `N8N_BASIC_AUTH_PASSWORD` do env **é efetivamente ignorado** no login pela UI — ela usa login form custom contra o DB.

**Implicação pra auth testing:**
- `curl -u admin:<senha> http://n8n/` **retorna 200 mesmo sem Basic Auth válido** (UI serve form HTML sem challenge HTTP)
- Teste válido de rotação: **abrir UI no browser** (janela anônima), digitar user + senha → verifica visualmente
- `curl` com Basic Auth retorna 200/404 com qualquer senha (ou sem) — NÃO É teste real

**Implicação pra rotation:**
- Rotation senha via `.env` + restart = no-op (G6 reforçado)
- Rotation real só via **UI Settings → Profile** (muda password hash em DB user)
- `N8N_BASIC_AUTH_PASSWORD` em env = só importa pra fresh bootstrap (antes de qualquer user ser criado)

**Como descobrir qual modo está ativo:**
```bash
docker exec evolution-api-h4pg-n8n-1 sh -c "env | grep N8N_USER_MANAGEMENT"
# se N8N_USER_MANAGEMENT_DISABLED=true → Basic Auth legacy ativo
# se sem flag OU =false → User Management (default)
```

**Test canônico pós-rotation:** browser anônimo → http://<n8n>/ → login form custom n8n → digita credenciais → verifica visualmente que aceita nova / rejeita antiga.

### G5 — Rotation sem notificar quebra SRE alerts

Após rotation, SRE checks podem ficar em warning/error por stale cache. Trigger `POST /api/sre/run-checks` manualmente pós-rotation pra forçar re-check + validar green.

## Histórico de uso

- **2026-04-23 (primeiro uso — aprendizado):** tentativa de rotacionar `N8N_BASIC_AUTH_PASSWORD` via env+restart **falhou** (descoberta G6 — n8n ignora env após first-boot). Rollback executado. **Parcial entregue:** Cleiton gerou nova API key n8n via UI (label `n8n-Api-key`, key antiga `paraguai-engine` deletada), setado GH Secret `N8N_API_KEY` no cganbit/mission-control, redeploy MC disparado pra propagar ao container. SRE check `n8n workflow_active` → validação pós-deploy. **Rotação de senha Basic Auth fica pendente** (escolha: UI manual OU `user-management:reset` destrutivo). Paraguai confirmado como archive (não é consumer ativo — zero container/cron/.env no VPS).

## Cross-references

- Runbook legado mc_app: `mission-control/knowledge/runbooks/rotate-mc-app-password.md` (absorver nesta skill em rotation futura)
- Inventário tech debt senhas: `wingx-platform/CONCERNS.md` — seção "Credentials rotation status"
- Skill ML tokens (refresh flow diferente de rotation): `ml-saas/packages/skills-ml-me/skills/mercado-livre-saas/rules-api-limits.md` §Ciclo de Refresh
