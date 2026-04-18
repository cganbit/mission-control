---
name: task
description: Pipeline skill-driven pra implementar feature ou mudança de escopo médio/grande (25 steps). Superset do /fix com product_owner_briefing + critique/refine loop + PRD linking. Tiered (opus plan+critique + sonnet execute + haiku finalize) + Agent worktree isolation.
argument-hint: "<descrição da feature, mudança, ou refactor>"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent
---

# /task — Skill-driven task pipeline

Você está executando o command `/task` do `@wingx-app/platform`.

**Input:** `$ARGUMENTS` = descrição da feature/mudança/refactor.

**Objetivo:** implementar mudança de escopo médio/grande com planning rigoroso (critique/refine loop), briefing de product owner, e link com PRD se aplicável. Branch isolada via worktree. Wall-clock 5-7min.

**Diferença vs /fix:**
- /fix é pra correção minimal com causa conhecida (ou bug c/ systematic-debugging inline)
- /task é pra feature/refactor/mudança com planning expandido. Usa agent `product-owner` pra acceptance + `code-reviewer` pra critique antes de executar
- /task linka com PRDs no session log e atualiza status do PRD se aplicável

Se o escopo é < 500 LOC e 1-2 files, prefira `/fix`. Se vira pesquisa em aberto, prefira `/spike`.

---

## Arquitetura (PRD §Appendix L1548-1579 + §9 D26+D27)

| Fase | Steps | Ambiente | Model | Observações |
|---|---|---|---|---|
| 1 | 1-5 | main thread | sonnet | understand + context loading (PRDs, similar code, domain) |
| 2 | 6 | main thread | agent product-owner | briefing (priority + acceptance) |
| 3 | 7-11 | main thread | **opus** | plan + critique + refine + validate + budget |
| 3.5 | 11.5 | main thread | — | approval gate |
| 4-7 | 12-22 | **Agent isolation=worktree** | sonnet | execute + verify + review + finalize interno |
| 8 | 23-25 | main thread | haiku/det | PRD update + session log + telemetry |

---

## FASE 1 — understand (main thread, sonnet, ~40s PARALELO com 1.5 det)

### step 1 — load_memory_gates
Invoque skill `_rules`. Ler `knowledge/` relevante. Deterministic.

### step 1.5 — resolve_prd_reference (D29 + D30)
Determinístico, ~200ms. Detecta ref a PRD no início de `$ARGUMENTS`:

```
regex: /^(PRD-\d+)(?:\/([a-z0-9-]+))?\s+(.+)$/i
  match → { prd_id, task_slug (opt), task_description }
  no match → { prd_id: null, task_description: $ARGUMENTS }

if prd_id:
  - read knowledge/prds/<PRD-NNN>-*.md (glob match)
  - if task_slug: locate section por heading kebab-case ou frontmatter <!-- id: <slug> -->
  - extract: prd_section_text, acceptance_from_prd (se seção declara), depends_on (se declara)
```

Output:

```yaml
prd_id: "PRD-035 | null"
task_slug: "w3-item3 | null"
task_description: "<resto dos args>"
prd_section_text: "<conteúdo da seção matching>"
acceptance_from_prd: [...]  # pre-populará step 6
prd_depends_on: ["w3-item2"]  # se declarado no slug
```

**Substitui o antigo step 3 search_prds (LLM 15s).** Determinístico: user já sabe qual PRD é, mencionou explícito. Autocontida se não mencionou.

### step 2 — parse_task_intent
Analise `task_description` (output de 1.5):

```yaml
feature_brief: "summary em 1-2 frases"
scope: small | medium | large
intent_type: feature | refactor | infra | docs | perf
signals: [user_story, acceptance_hints, constraint_hints]
```

**Early abort:** se scope=small e intent_type=feature simples, recomende `/fix` em vez de /task (overhead do planning não vale).

### step 4 — search_similar_code (PARALELO com 5; 1.5 já rodou antes)
Grep + Glob por padrões similares no consumer codebase. Output:

```yaml
patterns:
  - name: "similar_feature_X"
    files: ["src/features/x.ts"]
    approach: "descrição do padrão existente"
    reuse_potential: high | medium | low
```

### step 5 — load_domain_context (PARALELO com 4)
Read de `knowledge/domains/` relevantes (se consumer tem taxonomia domain-driven). Carrega conceitos, constraints, vocabulário do domínio.

