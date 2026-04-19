---
name: fix
description: Pipeline skill-driven pra aplicar um fix com step catalog tiered (opus plan + sonnet execute + worktree isolation). Substitui /fix harness V4.6. Bifurca internamente pra bug (intent=bug aciona systematic-debugging skill antes do plan).
argument-hint: "<descrição do bug ou fix desejado>"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent
---

# /fix — Skill-driven fix pipeline

Você está executando o command `/fix` do `@wingx-app/platform`.

**Input:** `$ARGUMENTS` = descrição livre do bug ou fix desejado.

**Objetivo:** aplicar a correção minimal conforme spec, em branch isolada via worktree, sem nunca tocar o diretório principal do consumer. Rodar em 3-6min wall-clock.

---

## Arquitetura (PRD-035 §9 D26+D27+D28)

| Fase | Steps | Ambiente | Model | Observações |
|---|---|---|---|---|
| 1 | 1-5 | main thread | sonnet | understand — read-only |
| 1.5 | 5.5 | main thread | **opus** | só se intent=bug (discovery via skill `systematic-debugging`) |
| 2 | 6-8 | main thread | **opus** | plan — raciocínio estratégico |
| 2.5 | 8.5 | main thread | — | approval gate (spec escrita + user confirm) |
| 3-7 | 9-21 | **Agent isolation=worktree** | sonnet | execute + verify + review + finalize |
| 8 | 22 | main thread | haiku ou determinístico | telemetry + exit message |

Runtime cria e gerencia worktree automaticamente. Consumer dir **nunca é tocado**.

---

## FASE 1 — understand (main thread, sonnet, ~15s)

### step 1 — load_rules_and_memory
Invoque a skill `_rules` (R1-R10 + anti-bypass + anti-hallucination). Ler `knowledge/` do consumer se existir. Carregar memory/ relevante. Deterministic.

### step 1.5 — resolve_prd_reference (D30)
Determinístico, ~200ms. Detecta referência a PRD no início de `$ARGUMENTS`:

```
regex: /^(PRD-\d+)(?:\/([a-z0-9-]+))?\s+(.+)$/i
  ├─ match → { prd_id, task_slug (opt), task_description }
  └─ no match → { prd_id: null, task_slug: null, task_description: $ARGUMENTS }

if prd_id:
  - read knowledge/prds/<PRD-NNN>-*.md (grep filename match)
  - if task_slug: locate section por heading kebab-case ou frontmatter `<!-- id: <slug> -->`
  - extract prd_section + acceptance_from_prd (se presente)
```

Output:

```yaml
prd_id: "PRD-035 | null"
task_slug: "w3-item3 | null"
task_description: "<resto dos args, sem o ref>"
prd_section: "<seção matching do PRD se found>"
acceptance_from_prd: [...]  # se PRD já declara
```

Exemplos:
- `/fix PRD-035/w3-item2 worktree falha em ExFAT` → `{prd_id: PRD-035, task_slug: w3-item2, task_description: "worktree falha em ExFAT"}`
- `/fix cart modal close bug` → autocontida, skip PRD linking

### step 2 — parse_task_intent
Analise `task_description` (output de 1.5) e classifique:

```yaml
intent: fix | bug           # bug = precisa investigação; fix = causa conhecida
scope_guess: [arquivo|módulo|feature]
priority: low | medium | high
signals: [bug_keyword, error_msg, broken_behavior]
```

**Bifurcação:** se `intent == bug`, step 5.5 é obrigatório. Se `intent == fix`, pula pra step 6.

### step 3 — identify_affected_files
Grep + Glob na árvore do consumer. Retorne candidate files com risk assessment:

```yaml
files:
  - path: src/components/CartModal.tsx
    risk: low | medium | high
    reason: "contém handler suspeito"
risk_level_overall: low | medium | high
```

### step 4 — load_file_context
Read dos arquivos identificados. Imports relevantes. Padrões. Sem editar.

### step 5 — validate_scope_size
Determinístico. Total LOC afetados < 500? OK. Se > 500, sugerir `/task` em vez de `/fix` e abortar.

---

## FASE 1.5 — discovery (só se intent=bug, main thread, OPUS, ~30s)

### step 5.5 — systematic_debug
**Model: opus** (raciocínio profundo).

Invoque a skill `systematic-debugging`. Análise 5-why, isolation, reproduction steps. Output:

