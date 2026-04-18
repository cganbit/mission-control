---
name: atomic-locks
description: Padrão de concorrência segura com lockfile TTL (CAS-style) pra operações single-writer. Consultar antes de operações que fazem append/update em arquivos compartilhados (PRDs, BACKLOG, state files) quando 2+ pipelines podem rodar concorrentes. Helper em `@wingx-app/platform` export `acquireLock/releaseLock/withLock`.
allowed-tools: Read, Grep, Bash
---

# Atomic Locks

> Concorrência segura sem DB. Filesystem lockfile com TTL explícito.

---

## Quando usar

Use em qualquer operação que:

1. **Faz append/mutação em arquivo compartilhado** — ex: `PRD-035.md` Progress append, `BACKLOG.md` checklist update, `knowledge/audit/*.jsonl`
2. **Pode ser invocada por 2+ pipelines concorrentes** — ex: `/fix PRD-X/task-a` e `/fix PRD-X/task-b` rodando em paralelo, ambos querendo atualizar o PRD-X.md
3. **Tem outcome dependente de ordem de execução** — evitar last-write-wins silencioso que sobrescreve trabalho do vizinho

**Não use quando:**
- Operação é idempotente (mesma mutação 2x = mesmo resultado)
- Arquivo é write-once por pipeline (cada pipeline escreve num path único)
- Operação é cluster/multi-machine (lockfile é filesystem-local)

---

## Padrão conceitual (CAS-style)

Origem: Agent-SmithV6 `backend/app/services/memory_service.py` — debounce de
summarization concorrente via Postgres CAS atômico:

```sql
-- CAS-style atomic lock:
UPDATE conversation_memory
SET is_processing = TRUE, lock_expires_at = NOW() + INTERVAL '5 minutes'
WHERE session_id = $1
  AND (is_processing = FALSE OR lock_expires_at < NOW())
RETURNING *;
-- Se RETURNING vazio, alguém já tem lock. Skip.
-- Se retornou row, você adquiriu. Processa. Ao fim: UPDATE SET is_processing = FALSE.
```

Re-implementado filesystem-only: `writeFileSync(path, meta, { flag: 'wx' })` é
atomic no Node (flag `wx` = fail if exists). Stale locks são detectados via TTL
em metadata JSON e reclamados.

---

## API da platform

Importar de `@wingx-app/platform`:

```ts
import { acquireLock, releaseLock, withLock, LockTimeoutError } from '@wingx-app/platform';

// Low-level: manual acquire + release
const meta = await acquireLock('.wingx/locks/prd-035.lock', {
  ttlMs: 30_000,      // auto-expira em 30s (default)
  timeoutMs: 30_000,  // desiste de esperar após 30s (default)
  retryIntervalMs: 250,
});
try {
  // ... operação crítica ...
} finally {
  releaseLock('.wingx/locks/prd-035.lock', meta.owner);
}

// High-level: helper com finally automático
await withLock('.wingx/locks/prd-035.lock', async () => {
  // ... operação crítica ...
}, { ttlMs: 30_000 });
```

**Ownership enforced:** `releaseLock` só deleta se `owner` bater. Protege
contra release acidental de lock de outro processo (stale handle).

**Stale reclaim:** se lockfile existe mas `expiresAt < now`, o acquire
reclama automaticamente. Owner original saiu de cena (crash, kill, network).

---

## Invocação via CLI (de dentro de um command step)

Dentro do step 22 do `/fix` ou `/task`, ao fazer append em PRD.md ou BACKLOG:

```bash
node -e "
const { withLock } = require('@wingx-app/platform');
const { appendFileSync } = require('node:fs');
withLock('.wingx/locks/prd-${PRD_ID}.lock', () => {
  appendFileSync('knowledge/prds/${PRD_ID}.md', '\n- [x] step done\n');
}, { ttlMs: 10000 }).catch((e) => { console.error(e.message); process.exit(1); });
"
```

Se outro pipeline já tem lock → espera até 30s (default) → se timeout,
`LockTimeoutError`. Step reporta erro via exit 1 e o runner decide retry.

---

## Escolha de `ttlMs`

TTL deve ser ≥ pior caso do trabalho crítico que o lock protege.

| Operação | TTL sugerido |
|---|---|
| Append 1 linha em PRD.md | 5-10s |
| Update BACKLOG.md (múltiplas linhas) | 10-30s |
| Sync de arquivos grandes (sync command) | 60s |
| Build + publish (rc.X bump) | 300s |

TTL muito baixo → lock expira no meio do crítico → outro pipeline rouba → corrupção.
TTL muito alto → crash deixa lock órfão muito tempo → pipelines novos esperam à toa.

**Regra prática:** medir p99 real + 2x buffer.

---

## Anti-patterns

❌ **TTL = 0 ou infinito** — derrota o propósito do TTL (stale reclaim)
❌ **Fazer I/O blocking síncrono dentro do `withLock`** que trava por > TTL — lock expira + outro pipeline entra = corrupção
❌ **Acquire sem release em erro path** — preferir `withLock` (finally automático)
❌ **Release sem owner check** — código default faz, mas custom release deve manter
❌ **Lockfile em `/tmp`** — se filesystem reset no crash, lock desaparece sem ownership check. Preferir `.wingx/locks/` dentro do repo (mas gitignore)
❌ **Usar lockfile pra ordenar writes** — lock é mutex, não queue. Se ordem importa, use fila explícita

---

## Aplicação no `/fix` step 22

O step 22 do `/fix` (`update_prd_status`) faz append no PRD.md Progress
section. Se 2 `/fix` rodam concorrentes (tasks diferentes no mesmo PRD), o
append race-conditions causaria última-escrita-sobrescreve-primeira.

Solução: envolver append em `withLock(`.wingx/locks/prd-${PRD_ID}.lock`, ...)`
com TTL 10s. Consumer sem suporte a atomic-locks (rc.3/rc.4) cai no fallback
original (append direto, race possível mas aceito como known-issue).

---

## Verificação pós-implementação

Smoke test de concorrência:

```bash
# Terminal 1
node -e "require('@wingx-app/platform').withLock('/tmp/test.lock', async () => { console.log('T1 in'); await new Promise(r => setTimeout(r, 3000)); console.log('T1 out'); })"

# Terminal 2 (start < 3s after T1)
node -e "require('@wingx-app/platform').withLock('/tmp/test.lock', () => console.log('T2 got it'))"
```

Esperado: T2 espera ~3s → "T1 out" → "T2 got it". Nunca output interleaved.

---

## Referências

- PRD-035 §9 D31 — absorção P2 Agent-Smith
- `lib/atomic-locks.ts` — implementação
- `knowledge/migration/extracted-from-agent-smith.md` §P2 — snippet origem