> **Nota numeração:** o antigo step 3 `search_prds` (LLM 15s) foi substituído pelo step 1.5 `resolve_prd_reference` (determinístico ~200ms). Step 3 não existe mais nesta numeração — 1.5 cobre o caso e é zero-LLM. Ver PRD §9 D29.

---

## FASE 2 — product owner briefing (main thread, agent product-owner, ~30s)

### step 6 — product_owner_briefing
**Invoque o Agent tool** com `subagent_type: "product-owner"` (agent está em `wingx-platform/agents/product-owner.md`, portado Week 2).

Prompt do agent:

```
Você está fazendo briefing de product owner pro /task.

Feature brief: <step 2 feature_brief>
PRD linked: <step 1.5 prd_id | null>
PRD section (se linked): <step 1.5 prd_section_text>
Acceptance pre-declarada no PRD: <step 1.5 acceptance_from_prd>
Depends on: <step 1.5 prd_depends_on>
Similar code patterns: <step 4 patterns>
Domain context: <step 5>

Tarefas:
1. Priorize o feature (impact vs effort)
2. Se acceptance_from_prd existe, VALIDE — nunca re-invente. Adicione apenas critérios faltantes.
3. Se acceptance_from_prd não existe (autocontida), proponha acceptance criteria
4. Sinalize riscos de escopo (feature creep, deps externos)
5. Se prd_id existe, valide alinhamento do feature_brief com prd_section_text
6. Se prd_depends_on tem items não-done, flag como blocker

Output:
{
  priority: P0 | P1 | P2 | P3,
  acceptance: ["critério 1", "critério 2", ...],
  scope_risks: ["..."],
  prd_alignment: aligned | drift | no_prd,
  recommendation: proceed | defer | split
}
```

Se `recommendation: defer` → aborte /task com razão.
Se `recommendation: split` → aborte /task sugerindo 2 `/task` separadas.

---

## FASE 3 — plan + critique + refine (main thread, OPUS, ~85s)

### step 7 — draft_task_plan
**Model: opus.**

Gere plan inicial estruturado:

```yaml
plan_md: |
  # Task plan — <slug>
  ## Goal
  <step 2 feature_brief>
  ## Acceptance
  <step 6 acceptance>
  ## Phases
  ### Phase 1: <name>
    - Files: [...]
    - Changes: [...]
    - Tests: [...]
  ### Phase 2: ...
  ## Risks
  <step 6 scope_risks + novos identificados>
  ## Out of scope
  [...]
phases:
  - id: 1
    files_to_edit: [...]
    new_files: [...]
    estimated_loc: N
  - id: 2
    ...
files_total: [...]
risk: low | medium | high
```

### step 8 — critique_plan
**Invoque Agent** com `subagent_type: "code-reviewer"` pra fazer critique do plan_md (sem código ainda, só review estrutural):

```
Critique este plan. Procure:
- Gaps: algo foi esquecido? (migração, teste, rollback)
- Assumptions não validadas
- Riscos subestimados
- Overlap com código existente não mencionado
- Acceptance criteria não cobertos pelo plan

Output:
{
  gaps: ["..."],
  risks: ["..."],
  assumptions_to_validate: ["..."],
  overall_verdict: approved | needs_refinement | reject,
  suggestions: ["..."]
}
```

Se `overall_verdict: reject` → aborte sugerindo /spike primeiro pra reduzir incertezas.

### step 9 — refine_plan
**Model: opus.**

Com gaps + suggestions do critique, gere plan_v2:

```yaml
plan_md_v2: |
  <plan atualizado endereçando cada gap>
changelog:
  - "Adicionada phase N pra cobrir <gap>"
  - "Ajustado escopo X pra evitar <risk>"
```

Se critique retornou `needs_refinement` mas os refinements tornam o escopo > 2× original, aborte sugerindo /task split.

### step 10 — validate_plan_schema
Determinístico. Schema: `{plan_md, phases[], acceptance[], files_total[], risk}`. Falha → abort.

### step 11 — estimate_token_budget
Determinístico. LOC estimado × 5 (read + diff + apply + test + review). Se > 80k, warning (considerar split em 2 tasks). Se > 150k, abort.

---

## FASE 3.5 — approval gate (main thread)

### step 11.5 — write_plan_artifact + confirm
Escreva em `.wingx/task-plan-<ts>.md` no consumer dir (único arquivo tocado no main dir).

Modo interativo: mostre plan_v2 + acceptance + priority + scope_risks ao user. Peça "apply? (y/n)".