```yaml
root_cause: "Click handler no backdrop dispara onClose sem stopPropagation"
reproduction: ["abrir modal", "click fora", "modal fecha"]
fix_hypothesis: "adicionar stopPropagation + isolar onClose no X button only"
```

Não edite nada. Só raciocine.

---

## FASE 2 — plan (main thread, OPUS, ~30s)

### step 6 — draft_spec
**Model: opus.**

Escrever spec detalhado do fix. Se veio de bug (5.5 executou), incorporar root_cause + hypothesis. Saída:

```yaml
spec_md: |
  # Fix spec — <slug>
  ## Acceptance
  - Click fora NÃO fecha modal
  - Click no X fecha modal
  - Test case adicionado
  ## Changes
  - src/components/CartModal.tsx:
    - adicionar stopPropagation no backdrop onClick
    - mover onClose pra onClick do X apenas
  - tests/cart.test.ts:
    - novo test "should not close on backdrop click"
acceptance: [2 itens]
files_to_edit: [2 arquivos]
risk: low
```

### step 7 — validate_spec_schema
Determinístico. Schema: `{spec_md: string, acceptance: string[], files_to_edit: string[], risk: enum}`. Falha → abort.

### step 8 — estimate_token_budget
Determinístico. Estimar tokens do execute phase baseado em LOC dos files_to_edit × 4 (read + diff + apply + review). Se > 30k, warning. Se > 60k, abort sugerindo `/task`.

**Cost emit (PRD-035 Week 5 Fase B, P3 absorção):** além dos tokens, invocar `estimateCost` do `@wingx-app/platform` e emitir `cost_usd` estimado. Modelo default = `claude-sonnet-4-6` (execute tier; main-thread opus é contabilizado separado). Proporção input/output assumida 80/20 do budget total.

Feature-detect com try/catch — consumers rc.3/rc.4 sem `estimateCost` exportado caem no fallback token-only (comportamento anterior, nenhum cost emit):

```js
let cost_usd = null;
let pricing_table_version = null;
try {
  const pkg = require('@wingx-app/platform');
  if (typeof pkg.estimateCost === 'function') {
    const tokensIn = Math.round(estimatedTokens * 0.8);
    const tokensOut = Math.round(estimatedTokens * 0.2);
    const r = pkg.estimateCost({ model: 'claude-sonnet-4-6', tokensInput: tokensIn, tokensOutput: tokensOut });
    cost_usd = r.cost_usd;
    pricing_table_version = pkg.PRICING_TABLE_VERSION;
  }
} catch { /* rc.3/rc.4 fallback — skip cost emit */ }
```

**Cost cap:** threshold default **$5.00**. Se `cost_usd !== null && cost_usd > cap` → abort com warning. Override via env `WINGX_COST_CAP=<USD>` (ex: `WINGX_COST_CAP=20`) ou flag `--force-cost-over-cap` nos argumentos do `/fix`. Skip cap check quando `cost_usd === null` (fallback rc.3/rc.4 — preserve comportamento legacy).

Skill de referência: `skills/cost-accounting/SKILL.md`.

Output do step (JSON): `{ estimated_tokens, cost_usd, pricing_table_version, cap_usd, cap_exceeded }`.

---

## FASE 2.5 — approval gate (main thread)

### step 8.5 — write_spec_artifact + confirm
Escreva o spec em `.wingx/fix-spec-<timestamp>.md` no consumer dir (**único arquivo tocado no main dir, read-only view da intenção**). Caminho relativo ao cwd do consumer.

Em modo interativo: mostre ao user o spec + peça confirmação ("apply? (y/n)"). Se n, aborte com mensagem limpa e delete o arquivo .wingx/.

Em modo auto (flag `--auto` em $ARGUMENTS): apenas verifique schema + budget. Se OK, continua.

---

## FASE 3-7 — execute + verify + review + finalize (delegado a Agent com worktree)

### step 8.6 — dispatch_worktree_agent

Invoque o `Agent` tool com `isolation: "worktree"` passando o spec + contexto.

Prompt do subagent (template):

