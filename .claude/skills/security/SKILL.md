---
name: security
description: Gestão de secrets, rotação de credenciais, pre-commit hook anti-leak, purga de histórico Git, OWASP checklist. Consultar antes de qualquer operação que envolva credenciais ou deploy. Genérico — inventário de credenciais do projeto fica em knowledge/concepts/secrets-inventory.md.
allowed-tools: Read, Glob, Grep, Bash
---

# Security

> Princípios de segurança aplicáveis a qualquer projeto consumer da platform.
> Inventário **concreto** de credenciais, valores de envvars, e rotação procedures ficam em `knowledge/concepts/secrets-inventory.md` do projeto consumer.

---

## Arquitetura de Secrets

Pattern default: **dois arquivos, um commitado outro não.**

```
projeto/
├── .env                 ← GITIGNORED — valores reais (local)
├── .env.example         ← commitado — placeholders documentados
└── (opcional) secrets.py / config.local.ts — mesmo pattern pra outras linguagens
```

| Contexto | Onde secrets vivem |
|---|---|
| Dev local | `.env` gitignored (ou `secrets.py` / equivalente) |
| CI | GitHub Secrets / GitLab CI variables / similar |
| Prod (VPS/container) | envvar injetado pelo CI/orchestrator no deploy |
| Prod (serverless) | secret manager da cloud (AWS Secrets Manager, GCP Secret Manager, Vercel env) |

**Regra absoluta:** zero hardcoded secrets em código commitado. Zero.

---

## Pre-commit Hook Anti-Leak

Hook local (`.git/hooks/pre-commit`) que bloqueia commit com padrões sensíveis conhecidos.

**Padrões mínimos a bloquear:**

| Pattern | Do que é |
|---|---|
| `sk-ant-[A-Za-z0-9_-]+` | Anthropic API key |
| `sk-or-v1-[A-Za-z0-9]+` | OpenRouter API key |
| `sk-[A-Za-z0-9]{48}` | OpenAI API key |
| `AKIA[0-9A-Z]{16}` | AWS access key ID |
| `ghp_[A-Za-z0-9]{36}` | GitHub personal access token |
| `xox[baprs]-[A-Za-z0-9-]+` | Slack token |
| `-----BEGIN (RSA\|OPENSSH\|PGP) PRIVATE KEY-----` | Chave privada |
| Tokens de provider-específicos do projeto (ML, Firecrawl, n8n, etc.) | inventário do consumer |

**Testar o hook:**

```bash
echo 'sk-ant-test12345' > /tmp/test_secret.txt
git add /tmp/test_secret.txt
git commit -m "test" # deve ser bloqueado
git reset HEAD /tmp/test_secret.txt && rm /tmp/test_secret.txt
```

**Nota:** hook local não protege contra outros devs ou máquinas novas — complementar com **Semgrep / TruffleHog / gitleaks** em CI pra defesa em profundidade.

---

## Purga de Histórico Git (quando leak ocorre)

**Antes de purgar:** o secret **já foi comprometido** (mesmo que você revert + force-push em 10 segundos, bots de scanning indexam GitHub em tempo real). **Rotacione primeiro**, purgue depois.

```bash
# 1. Rotacionar: gerar nova credencial no provider + atualizar consumers
# 2. Purgar histórico
pip install git-filter-repo
git filter-repo --replace-text secrets_to_replace.txt
# 3. Force-push (coordenar com todos os colaboradores — vão precisar reclone)
git push origin --force --all
git push origin --force --tags
```

---

## Gerar Credenciais Aleatórias

```bash
# JWT secret / chave simétrica 256-bit
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
openssl rand -hex 32

# Token URL-safe
openssl rand -base64 24
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Password (evitar caracteres que quebram shells)
openssl rand -base64 24 | tr -d '=/+'
```

**Regra:** entropia mínima 256-bit pra secrets que protegem dados; 128-bit pra IDs públicos não-guessable.

---

## Rotação de Credenciais

**Quando rotacionar:**
- Exposição confirmada (leak em git, log, screenshot, ticket)
- Ex-colaborador com acesso
- Suspeita de phishing/comprometimento de máquina
- Rotação agendada (anual mínimo pra secrets críticos)

