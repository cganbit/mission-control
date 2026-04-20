# Runbook — Rotate `mc_app` Postgres password

**Status:** Drafted 2026-04-20 | **Owner:** Cleiton | **Urgency:** non-urgent
**Related:** PRD-035 C3.6 decisions (D41); incident note: senha original transitou bash history + auth.log VPS durante validação C3.6.

---

## 1. Context

- Role `mc_app` (NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION) é owner de 28 tables + 10 sequences em `public` do container `evolution-api-h4pg-postgres-1`.
- `DATABASE_URL` do MC aponta pra `mc_app` (não `evolution`). Role `evolution` (SUPERUSER, BYPASSRLS) continua intocada — shared com Evolution API / WhatsApp.
- Senha atual `mc_app` (64 hex) salva no password manager do Cleiton. Durante validação C3.6 ela apareceu em:
  - Bash history (via `psql "postgresql://mc_app:SENHA@..."`)
  - `/var/log/auth.log` do VPS (via sudo logs)
  - Possivelmente session logs do Claude Code
- **Blast radius da rotação:** downtime curto do MC durante `docker compose up -d --force-recreate` (~5-15s). Nenhum impacto em Evolution API / WhatsApp (usam role `evolution`).

## 2. Pre-flight checklist

**NÃO rodar nada antes de confirmar cada item:**

- [ ] Janela de manutenção acordada (evitar picos de uso MC)
- [ ] Senha atual `mc_app` em mãos (password manager Cleiton)
- [ ] Acesso SSH ao VPS funcional (`ssh cleiton@<vps-host>` com chave)
- [ ] Acesso GitHub Secrets UI pra `cganbit/mission-control` (precisa permission write)
- [ ] Container name confirmado: `evolution-api-h4pg-postgres-1` (via `docker ps`)
- [ ] Verificar que não há deploy em progresso (GH Actions `.github/workflows/deploy.yml` idle)

## 3. Generate new password

**Local (não no VPS — evita bash history no VPS):**

```bash
# Gerar 64 hex chars (mesmo shape da senha atual)
openssl rand -hex 32
# Exemplo: a1b2c3...de (não copie, gere fresh)
```

**Salvar IMEDIATAMENTE no password manager antes de prosseguir.**

**Não pastar em prompt AI** (incluindo Claude Code session). A nova senha deve viver exclusivamente em (a) password manager, (b) GH Secret, (c) `.env` do VPS. Passar ela via stdin pro psql e env de docker (não argumento de comando).

## 4. Rotação em Postgres (no VPS via SSH)

SSH into VPS + executar dentro do container postgres:

```bash
# Conectar no VPS
ssh cleiton@<vps-host>

# Validar container running
docker ps | grep evolution-api-h4pg-postgres-1

# IMPORTANT: passar senha via stdin, NÃO em psql -c ou em bash -c string.
# Isso evita a senha aparecer em:
#   - bash history
#   - ps aux (command args)
#   - docker exec args
#   - strace/audit logs
#
# Pattern: echo <cmd> | docker exec -i <container> psql ...
```

**Rotate como role `evolution` (superuser, pode ALTER ROLE):**

```bash
# Substitua SENHA_NOVA pela senha gerada no passo 3
# Use here-doc pra stdin NÃO aparecer em bash history
docker exec -i evolution-api-h4pg-postgres-1 psql -U evolution -d postgres <<'EOF'
ALTER ROLE mc_app WITH PASSWORD 'SENHA_NOVA_AQUI';
EOF
```

**Alternativa mais segura (sem substituição in-place — lê senha via env interativa):**

```bash
# No VPS, NÃO em sua máquina
read -s NEW_PASS   # digita sem echo no terminal
export PGPASSWORD="$NEW_PASS"
echo "ALTER ROLE mc_app WITH PASSWORD '$NEW_PASS';" \
  | docker exec -i evolution-api-h4pg-postgres-1 psql -U evolution -d postgres
unset NEW_PASS PGPASSWORD
history -c   # wipes current shell history session only
```

⚠️ **Mesmo com here-doc, a senha pode cair em:**
- Shell history se você não usar `set +o history` antes
- Container stdout caso psql ecoe (não ecoa por default, mas verifique)
- PostgreSQL log (se `log_statement = 'all'` estiver ligado — verificar `SHOW log_statement;`)