```
Você está executando a fase de execução do /fix num worktree isolado do repo <consumer>.

SPEC:
<conteúdo de .wingx/fix-spec-<ts>.md>

FILES_TO_EDIT:
<lista de paths relativos ao repo>

REPO_ROOT: <cwd do worktree>

ORDEM DE TRABALHO (13 steps):

1. Pra cada file em FILES_TO_EDIT, na ordem declarada (paralelo se sem shared imports e <=5 files):
   - step 9 read_target_file — Read do file atual
   - step 10 propose_diff — gere o diff conforme spec (sonnet, não reraciocine estratégia; spec já resolve)
   - step 11 validate_diff_syntax — rode typecheck/lint NO DIFF PROPOSTO antes de aplicar
     * Detectar toolchain do consumer: tsconfig.json → tsc --noEmit; package.json com "lint" → pnpm lint; pyproject.toml → ruff/mypy; go.mod → go vet; etc.
     * Soft-skip com warning se toolchain não detectado
   - step 12 apply_diff — Edit do file
   - step 13 run_scoped_tests — rode tests que importam esse file (vitest/jest --related, pytest path, etc.)

2. Verify PARALELO (4 steps concurrent):
   - step 14 run_full_tests — suite completa do consumer
   - step 15 static_analysis — linter repo-wide
   - step 16 change_impact_check — rode hook `hooks/pre-commit/change-impact-check.cjs` do platform contra staged
   - step 17 security_scan — **primary:** `@wingx-app/platform` `scanText(diff, { layers: ['secrets','injection','pii'] })` via skill `security-guardrails` (fail-close em violations). **Fallback (rc.3/rc.4 sem export):** trufflehog/gitleaks soft-skip se ausente. Trufflehog permanece como complemento opcional pra git history scan (soft-skip, não-bloqueante).

3. Review:
   - step 18 self_review — lê diffs + spec, confere se aplicação bateu. Sonnet.
   - step 19 emit_review_summary — markdown com verdict + suggestions

4. Finalize (dentro do worktree):
   - step 20 generate_commit_msg — msg estruturada estilo conventional commits: `fix(<scope>): <summary>`
   - step 21 update_session_log — append em `knowledge/sessions/<date>.md` (ou skip se consumer não usa)

REGRAS:
- Retry per step com backoff 2× (max 2 retries)
- Se step 11 ou step 13/14 falhar após retries → terminal failure
- NÃO commite automaticamente (só gere o commit_msg)
- NÃO pushe
- Respeite as skills do platform: `dev` (step 10), `systematic-debugging` (se precisar redebug), `change-impact` (step 16), `security-guardrails` (step 17 primary), `security` (step 17 fallback — design-time OWASP checklist), `atomic-locks` (step 22 PRD Progress append)

OUTPUT OBRIGATÓRIO (formato JSON, no fim da resposta):

{
  "status": "success" | "terminal_failure",
  "branch": "<nome da branch do worktree>",
  "worktree_path": "<path absoluto do worktree>",
  "commit_msg": "<mensagem proposta>",
  "modified_files": ["<paths relativos>"],
  "verdict": "approved" | "needs_revision" | "blocked",
  "step_events": [
    {"step": 9, "file": "...", "duration_ms": N, "status": "ok"},
    ...
  ],
  "failure": null | {"step": N, "reason": "...", "stderr_excerpt": "..."}
}
```

Capture o resultado estruturado do agent.

---

## FASE 8 — finalize (main thread, haiku ou determinístico, ~10s)

### step 22 — emit_final_telemetry + exit_message

**Model: haiku** (msg formatting trivial) ou deterministic (template strings).

**Naming conventions (D30 — propaga prd_ref dos outputs):**
- Branch: `claude-fix-<prd_id>-<task_slug>-<ts>` se ref detectado; senão `claude-fix-<ts>`
- Commit msg: append `(<prd_id>/<task_slug>)` ao final se ref; ex: `fix(cart): prevent modal close on backdrop click (PRD-040/ui-fixes)`
- PRD Progress append: se `prd_id != null`, append em `knowledge/prds/<PRD-NNN>-*.md` seção `## Progress` (criar se não existe): `- YYYY-MM-DD /fix <commit_msg.summary> — commit <hash>` (limitar a 1 linha; detailed log fica no session journal)
- Telemetria MC: incluir `{prd_id, task_slug}` no `trackRun` payload

Se success:
- Emita telemetria via `@wingx-app/platform` `McTelemetry.trackRun({command: 'fix', status: 'success', duration_ms, step_events, branch, prd_id, task_slug, ...})` fire-forget
- Se `prd_id != null`, append Progress no PRD (1 linha, via Edit) **envelopado em `withLock`** da skill `atomic-locks` pra evitar race com outros `/fix` concorrentes no mesmo PRD:
  ```
  await withLock(`.wingx/locks/${prd_id}.lock`, () => { /* Edit append */ }, { ttlMs: 10_000 });
  ```
  **Fallback rc.3/rc.4:** se `require('@wingx-app/platform').withLock` não existe, append direto (race aceita como known-issue pre-rc.5).