Modo auto (`--auto` em $ARGUMENTS): schema OK + budget OK + priority ≥ P2 → continua; caso contrário aborta.

Se user cancelar, delete `.wingx/task-plan-<ts>.md` e exit clean.

---

## FASE 4-7 — execute + verify + review + finalize (Agent isolation=worktree)

### step 11.6 — dispatch_worktree_agent

Invoque `Agent` tool com `isolation: "worktree"` passando plan + acceptance + files.

Prompt do subagent (template):

```
Você está executando as fases de execução + verify + review + finalize do /task
num worktree isolado do repo <consumer>.

PLAN (v2):
<conteúdo de .wingx/task-plan-<ts>.md>

PHASES:
<step 9 phases[]>

ACCEPTANCE:
<step 6 acceptance>

REPO_ROOT: <cwd do worktree>

ORDEM DE TRABALHO (14 steps: 12-25 do catalog):

FASE EXECUTE (por phase, por file — paralelo se sem shared imports e <=5 files/phase):
  - step 12 read_target_file — Read do file (novo ou existente)
  - step 13 propose_diff — gere diff conforme plan (sonnet)
  - step 14 validate_diff_syntax — typecheck/lint NO DIFF. Detecta toolchain consumer.
  - step 15 apply_diff — Edit
  - step 16 run_scoped_tests — tests que importam esse file

Entre phases: se phase N falha 2× retry, skip remaining phases e report terminal.

FASE VERIFY (PARALELO, 4 steps):
  - step 17 run_full_tests — suite completa
  - step 18 static_analysis — linter repo-wide
  - step 19 change_impact_check — hook `hooks/pre-commit/change-impact-check.cjs`
  - step 20 security_scan — trufflehog soft-skip

FASE REVIEW:
  - step 21 self_review (sonnet) — lê diffs + acceptance + plan, confere cobertura
  - step 22 emit_review_summary — markdown com verdict + suggestions + acceptance_coverage

FASE FINALIZE (dentro do worktree):
  - step 23 generate_commit_msg — conventional commit: `<type>(<scope>): <summary>`
    - type = feat | refactor | perf | chore (derivado de step 2 intent_type)

REGRAS:
- Retry per step com backoff 2× (max 2)
- Steps 14 ou 16/17 falham após retries → terminal failure, report
- Por phase: se phase completa com test green, avance pra próxima
- Acceptance check no step 21: mapear cada criteria a evidence no code/test
- NÃO commite automaticamente (só gere commit_msg)
- NÃO pushe

OUTPUT OBRIGATÓRIO (JSON no fim):

{
  "status": "success" | "terminal_failure" | "partial",
  "branch": "<nome branch>",
  "worktree_path": "<path>",
  "commit_msg": "<msg>",
  "modified_files": [...],
  "new_files": [...],
  "phases_completed": [1, 2, 3],
  "phases_skipped": [],
  "acceptance_coverage": [
    {"criterion": "...", "covered": true, "evidence": "src/x.ts:42 / tests/x.test.ts"}
  ],
  "verdict": "approved" | "needs_revision" | "blocked",
  "step_events": [...],
  "failure": null | {"step": N, "phase": N, "reason": "...", "stderr_excerpt": "..."}
}
```

Capture resultado estruturado.

---

## FASE 8 — finalize externa (main thread)

### step 23 — update_prd_status
Se `step 1.5.prd_id != null`, atualize seção Progress do PRD (não o status global sem approval).

**Target section (D30):**
- Se `task_slug` existe: localize seção por slug e append Progress DENTRO da seção
- Se `task_slug == null`: append em seção `## Progress` global do PRD (cria se não existe)

Formato:

```markdown
[append]
- YYYY-MM-DD /task <commit_msg.summary> — phases: N/M, coverage: X% — commit <hash> — branch <branch>
```

Se `prd_id == null`, skip.

**Model:** sonnet (edit cuidadoso do PRD) ou determinístico com template string + Edit tool.

### step 24 — update_session_log
Append em `knowledge/sessions/<date>.md`:

```markdown
### [ts] /task — <feature_brief>
- command: /task
- prd: <matching_prd | —>
- branch: <branch>
- phases: N/M
- acceptance_coverage: X%
- duration: Ys
- worktree: <path>
```

### step 25 — emit_final_telemetry

**Model: haiku ou determinístico.**

