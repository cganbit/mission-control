---
name: cost-accounting
description: Padrão de contabilidade de custo LLM por run/step. Tabela hardcoded v1 com pricing Anthropic Claude + helper `estimateCost` puro/síncrono + cap absoluto configurável. Consultar antes de comandos que disparam execução tiered (opus plan + sonnet execute) ou quando `McTelemetry.trackRun` payload precisa expor `cost_usd`. Helper em `@wingx-app/platform` export `getPricing/estimateCost/PRICING_TABLE_VERSION/DEFAULT_SELL_MULTIPLIER`.
allowed-tools: Read, Grep, Bash
---

# Cost Accounting

> Medir $ de cada run. Tabela local hardcoded v1, cloud fetch é follow-up.

---

## Quando usar

Use em qualquer step que:

1. **Estima tokens de trabalho futuro** — ex: `/fix` step 8, `/task` step 11, pipelines que prevêem custo antes de commitir execução
2. **Reporta tokens reais gastos** — ex: `McTelemetry.trackRun` payload, relatórios `/close-sprint`, dashboards MC
3. **Precisa de gate $** — ex: abort se run estimado > cap pra evitar sonnet/opus runaway

**Não use quando:**
- Consumer ainda está no rc.3/rc.4 — feature-detect com try/catch e caia no fallback token-only
- Você está medindo consumption em tempo real durante streaming (Anthropic SDK tem seu próprio callback; este módulo é offline/batch)
- Você precisa da cobrança real SaaS cliente-final — este é dev tooling; a tabela é informativa, não billing-grade (ver TODO abaixo)

---

## Padrão conceitual

Origem: Agent-SmithV6 `backend/app/services/usage_service.py` +
`billing_service.py` — `PricingService` 3-tier:

```python
# Tier 1 — DB (autoritativo, atualizado por admin)
# Tier 2 — Cache (TTL 5min)
# Tier 3 — Hardcoded fallback (quando DB e cache vazios)
# sell_multiplier (default 2.68x) aplicado pra resell SaaS
```

wingx-platform v1 adota **apenas o Tier 3 (hardcoded)** — suficiente pra
dev tooling onde custo é orientativo, não faturado. Cloud fetch é work
pós-v1.0 (ver TODO em `lib/mc-telemetry/pricing.ts`).

---

## API da platform

Importar de `@wingx-app/platform`:

```ts
import {
  getPricing,
  estimateCost,
  DEFAULT_SELL_MULTIPLIER,
  PRICING_TABLE_VERSION,
  type ModelPricing,
} from '@wingx-app/platform';

// Lookup bruto
const p: ModelPricing | null = getPricing('claude-sonnet-4-6');
// => { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 }

// Estimar custo de uma call
const { cost_usd, base_usd, multiplier } = estimateCost({
  model: 'claude-sonnet-4-6',
  tokensInput: 100_000,
  tokensOutput: 20_000,
  // tokensCachedInput: 0,      // opcional
  // sellMultiplier: 2.68,       // opcional; default = DEFAULT_SELL_MULTIPLIER (1.0)
});
// => cost_usd ≈ 0.60 (base_usd × 1.0)
```

**Null-safe:** `getPricing('unknown-model')` retorna `null`;
`estimateCost({ model: 'unknown-...' })` retorna `{ cost_usd: 0, base_usd: 0, multiplier }`.
Nunca throws. Cabe ao caller decidir log-warn + skip emit vs prosseguir com 0.

**Deterministic + sync:** pode chamar dentro de hooks ou steps que precisam
ser rápidos. Zero I/O, zero deps externos.

---

## Escolha de `sellMultiplier`

| Cenário | Multiplier sugerido |
|---|---|
| wingx-platform dev tooling (default) | **1.0** — sem markup, só custo Anthropic |
| Dogfood interno (Paraguai/MC reporta ao team) | 1.0 |
| Consumer revende como SaaS b2b | 2.0-3.0 (Agent-SmithV6 usa 2.68) |
| Consumer gratuito pra usuário final | 0.0 (reporta $0; loga base_usd internamente) |

O constant `DEFAULT_SELL_MULTIPLIER = 1.0` é o ponto de partida pro
platform. Consumers que revendem passam valor explícito a cada call.

---

## Cost cap nos commands

`/fix` step 8 e `/task` step 11 aplicam cap absoluto default **$5.00** no
cost estimado:

