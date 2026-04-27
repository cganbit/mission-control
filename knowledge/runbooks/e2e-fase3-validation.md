# Runbook — E2E validation PRD-036 F7 Fase 3 (vendas ML reais)

**Quando usar:** Cleiton tem vendas ML reais e quer validar que as 28 rotas migradas pra `@wingx-app/api-{ml,me,print}` funcionam em produção (`mc.wingx.app.br`). Destrava checkpoint "E2E Cleiton 8 domains refactored" do CLAUDE.md.

**Pré-requisitos:**
- Conta ML com vendas ativas (token OAuth válido)
- Login em `mc.wingx.app.br` como user tenant Paraguai
- Acesso SSH VPS ou Docker logs (`docker logs mission-control` no host `mission-control.vps`)
- Aba DevTools network panel aberta pra inspecionar requests

**Versão de referência:** `@wingx-app/api-ml@0.1.4` + `api-me@0.1.4` + `api-print@0.1.4` (published GitHub Packages 2026-04-22).

---

## Checklist por domain (8 domains)

### ✅ 1. ml_pedidos (vendas) — já validado 72 pedidos pós hard reload

**Reconfirmar:**
- [ ] Abre `mc.wingx.app.br/mercado-livre/pedidos`
- [ ] Lista pedidos aparece (quantidade > 0 com vendas reais)
- [ ] Network: request `GET /api/mercado-livre/pedidos` retorna 200
- [ ] Response shape: array de objects com campos esperados (`id`, `status`, `buyer`, `date_created`, `total_amount`, items)
- [ ] Zero `p.buyer_name` errors (bug fixado em v0.1.4)

**Evidência capturar:** screenshot lista + response JSON truncado (5 primeiros pedidos) + status code.

### ⬜ 2. ml_clientes (buyer profiles)

- [ ] Abre `mc.wingx.app.br/mercado-livre/clientes`
- [ ] Lista buyers aparece
- [ ] Network: `GET /api/mercado-livre/clientes` → 200 + array
- [ ] Click em 1 cliente → detail page → `GET /api/mercado-livre/clientes/[buyer_id]` → 200
- [ ] PATCH nota livre em 1 cliente → `PATCH /api/mercado-livre/clientes` → 200 + persistência

**Evidência:** screenshot lista + patch response.

### ⬜ 3. ml_contas (multi-conta OAuth)