**Naming conventions (D30 — propaga prd_ref):**
- Branch: `claude-task-<prd_id>-<task_slug>-<ts>` se ref; senão `claude-task-<ts>`
- Commit msg: `<type>(<scope>): <summary> (<prd_id>/<task_slug>)` se ref; type derivado de intent_type (feat|refactor|perf|chore)
- Telemetria MC: inclui `{prd_id, task_slug}`

Success:
- `McTelemetry.trackRun({command: 'task', status: 'success', duration_ms, step_events, branch, acceptance_coverage, prd_id, task_slug})` fire-forget
- Delete `.wingx/task-plan-<ts>.md`
- Imprima exit message

Terminal failure:
- Escreva `knowledge/incidents/task-<ts>.md` (D25 postmortem com {step, phase, reason, stderr_excerpt, last_output, suggestion})
- Emit telemetry `status: 'terminal_failure'`
- Preserve `.wingx/task-plan-<ts>.md`
- Imprima exit message de falha

Partial (algumas phases sucesso, outras falharam):
- Emit telemetry `status: 'partial', phases_completed: [...]`
- Preserve worktree + plan artifact
- Imprima exit message com instruções de resume manual

---

## Exit states

### Sucesso

```
✓ /task completado em <duração>.
  Branch:   <result.branch>
  Worktree: <result.worktree_path>
  Phases:   <result.phases_completed.length>/<plan phases total>
  Acceptance coverage: <result.acceptance_coverage cada true / total>%
  Commit sugerido: "<result.commit_msg>"
  PRD: <matching_prd | —>

Main intocado. Pra mergear:
  cd <consumer_repo>
  git merge <result.branch>
  git worktree remove <result.worktree_path>
  git branch -d <result.branch>
```

### Partial

```
⚠ /task parcialmente completo em <duração>.
  Phases done: <result.phases_completed>
  Phases skipped: <result.phases_skipped>
  Motivo: <first skipped reason>

Worktree preservado: <result.worktree_path>
Você pode:
  - Mergear as phases done: git merge <branch>
  - Inspecionar + completar manualmente as phases skipped
  - Descartar tudo: git worktree remove --force <path>
```

### Falha terminal

```
✗ /task falhou no step <N> da phase <P>.
  Motivo: <result.failure.reason>

Incident: knowledge/incidents/task-<ts>.md
Worktree preservado: <result.worktree_path>
Plan preservado: .wingx/task-plan-<ts>.md
Main intocado.
```

### Abort no step 6 (PO defer/split)

```
✖ /task abortado pelo product-owner agent.
  Recomendação: <defer | split>
  Razão: <step 6 reason>
```

### Abort no step 8 (reviewer reject)

```
✖ /task abortado no critique do plan.
  Recomendação: rodar /spike primeiro pra <questão aberta>
  Gaps críticos: <step 8 gaps top 3>
```

---

## Regras (anti-patterns)

- **NÃO pular critique/refine.** Mesmo em task small, o critique detecta gaps cheap (<30s). Se quer bypass, use /fix.
- **NÃO editar PRD fora da seção Progress.** Update de status global exige approval explícito (vira outro /task ou ADR).
- **NÃO aceitar plan com overall_verdict=reject do reviewer.** Se rejeita, /spike primeiro.
- **NÃO aplicar phase N+1 se phase N falhou** (exceto se phases são declaradas independentes no plan).
- **NÃO auto-approve se priority=P0 e risk=high.** User sempre confirma esses casos no gate 11.5.

---

## Gotchas

- **PRD linking via grep** — busca no step 3 pode matchar false positives (PRD mencionado mas não relacionado). O agent product-owner no step 6 valida alinhamento.
- **phases[] sem deps declarados** — se phase 2 precisa de phase 1, declarar explícito em `phases[i].depends_on`. Senão o worktree agent pode paralelizar e quebrar.
- **acceptance_coverage sem evidence** — step 21 deve apontar line/file pra cada criterion. Se não conseguir, marca `covered: false` — nunca inventa evidence.
- **commit_msg type derivation** — intent_type `refactor` → `refactor(scope):`, `feature` → `feat(scope):`, `perf` → `perf(scope):`, outros → `chore(scope):`.

---

## Referências

- PRD-035 §Appendix L1548-1579 — catálogo /task completo
- PRD-035 §9 D24-D28 — decisões da implementação
- `agents/product-owner.md` — step 6
- `agents/code-reviewer.md` — step 8 + step 21 (invocado dentro do worktree agent)
- `skills/_rules/SKILL.md` — step 1
- `commands/fix.md` — sibling command (escopo menor)
- `commands/spike.md` — sugerido se critique rejeita plan