**Processo genérico:**
1. Gerar nova credencial no provider
2. Atualizar em **todos** os consumers (grep `SECRET_NAME` no workspace — não esquecer CI, scripts isolados, outros repos)
3. Deployar consumers com a nova credencial
4. Desativar a antiga no provider
5. Validar que nada quebrou (logs, smoke tests)
6. Atualizar `knowledge/concepts/secrets-inventory.md` com data da rotação

**Gotcha comum:** credencial com `\n` trailing ao colar em secret manager → consumer lê o `\n`, autenticação falha silenciosa. Sempre validar via `echo -n "$SECRET" | wc -c`.

---

## OWASP Top 10 — Checklist (Fechamento de Sprint / Code Review)

> Validar antes de commitar código novo. Especialmente em route handlers, integrações externas, e qualquer operação que toque dados de usuário.

| # | Risco | Verificar |
|---|-------|-----------|
| A01 | **Broken Access Control** | Toda rota autenticada checa role/permission? Rotas admin exigem `admin`? Resource-level check (user A não acessa dado de user B)? |
| A02 | **Cryptographic Failures** | Zero secret hardcoded? Dados sensíveis encriptados at-rest? TLS em tudo? Nenhum `md5`/`sha1` pra passwords? |
| A03 | **Injection** | Queries SQL parametrizadas (`$1/$2` / prepared statements)? Nenhuma template string com input user? Input validado/escaped em HTML? |
| A04 | **Insecure Design** | Rate limiting? MFA em operações críticas? Assumir que o cliente é malicioso? |
| A05 | **Security Misconfiguration** | `NODE_ENV=production`? Stack trace não exposto? Headers de segurança (CSP, HSTS, X-Frame-Options)? Defaults secure? |
| A06 | **Vulnerable Components** | `npm audit` / `pnpm audit` limpo? Dependabot/Renovate ativo? Deps pinnadas em lockfile? |
| A07 | **Auth Failures** | JWT validado? Password hash com bcrypt/argon2/scrypt (nunca sha256)? Session fixation prevenida? Rate limit em login? |
| A08 | **Software/Data Integrity** | CI de builds verificado? Package lockfile auditado? Update automático com validação? |
| A09 | **Logging Failures** | Logs capturam ações críticas? **Nenhuma credencial em log**? Timezone + correlation ID? Retention configurada? |
| A10 | **SSRF** | Request server-side pra URL user-controlled bloqueia internal IPs (`127.0.0.1`, `169.254.*`, `10.*`)? |

---

## CI — Segurança em camadas

| Camada | O que faz |
|---|---|
| Pre-commit hook | Bloqueia secret óbvio antes de commit |
| CI secret-scan (TruffleHog/gitleaks) | Re-scan no PR |
| CI SAST (Semgrep / SonarQube) | Detecta padrões inseguros no código |
| CI dependency audit (`npm audit`, Dependabot) | Detecta CVEs em deps |
| Runtime monitoring (Sentry / Datadog) | Detecta exploit em prod |

**Princípio defense-in-depth:** nenhuma camada é suficiente; todas são complementares.

---

## Anti-Patterns

❌ Commit de `.env` "só pra testar CI" (mesmo deletando commit seguinte, está no reflog)
❌ Copy-paste de credencial em Slack/email sem canal encriptado
❌ Reuso de senha entre serviços
❌ Fallback "inseguro é OK em dev" que vaza pra prod (ex: `NODE_ENV` não setado)
❌ Hardcode de secret em Dockerfile / docker-compose.yml commitado
❌ Log de `req.body` completo (pode conter senha/token em payload de login/auth)
❌ Expor `error.stack` ao cliente em erro 500
❌ `Access-Control-Allow-Origin: *` com `Access-Control-Allow-Credentials: true` (CORS broken)
❌ Skipping `--no-verify` pra contornar hook de segurança (**proibido** em qualquer projeto wingx — ver `feedback_no_bypass`)

---

## Notas do consumer

Cada projeto deve documentar em `knowledge/concepts/secrets-inventory.md`:
- Lista de credenciais + onde cada uma mora (envvar name, provider)
- Como renovar cada uma (link do painel + comando)
- Último rotation date por credencial
- Exceções conhecidas e justificadas (arquivos locais fora do git, etc.)
- Status da última rotação completa