- [ ] Abre `mc.wingx.app.br/mercado-livre/contas` (ou equivalente)
- [ ] Lista contas ML conectadas (pelo menos 1 com vendas reais)
- [ ] Network: `GET /api/mercado-livre/accounts` → 200
- [ ] Test adicionar 2ª conta (se tiver credencial) → `POST /api/mercado-livre/accounts` → redirect pro OAuth ML
- [ ] **GAP esperado:** `/accounts/[id]/resend` webhook resend retorna 501/TODO — ⬜ confirma gap (item pendente BACKLOG #14)
- [ ] PATCH account label → `PATCH /api/mercado-livre/accounts/[id]` → 200

**Evidência:** lista contas + response POST/PATCH.

### ⬜ 4. ml_listagens (estoque/preços)

- [ ] Abre `mc.wingx.app.br/mercado-livre/listings` (ou `/anuncios`)
- [ ] Lista anúncios ativos aparece
- [ ] Network: `GET /api/mercado-livre/listings` → 200 + array
- [ ] PATCH 1 listing (ex: update price) → `PATCH /api/mercado-livre/listings` → 200 + confirma em ML API externa

**Evidência:** antes/depois patch + ML response.

### ⬜ 5. ml_perguntas (Q&A)

- [ ] Abre page de perguntas
- [ ] Lista questions pendentes aparece
- [ ] Network: `GET /api/mercado-livre/questions` → 200
- [ ] Se tiver pergunta pendente, answer: `POST /api/mercado-livre/questions` → 200 + ML confirma

**Evidência:** lista + answer response (ou skip se sem perguntas pendentes).

### ⬜ 6. ml_dre (analytics financeiro)

- [ ] Abre dashboard DRE ou `/mercado-livre/dre`
- [ ] Charts carregam com dados vendas reais
- [ ] Network: `GET /api/mercado-livre/dre` → 200 + aggregations
- [ ] Numbers batem com pedidos reais (receita bruta ≈ soma `total_amount` filtrados período)

**Evidência:** screenshot dashboard + response truncado.

### ⬜ 7. me_envios (shipping Melhor Envio)

- [ ] Abre page de envios
- [ ] Network: `GET /api/melhor-envio/balance` → 200 + saldo real
- [ ] `GET /api/melhor-envio/orders` → 200 + lista envios
- [ ] Se tiver pedido com etiqueta gerada: `GET /api/melhor-envio/track?order_id=X` → 200 + tracking real
- [ ] Test simulate: `POST /api/melhor-envio/simulate` → 200 + cotação frete

**Evidência:** balance + track response.

### ⬜ 8. print_fila (label PDF)

- [ ] Abre `mc.wingx.app.br/fila` ou print queue
- [ ] Lista jobs aparece (62 jobs foram apagados em prod per CLAUDE.md — pode estar vazia inicialmente)
- [ ] Network: `GET /api/print-queue` → 200
- [ ] Enqueue 1 job novo (se tiver pedido com etiqueta pronta): `POST /api/print-queue` → 201 + job visível na lista
- [ ] Electron print-client Windows local pega job? (⬜ pendência #4 BACKLOG — não testar agora se sem Windows local)

**Evidência:** queue list + enqueue response.

---

## Checklist transversal (não-domain)

### OAuth refresh flow
- [ ] Se token ML expira durante validação, refresh automático roda? Check logs:
  - `docker logs mission-control | grep -i "ml.*refresh"` no VPS
  - Ou observar que nenhum 401 ML aparece na network
- [ ] Se refresh **falha**, capturar stderr + reportar (bug potencial)

### RLS strict mode (C3.6)
- [ ] Todos requests chegam com tenant correto (Paraguai project_id `...001`)?
- [ ] Switcher sidebar mostra Paraguai como active project?
- [ ] Nenhum 500 "permission denied schema public" (bug fixado C3.6)

### Env vars confirmadas
- [ ] `ML_CLIENT_ID` ou `connector_configs[ml_app_id]` set
- [ ] `ML_CLIENT_SECRET` ou `connector_configs[ml_client_secret]` set
- [ ] `ML_REDIRECT_URI = mc.wingx.app.br/api/mercado-livre/oauth/callback`
- [ ] `DATABASE_URL` apontando pra role `mc_app` (não `evolution`)
- [ ] `NODE_AUTH_TOKEN` funciona (npm install funcionou no deploy)

---

## Reportar resultado

Pra cada checkbox marcada, capturar:
1. Timestamp
2. Screenshot (se UI)
3. Response JSON truncado (se API)
4. Status code
5. Qualquer anomalia (warn, 5xx, dados inesperados)

Consolidar em `mission-control/knowledge/e2e-reports/fase3-<YYYY-MM-DD>.md` seguindo template:

```md
# E2E Fase 3 validation — <YYYY-MM-DD>

## Summary
- Domains passed: N/8
- Gaps confirmed: <list>
- Bugs found: <list ou zero>

## Per-domain evidence
### 1. ml_pedidos
- Status: ✅ / ❌
- Evidência: <link screenshot ou JSON>
- Notes: ...

... (8 domains)
```

---

## Próximos passos após E2E

**Se 8/8 ✅:**
- Destrava pendência #1 CLAUDE.md
- Parte pra **OAuth migration** (Caminho 2 da sessão PRD-041 AB test):
  - Design `OAuthAdapter` (novo, encapsula NextResponse.redirect + cookies + token exchange)
  - Migration 3 routes (`accounts/[id]/resend`, `oauth/authorize`, `oauth/callback`) pra `@wingx-app/api-ml`
  - Executar via `/epic` (ou emular pipeline) = AB test real PRD-041
  - Coletar 10 métricas vs baseline 2026-04-22
  - Report + seal ADR-006 + PRD-041

**Se gaps críticos (bugs 5xx, dados errados):**
- Abrir incident em `mission-control/knowledge/incidents/`
- Rollback via `.env.bak-pre-c3.6-<ts>` se precisar (C3.6 rollback disponível)
- Fix antes de OAuth migration

**Se só gaps esperados (accounts/resend + oauth/authorize + oauth/callback):**
- Gaps documentados no BACKLOG #14 — não bloqueiam checkpoint
- Partir pra OAuth migration direto

---

## Referências

- CLAUDE.md wingx-platform — pendência #1 "Cleiton E2E mc.wingx.app.br 8 domains refactored"
- BACKLOG.md item 14 — OAuth 3 routes deferred
- PRD-036 F7 Fase 3 handoff — `wingx-platform/knowledge/handoffs/retomada-prd036-f7-fase3-closed-2026-04-22.md`
- Rollback runbook — `mission-control/knowledge/runbooks/rotate-mc-app-password.md` (senha mc_app)
