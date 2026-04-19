---
name: audit-logging
description: Append-only audit trail em JSONL com rotação diária (UTC), PII-scrubbed via `scanText` (P1) e concurrent-write-safe via `withLock` (P2). Write-path counterpart do `skills/security-guardrails` (que é read-path). Helper em `@wingx-app/platform` export `appendAuditLog` + `readAuditLog`. Consumer chama manualmente ao fim de comandos (/fix, /task, hooks) — wiring automático de post-command hook ficou pendente de decisão de evento Claude Code.
allowed-tools: Read, Grep, Bash
---

# Audit Logging

> Write-path logging append-only. JSONL + rotação diária UTC + PII scrubbing
> dogfoodado no `scanText` + lock atômico dogfoodado no `withLock`.

---

## Quando usar

Use ao final de qualquer operação cujo histórico precise ser auditável:

1. **Command lifecycle** — append ao fim de `/fix`, `/task`, `/spike`, `/close-sprint` com `action: '<cmd>.completed'` + `metadata: { prd_id, duration_ms, outcome }`
2. **Hook firing** — append dentro de hooks críticos (user-prompt-submit, pre-tool-use bloqueadores) com `action: 'hook.<name>.fired'`
3. **Security events** — append quando `scanText` bloqueia commit (`severity: 'warn'`), quando lock timeout (`severity: 'error'`), quando waiver é tentado (`severity: 'critical'`)
4. **State transitions do consumer** — ex: MC migra de rc.3 → rc.4, Paraguai extrai módulo

**Não use quando:**
- Operação é 100% read-only e não muda estado (leitura de PRD, listagem de backlog)
- Logging é pra debugging efêmero (preferir `console.error` ou DEBUG=1)
- Dado a loggar excede ~10 KB por entry (JSONL fica pesado — preferir storage dedicado)

---

## Padrão conceitual

Origem: Agent-SmithV6 `lib/logger.ts` + `system_logs` Postgres table com
`pii_scrubbed BOOLEAN DEFAULT TRUE` como garantia de schema:

```sql
CREATE TABLE system_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  company_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,
  metadata JSONB,
  pii_scrubbed BOOLEAN DEFAULT TRUE,
  severity TEXT
);
```

Platform não tem DB — re-implementado filesystem-only em JSONL append-only.
Garantia `pii_scrubbed` persistida no próprio entry (não no schema DDL).
Rotação por arquivo diário UTC dá locality de disco + retenção trivial
(`find knowledge/audit -mtime +90 -delete`).

**Dogfood intencional:**
- PII scrubbing reusa `scanText` de `skills/security-guardrails` (P1)
- Concurrent write reusa `withLock` de `skills/atomic-locks` (P2)

Ambos absorbed na mesma Week 4/5 — audit-logging valida que as camadas anteriores
são usáveis como building blocks.

---

## API da platform

Importar de `@wingx-app/platform`:

```ts
import {
  appendAuditLog,
  readAuditLog,
  AUDIT_SCHEMA_VERSION,
  type AuditEntry,
  type AuditSeverity,
} from '@wingx-app/platform';

await appendAuditLog(
  {
    action: 'fix.completed',
    actor: 'claude-code',
    project_id: 'PRD-035/week5-audit',
    severity: 'info',
    metadata: { duration_ms: 4823, steps: 22, outcome: 'green' },
  },
  { dir: './knowledge/audit' },
);

// Later:
const today = new Date().toISOString().slice(0, 10);
const entries = await readAuditLog(today);
console.log(`${entries.length} audit events today`);
```

**Opções (`AppendAuditOptions`):**

| Opt | Default | Descrição |
|---|---|---|
| `dir` | `./knowledge/audit` | Diretório do jsonl (relativo ao cwd) |
| `scrubPII` | `true` | Roda `scanText` e mascara violations antes de persistir |
| `lockTimeoutMs` | `10_000` | Timeout do `withLock` no `.lock` do dir |

Lock TTL fixo em 5s (apêndice dura ms). Se precisar diferente, reabrir issue.

---