```js
const cap = Number(process.env.WINGX_COST_CAP ?? 5);
if (cost_usd !== null && cost_usd > cap && !args.includes('--force-cost-over-cap')) {
  abort(`Cost estimate $${cost_usd.toFixed(2)} exceeds cap $${cap}. Use --force-cost-over-cap to override.`);
}
```

**Regra prática:**
- `/fix` típico: $0.10-$0.50 (exec phase sonnet)
- `/task` típico: $0.50-$2.00 (plan opus + exec sonnet × N phases)
- Runs além de $5 normalmente indicam escopo errado — usuário deve quebrar

Override legítimo: migração grande 1-shot onde o custo vale. Logar override
na sessão pra auditoria.

---

## Relationship to `skills/token-optimizer`

**Ortogonal:** token-optimizer = **reduzir tokens** (cache hits, prompt
trim, context-mode offload); cost-accounting = **medir $ dos tokens**.
Ambos são boa prática — tokens baixos × multiplier baixo = $ baixo.

Workflow comum em steps de planning:
1. Step anterior estima tokens brutos
2. `token-optimizer` skill sugere reduções (ex: usar haiku em vez de sonnet onde possível)
3. `cost-accounting` `estimateCost` confirma o $ após otimização
4. Se ainda acima do cap → abort ou pedir override

---

## Anti-patterns

- **Tratar a tabela como billing-grade sem verificar** — valores são públicos mas drift. Antes de usar em contexto financeiro real, bater com a página oficial https://www.anthropic.com/pricing e bump `PRICING_TABLE_VERSION`
- **Emitir `cost_usd: 0` silencioso pra modelo desconhecido** — sempre logar warn pra facilitar diagnose (modelo typo? novo release?)
- **Aplicar `sellMultiplier` no meio do calculation em vez de no topo** — multiplier é aplicado uma vez no base_usd final. Não dobrar aplicação (input × mult, output × mult, e depois total × mult de novo)
- **Chamar `estimateCost` sem feature-detect em código que roda em consumer rc.3/rc.4** — quebra; use try/catch ou checagem de `typeof`
- **Hardcodear cap $5 em novo code** — leia de env `WINGX_COST_CAP` pra consistência com `/fix` e `/task`
- **Usar pricing.ts pra fazer fetch de pricing remoto** — módulo é puro/sync por design; TODO aponta upgrade path sem quebrar API

---

## Verificação pós-implementação

Smoke test local (após `npx tsc`):

```bash
node -e "
const { getPricing, estimateCost, PRICING_TABLE_VERSION } = require('@wingx-app/platform');
console.log('version:', PRICING_TABLE_VERSION);
console.log('sonnet:', getPricing('claude-sonnet-4-6'));
console.log('unknown:', getPricing('foo'));
const r = estimateCost({ model: 'claude-sonnet-4-6', tokensInput: 100000, tokensOutput: 20000 });
console.log('cost:', r);
"
```

Esperado:
- version: `2026-04` (ou bump atual)
- sonnet: objeto com `inputPerMillion: 3, outputPerMillion: 15`
- unknown: `null`
- cost: `{ cost_usd: 0.6, base_usd: 0.6, multiplier: 1 }`

---

## Aplicação no `/fix` step 8 e `/task` step 11

Ambos os commands expandiram `estimate_token_budget` pra emitir `cost_usd`
ao lado do token count. Feature-detect via try/catch preserva compat com
consumers rc.3/rc.4 (fallback cai em token-only, comportamento original).

Cap check fica inline no step — se exceder, abort antes de criar worktree
ou dispatch do execute agent.

---

## Referências

- PRD-035 §9 D31 — absorção P3 Agent-Smith
- PRD-035 §14.0 Matriz de patterns — P3 roteado pra Week 5 Fase B
- `lib/mc-telemetry/pricing.ts` — implementação (hardcoded table + helpers)
- `lib/mc-telemetry.ts` — `McCreateRunStep.cost_usd` + `McCreateRunPayload.total_cost_usd`
- `knowledge/migration/extracted-from-agent-smith.md` §P3 — snippet origem
- `skills/token-optimizer/SKILL.md` — skill ortogonal (reduzir tokens)
- `commands/fix.md` step 8 — consumer primary
- `commands/task.md` step 11 — consumer primary
- TODO pós-v1.0: cloud fetch `/api/pricing?version=...` com TTL cache (substitui hardcoded table)