**Antes de rodar:**
```bash
# Confirmar que log_statement não loga ALTER ROLE
docker exec -it evolution-api-h4pg-postgres-1 psql -U evolution -d postgres -c "SHOW log_statement;"
# Esperado: 'none' ou 'ddl' (ddl loga!) ou 'mod' (loga!) ou 'all' (loga!)
# Se ddl/mod/all, temporariamente setar 'none': ALTER SYSTEM SET log_statement = 'none'; SELECT pg_reload_conf();
# Rotacionar. Reverter depois.
```

**Validar nova senha funcional (antes de swap):**

```bash
# No VPS, teste a nova senha conectando como mc_app
echo "SELECT 1;" | docker exec -i -e PGPASSWORD="SENHA_NOVA" \
  evolution-api-h4pg-postgres-1 \
  psql -U mc_app -d evolution_api -h localhost
# Esperado: retornar '1'. Se falhar, pare e investigue antes de prosseguir.
```

## 5. Swap `DATABASE_URL`

### 5.1 Backup atual do `.env` VPS

```bash
# No VPS, dentro do diretório do docker-compose do MC
cd <path-to-mc-compose>
TS=$(date +%s)
cp .env ".env.bak-pre-rotate-$TS"
ls -l ".env.bak-pre-rotate-$TS"   # confirm backup exists
```

### 5.2 Atualizar .env com nova senha

```bash
# Extrair DATABASE_URL atual pra referência
grep DATABASE_URL .env

# Pattern esperado:
# DATABASE_URL=postgresql://mc_app:SENHA_ANTIGA@172.21.0.6:5432/evolution_api
```

**Opção A — edição manual (preferível, evita sed com senha em arg):**

```bash
# Edita com $EDITOR (vim/nano) — senha não vai pra history
nano .env
# Troca apenas a parte da senha na linha DATABASE_URL
```

**Opção B — sed com env var:**

```bash
read -s NEW_PASS
# Use delimitador # em vez de / pois senha pode conter /
sed -i.tmp "s#mc_app:[^@]*@#mc_app:$NEW_PASS@#" .env
unset NEW_PASS
diff .env.tmp .env  # valida que só a senha mudou
rm .env.tmp
```

### 5.3 Atualizar GitHub Secret `DATABASE_URL`

**Manual via UI (recomendado pra evitar vazamento em GH CLI logs):**

1. Abrir `github.com/cganbit/mission-control/settings/secrets/actions`
2. Secret `DATABASE_URL` → Update
3. Colar com **Ctrl+Shift+V** (evita trailing newline — ver feedback Week 1 QUEUE_KEY)
4. Save

**Alternativa gh CLI:**

```bash
# ATENÇÃO: senha aparece em ps aux durante execução se não usar stdin
read -s NEW_PASS
gh secret set DATABASE_URL \
  --repo cganbit/mission-control \
  --body "postgresql://mc_app:$NEW_PASS@172.21.0.6:5432/evolution_api"
unset NEW_PASS
```

## 6. Apply — restart MC container

**No VPS, mesmo diretório do docker-compose.yml:**

```bash
docker compose up -d --force-recreate mission-control
# --force-recreate garante que env vars novas são lidas
# Não rebuilda imagem; só para/inicia container com novo .env

# Acompanhar logs pra ver startup limpo
docker compose logs -f mission-control --tail=50
# Ctrl+C depois que ver "ready on port 3005" (ou similar)
```

**Downtime esperado:** 5-15 segundos. Durante esse período, usuários MC recebem erros de conexão. Se janela de manutenção não foi acordada, avisar antes.

## 7. Smoke tests

### 7.1 Endpoint básico de saúde

```bash
curl -i https://mc.wingx.app.br/api/health
# Esperado: 200 OK
```

### 7.2 Login (valida DB auth com role mc_app)

```bash
# Login grava access_logs — valida RLS + mc_app permissions
curl -c /tmp/cookies.txt -X POST https://mc.wingx.app.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin-password>"}'
# Esperado: 200 + cookie mc_token setado
```

### 7.3 Endpoint scoped multi-tenant

```bash
# Qualquer endpoint scoped — confirma que session+project_id+RLS funcionam
curl -b /tmp/cookies.txt https://mc.wingx.app.br/api/squads
# Esperado: 200 + array de squads do projeto ativo do user
rm /tmp/cookies.txt
```

### 7.4 Verificar em Postgres que role está OK