- Delete `.wingx/fix-spec-<ts>.md` do consumer dir
- Imprima exit message de sucesso (formato abaixo)

Se terminal_failure:
- Escreva incident report em `knowledge/incidents/fix-<ts>.md` (D25 postmortem) com:
  ```markdown
  # Fix incident — <ts>
  ## Contexto
  Command: /fix
  Arguments: <$ARGUMENTS>
  Intent: <fix|bug>
  Failed step: <N>
  Reason: <result.failure.reason>
  ## Stderr
  <result.failure.stderr_excerpt>
  ## Last output
  <último step_events útil>
  ## Suggestion
  <1-3 linhas de diagnóstico automático — pattern-match comum: tests falhando → check spec acceptance; lint fail → check lint config; syntax fail → spec subestimou escopo>
  ```
- Emita telemetria `status: 'terminal_failure'`
- **Não** delete `.wingx/fix-spec-<ts>.md` (dev pode querer inspecionar)
- Imprima exit message de falha

---

## Exit states

### Sucesso

```
✓ /fix completado em <duração total>.
  Branch:   <result.branch>
  Worktree: <result.worktree_path>
  Files:    <count> modificados
  Commit sugerido: "<result.commit_msg>"
  Verdict:  <result.verdict>

Main intocado. Pra mergear:
  cd <consumer_repo>
  git merge <result.branch>
  git worktree remove <result.worktree_path>
  git branch -d <result.branch>

Pra descartar:
  git worktree remove --force <result.worktree_path>
  git branch -D <result.branch>
```

### Falha terminal

```
✗ /fix falhou no step <result.failure.step>.
  Motivo: <result.failure.reason>
  Stderr: <trecho>

Incident: knowledge/incidents/fix-<ts>.md
Worktree preservado pra inspeção: <result.worktree_path>
Spec preservada: .wingx/fix-spec-<ts>.md
Main intocado.

Inspecionar:
  cd <result.worktree_path>
  cat <path do stderr.txt do step>

Descartar tudo:
  git worktree remove --force <result.worktree_path>
  git branch -D <result.branch>
  rm .wingx/fix-spec-<ts>.md
```

### Cancelamento no gate 8.5

```
✖ /fix cancelado pelo user no gate de aprovação.
  Nenhum arquivo modificado. Spec deletada.
```

---

## Gotchas conhecidos

- **Windows ExFAT** — worktree falha em drives ExFAT (atime). Runtime retorna erro graceful; reporte ao user e sugira rodar fora do drive externo.
- **node_modules grande** — worktree duplica checkout (~500MB pra Paraguai-size). Se disk < 2GB livres, abortar no step 8.6 antes de criar.
- **Schema drift spec vs execute** — se agent no worktree alterar escopo (files novos não previstos no spec), `emit_review_summary` deve flagrar como `needs_revision` e pedir re-run do /fix (não aplicar além do spec).
- **security-guardrails ausente (rc.3/rc.4)** — step 17 cai em trufflehog-only (soft-skip se esse também ausente). Bump pra rc.5+ adiciona scanText como primary.
- **trufflehog ausente** — complementar ao security-guardrails (primary). Soft-skip com warning, não bloqueia.
- **Linter language-specific** — step 11 detecta toolchain. Se não detectar (ex: consumer é Ruby sem linter configurado), skip com warning, não bloqueia.
- **Testes que tocam rede** — step 14 pode ser lento. Respeitar timeout do consumer (vitest.config, jest.config); não forçar.

---

## Referências

- PRD-035 §Appendix L1495-1530 — step catalog original
- PRD-035 §9 D24-D28 — decisões lockadas desta implementação
- `skills/_rules/SKILL.md` — R1-R10
- `skills/systematic-debugging/SKILL.md` — discovery opus
- `skills/dev/SKILL.md` — propose_diff patterns
- `skills/change-impact/SKILL.md` — step 16 hook
- `skills/security/SKILL.md` — step 17 design-time fallback (OWASP checklist)
- `skills/security-guardrails/SKILL.md` — step 17 runtime primary (rc.5+)
- `skills/atomic-locks/SKILL.md` — step 22 PRD Progress append concurrency
- `hooks/pre-commit/change-impact-check.cjs` — implementação do step 16
- `hooks/user-prompt-submit/pii-scrubber.cjs` — gate upstream (pre-step-catalog)