## Schema JSONL

Uma entry por linha. Exemplo:

```json
{"timestamp":"2026-04-18T14:23:11.482Z","action":"fix.completed","actor":"claude-code","project_id":"PRD-035/week5-audit","metadata":{"duration_ms":4823,"outcome":"green"},"severity":"info","pii_scrubbed":true}
```

Campos:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `timestamp` | ISO-8601 UTC | sim (auto) | Momento da persistência |
| `action` | string | sim | Nome curto do evento (ex: `fix.completed`) |
| `actor` | string | não | Ator (ex: `claude-code`, `user:cleiton`, `hook:pre-tool-use`) |
| `project_id` | string | não | Escopo (ex: `PRD-035/week5`, `paraguai/hotfix-auth`) |
| `metadata` | object | não | Payload arbitrário (number, string, nested) |
| `severity` | `'info'\|'warn'\|'error'\|'critical'` | sim | Nível |
| `pii_scrubbed` | boolean | sim (auto) | `true` se `scanText` rodou (default); `false` se caller passou `scrubPII: false` |

**Rotação:** `<dir>/YYYY-MM-DD.jsonl`. Arquivo do dia UTC. Sem cap de tamanho
no lib (consumer decide retenção + rotação secundária se precisar).

**Versionamento:** `AUDIT_SCHEMA_VERSION = '1'` exportado. Quando schema quebrar
(campo obrigatório novo, rename), bump + migration doc.

---

## PII scrubbing (dogfood P1)

Quando `scrubPII = true` (default), `appendAuditLog` chama `scanText` em:

1. `entry.action` (string)
2. `entry.actor` (string opcional)
3. `JSON.stringify(entry.metadata)` — stringifica pra rodar regex, re-parseia depois

Cada `Violation` retornada tem `match` (original) + `masked` (redacted). O
helper substitui longest-first no texto e persiste só a versão mascarada.

**Exemplo input:**
```ts
{ action: 'login', metadata: { email: 'user@example.com', cpf: '123.456.789-00' } }
```

**Persistido:**
```json
{"timestamp":"...","action":"login","metadata":{"email":"us***@example.com","cpf":"***.***.***-**"},"severity":"info","pii_scrubbed":true}
```

**Edge case:** se mask introduz char que quebra JSON re-parse (raro —
masks atuais são safe), helper cai em fallback `metadata: { _scrubbed: <str> }`.

**Relação com `skills/security-guardrails`:**

| Skill | Direção | Uso |
|---|---|---|
| `security-guardrails` | **read-path** | Scan de diff/prompt ANTES de commit/LLM. Fail-close via `process.exit(1)` |
| `audit-logging` | **write-path** | Scrub ao persistir evento. Fail-open (mascara + continua) — perda de event seria pior que PII |

Ambos usam `scanText`. Um bloqueia fluxo, outro mascara silenciosamente.

---

## Concurrent write safety (dogfood P2)

`appendAuditLog` envolve o `appendFileSync` em `withLock('<dir>/.lock', fn, { ttlMs: 5000, timeoutMs: 10000 })`:

- **Por que:** 2 pipelines `/fix` concorrentes escrevendo no mesmo `YYYY-MM-DD.jsonl` causariam append interleaved (linha parcial de A + linha parcial de B = JSON corrupto)
- **TTL 5s:** append de ~500 bytes é sub-ms. 5s é buffer generoso pra I/O slow (disk pressure, antivirus, network mount)
- **Timeout 10s:** se 2+ pipelines backpressuram, espera-se até 10s antes de `LockTimeoutError`. Consumer decide retry

**Verificação:** 2 `Promise.all([appendAuditLog(a), appendAuditLog(b)])` = 2 linhas JSON válidas no arquivo, sem corrupção.

---

## Anti-patterns