```bash
docker exec -i evolution-api-h4pg-postgres-1 psql -U evolution -d evolution_api <<'EOF'
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('mc_app', 'evolution');
EOF
# Esperado:
#  mc_app    | false | false
#  evolution | true  | true   (intocado — shared com WhatsApp)
```

## 8. Rollback plan

**Se smoke tests falharem após swap:**

```bash
# No VPS, dentro do dir do docker-compose
cp ".env.bak-pre-rotate-$TS" .env
docker compose up -d --force-recreate mission-control

# GH Secret: restaurar senha antiga via UI (password manager Cleiton tem backup)

# Postgres: reverter ALTER ROLE (senha antiga)
read -s OLD_PASS
echo "ALTER ROLE mc_app WITH PASSWORD '$OLD_PASS';" \
  | docker exec -i evolution-api-h4pg-postgres-1 psql -U evolution -d postgres
unset OLD_PASS

# Validar rollback com smoke test (7.1-7.4)
```

**Diagnóstico comum se rollback necessário:**

- `permission denied for table X` → role não é owner (não acontece sob C3.6 ownership transfer)
- `password authentication failed` → senha no `.env` difere da do Postgres (check typo)
- `role "mc_app" does not exist` → ALTER ROLE falhou silently (re-rodar)
- Container não sobe → `docker compose logs` mostra env parsing error (verificar quoting da senha no `.env`; se tiver chars especiais tipo `$`, pode precisar de escape)

## 9. Cleanup (opcional)

**No VPS:**

```bash
# Wipe bash history da sessão atual
history -c
# Se var ~/.bash_history tiver a senha, zerar:
> ~/.bash_history
# (não remove a sessão ativa, só persistência)

# auth.log do VPS: não é trivial limpar (audit trail por design).
# A mitigação é a rotação em si — senha antiga vira inválida mesmo que logada.
```

**Remover backup antigo depois de ~30d de estabilidade:**

```bash
ls -l .env.bak-pre-rotate-*
# Depois de 30d sem problemas, pode remover
# rm .env.bak-pre-rotate-<old-timestamp>
# NÃO remover todos — preservar pelo menos 1 pra auditoria
```

## 10. Post-rotation checklist

- [ ] Smoke tests 7.1-7.4 todos PASS
- [ ] Senha nova confirmada no password manager (não só na memória)
- [ ] Senha antiga marcada como "rotated 2026-XX-XX" no password manager (não deletada — histórico)
- [ ] GH Secret `DATABASE_URL` atualizado e deploy pipeline verde (próximo push não quebra)
- [ ] `.env.bak-pre-rotate-<TS>` existe no VPS
- [ ] Anotação em [`mission-control/knowledge/runbooks/rotation-log.md`](./rotation-log.md) (criar se não existe): `2026-XX-XX mc_app password rotated, motivo: [motivo]`

## 11. Automação futura (não neste runbook)

- [ ] Vault ou Doppler pra eliminar `.env` file no VPS
- [ ] Rotação agendada (cron 180 dias?) — exige Postgres user management via IaC
- [ ] PGSQL `CREATE ROLE ... VALID UNTIL` pra expiração automática
- [ ] Audit trail dedicado pra rotações (não só `.env.bak-*` files)

## 12. Anti-patterns

- ❌ **Colar senha em prompt do Claude Code / ChatGPT / qualquer AI session** — session logs são retidos.
- ❌ **`psql -c "ALTER ROLE ... PASSWORD '...'"`** — senha aparece em `ps aux`, `history`, auditd. Usar stdin.
- ❌ **Rotacionar role `evolution`** — shared com Evolution API / WhatsApp; blast radius enorme.
- ❌ **Pular backup do `.env`** — se rollback for necessário e senha antiga não estiver em mão, MC fica quebrado.
- ❌ **Testar nova senha direto em prod** — sempre validar o novo password via psql DIRECTAMENTE antes de swap do `.env`.
- ❌ **Commit de `.env`** — conferir `.gitignore` antes de qualquer edit (é ignorado, mas confirmar).
- ❌ **Deploy simultâneo à rotação** — esperar CI idle antes de tocar Secret; um push-to-main durante rotação pode disparar deploy com senha nova/velha confusa.

## 13. Histórico

- **2026-04-19 (C3.6):** senha inicial `mc_app` gerada durante gate destrutivo. Senha transitou bash history + auth.log VPS durante validação — flagada como non-urgent rotation debt.
- **2026-04-20:** runbook documentado. Rotação pendente decisão Cleiton sobre janela.