❌ **Logar raw request bodies** — podem conter JWT, senha, PII não-coberta pelas regex atuais. Filtrar ANTES de passar em `metadata`
❌ **Logar password hasheado** — hash + salt leak + rainbow ainda é risco. Logar apenas `password_updated: true`, NUNCA o hash
❌ **Setar `scrubPII: false` em prod** — só aceitável em testes unitários ou quando caller provou que input é 100% sintético
❌ **Depender do audit-log como fonte primária de estado** — é trail, não source of truth. Consumer deve ter o estado em outro lugar (PRD.md, BACKLOG.md, DB)
❌ **Agregar em memória antes de persistir** — perde eventos em crash. Persist-first, aggregate-later (ler o jsonl ao rodar dashboard)
❌ **Usar um só arquivo global sem rotação** — 90 dias = arquivo 100 MB+. Platform já rotaciona diário UTC — não alterar rotina no consumer
❌ **Committar `knowledge/audit/*.jsonl` no git** — audit trail é per-environment. Consumer deve `.gitignore` a pasta

---

## Consumer how-to

**Em pipelines skill-driven (/fix, /task):** append no step final (ex: step 22 `update_prd_status` de `/fix`) com:

```ts
await appendAuditLog({
  action: 'fix.completed',
  actor: 'claude-code',
  project_id: `${PRD_ID}/${SLUG}`,
  severity: 'info',
  metadata: { outcome: 'green', duration_ms: Date.now() - startedAt, steps_run: 22 },
});
```

**Em hooks Claude Code:** append dentro de `.cjs` handler após decisão:

```js
const { appendAuditLog } = require('@wingx-app/platform');
await appendAuditLog({
  action: 'hook.pii-scrubber.blocked',
  actor: 'hook:user-prompt-submit',
  severity: 'warn',
  metadata: { violations_count: 3, layers: ['pii'] },
});
```

**Em CLI `wingx`:** cada subcommand (register, doctor, validate) append no fim pra ter audit de adoption.

---

## Hook wiring pendente

**Decisão postponed:** extracted-from-agent-smith.md §P4 originalmente propunha
`hooks/post-command/audit-log.cjs` automático. Claude Code **não tem evento
"command completion"** 1:1 — opções são `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `Stop`, `SubagentStop`. Nenhum mapeia limpo pra "skill pipeline terminou".

**Até decisão:** consumers chamam `appendAuditLog` **manualmente** no último step
do skill pipeline (convenção: step `update_prd_status` de `/fix`, step
`finalize` de `/task`). Isso é explícito + testável + não depende de timing
de hook.

**Próximo passo:** spike pra avaliar `Stop` event (fires when main agent finishes response) vs per-command opt-in via skill metadata. Registrar em follow-up após esta absorção.

---

## Verificação pós-implementação

```ts
import { appendAuditLog, readAuditLog } from '@wingx-app/platform';
import { rmSync } from 'node:fs';

const tmpDir = 'C:/temp/wingx-audit-smoke';
rmSync(tmpDir, { recursive: true, force: true });

// PII scrub
await appendAuditLog(
  { action: 'test', severity: 'info', metadata: { email: 'a@b.co' } },
  { dir: tmpDir },
);
const today = new Date().toISOString().slice(0, 10);
const entries = await readAuditLog(today, { dir: tmpDir });
console.assert(entries.length === 1);
console.assert(entries[0].pii_scrubbed === true);
console.assert(!JSON.stringify(entries[0]).includes('a@b.co'));

// Concurrent writes (P2 dogfood)
await Promise.all([
  appendAuditLog({ action: 'p1', severity: 'info' }, { dir: tmpDir }),
  appendAuditLog({ action: 'p2', severity: 'info' }, { dir: tmpDir }),
]);
const after = await readAuditLog(today, { dir: tmpDir });
console.assert(after.length === 3); // 1 + 2

console.log('PASS');
```

Esperado: 3 entries, todas JSON válido, nenhuma com raw PII.

---

## Referências

- PRD-035 §9 D31 — absorção P4 Agent-Smith
- `lib/audit-log.ts` — implementação
- `skills/security-guardrails` — origem do `scanText` (P1)
- `skills/atomic-locks` — origem do `withLock` (P2)
- `knowledge/migration/extracted-from-agent-smith.md` §P4 — snippet origem
