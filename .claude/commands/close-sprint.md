---
name: close-sprint
description: Pipeline skill-driven pra fechar sprint atual. 16 steps consolidando 5 sub-agents (rules-auditor, retro-learner, doc-updater, report-builder, git-closer). Roda IN-PLACE (não em worktree) porque atualiza docs/BACKLOG do próprio repo. Human approval gate no step 8 antes de aplicar lessons.
argument-hint: "[optional: sprint_number ou 'current']"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent
---

# /close-sprint — Skill-driven sprint closure pipeline

Você está executando o command `/close-sprint` do `@wingx-app/platform`.

**Input:** `$ARGUMENTS` = opcional. Se vazio ou "current", usa sprint atual (detectado via sentinel/state). Se número, fecha sprint específica.

**Objetivo:** validar compliance, extrair lessons, atualizar docs canônicos, gerar sprint report, finalizar git. Wall-clock 3-5min.

**Diferença vs /fix e /task:** close-sprint **não usa worktree** — atualiza docs do próprio repo (BACKLOG, sprint-NN.md, CLAUDE.md, etc.) e commita in-place. Rodar só em repo limpo (no working tree diff exceto docs).

---

## Arquitetura (PRD §Appendix L1580-1609 + §9 D26+D27)

| Fase | Steps | Model | Observações |
|---|---|---|---|
| pre-flight | 1-3 | determinístico | sprint state + changes + scope validation |
| metrics | 4 | determinístico | gather commits/LOC/tests/bugs |
| audit + learn | 5-7 | agents (rules-auditor + retro-learner) | compliance + lessons + routing |
| **human gate** | 8 | — | apply lessons approval |
| docs + report | 9-11 | agents (doc-updater + report-builder) | update docs + sprint report |
| finalize | 12-16 | agent git-closer + determinístico | git + telemetry + cleanup |

**Não usa worktree** porque muda docs/BACKLOG/CLAUDE.md do próprio repo — merge in-place é o fluxo natural de sprint closure.

---

## Dependências do consumer

/close-sprint assume que o consumer tem **5 agents locais** em `<consumer>/.claude/agents/`:
- `rules-auditor` — compliance gate
- `retro-learner` — extração de lessons
- `doc-updater` — atualização de docs canônicos
- `report-builder` — sprint report
- `git-closer` — finalização git

Esses agents **não estão na platform** (D17 — ficaram fora do escopo dos 10 platform agents; Paraguai mantém os locais).

Se consumer não tem esses agents:
- Platform oferece **fallback graceful**: invoca skills genéricas (`_rules`, `change-impact`) + delega a instrução direta do Claude (sem subagent)
- Documente no sprint_report que esses steps rodaram em fallback mode
- Sugere ao consumer: "Crie agents locais em `.claude/agents/` pra maior qualidade"

---

## FASE PRE-FLIGHT (main thread, determinístico, ~15s)

### step 1 — verify_sprint_branch_state
Determinístico. Checks:
- `git status --short` — working tree limpo exceto docs esperados (BACKLOG, sprint-NN.md, CLAUDE.md)?
- Branch atual é branch de sprint (nome tipo `sprint-NN`, `main`, `develop`)?

Se working tree sujo com files fora da lista de docs, aborte com "commit ou stash antes".

### step 2 — load_sprint_changes
Determinístico. Detecta range de commits da sprint:
- Busca tag `sprint-NN-start` no git (se consumer usa tag convention)
- Ou busca primeiro commit do range via `git log --since='<sprint_start_date>'`
- Ou via sentinel `<consumer>/.sprint-start` (Paraguai-legacy)

```bash
git log <sprint_start>..HEAD --oneline
```

Output: `{commits[], files_changed[], range: "<start_hash>..HEAD"}`.

### step 3 — validate_sprint_scope
Determinístico. Verificar que os commits estão dentro do escopo declarado da sprint (se consumer tem `knowledge/sprints/sprint-NN.md` com scope declarado). Flag commits fora do scope como warning — não bloqueia, só sinaliza no sprint report.

---

## FASE METRICS (main thread, determinístico, ~10s)

### step 4 — gather_metrics
Determinístico via git + filesystem:

```yaml
commits: N
authors: [...]
loc_added: N
loc_removed: N
files_touched: N
tests_added: N     # grep por `test(` / `it(` / `describe(` em diff
tests_removed: N
migrations: N      # grep em migrations/
new_files: [...]
deleted_files: [...]
```

**PRD grouping (D30):** extraia ref de cada commit msg via regex:

```
regex: /\((PRD-\d+)(?:\/([a-z0-9-]+))?\)/
  ├─ match → agrupa commit sob {prd_id, task_slug}
  └─ no match → grupo "autocontained"
```

Output additional:

```yaml
tasks_by_prd:
  PRD-035:
    - {task_slug: "w3-item2", commits: ["b109b7d", "a1b0743", "af1bb1e", "9e22149"]}
    - {task_slug: "w3-item3", commits: [...]}
  PRD-031:
    - {task_slug: "phase-4", commits: [...]}
  autocontained:
    - {commits: ["abc123"]}
```

Use git log + diff stat + regex. Não chamar LLM aqui.

---

## FASE AUDIT + LEARN (main thread, agents, ~80s)

### step 5 — rules_audit
**Invoque Agent** com `subagent_type: "rules-auditor"` (agent local do consumer):

```
Audite a sprint <NN> contra:
- R1-R10 (skill _rules)
- PRDs linkados
- knowledge/decisions/
- CLAUDE.md convenções

Range: <step 2 range>
Files changed: <step 2 files_changed>

Output:
{
  compliance_passed: true | false,
  violations: [
    {rule: "R4", file: "...", description: "..."}
  ],
  warnings: [...],
  overall_verdict: pass | pass_with_warnings | fail
}
```

Se agent não existe localmente, fallback: rodar grep por patterns de violação conhecidos (`console.log` esquecido em prod code, `TODO` sem ticket, imports relativos quebrados, etc.) — reportar como `compliance_passed: unknown_fallback`.

**BLOQUEANTE:** se `compliance_passed: false`, aborta close-sprint com lista de violations. User corrige e re-roda.

### step 6 — retro_learn
**Invoque Agent** com `subagent_type: "retro-learner"`:

```
Extraia lessons da sprint <NN>.
Commits: <step 2 commits>
Files: <step 2 files_changed>
Metrics: <step 4>
Sprint journal: <read de knowledge/sprints/sprint-NN.md ou docs/sprints/>

Categorize:
{
  lessons: [
    {
      category: gotcha | pattern | anti_pattern | tool_gap | skill_gap,
      description: "...",
      criticality: info | yellow | red,
      target_layer: memory | hook | test | doc | skill,
      source_evidence: "commit hash or file line"
    }
  ]
}
```

Fallback se agent ausente: Claude direto extrai do journal + commits (qualidade menor mas funcional).

### step 7 — route_lessons
Main thread (sonnet ou determinístico):

Agrupar lessons de step 6 por `target_layer`:

```yaml
by_layer:
  memory: [lesson_a, lesson_b]    # vão pra knowledge/memory/
  hook: [lesson_c]                 # vão pra hooks novos ou updates
  test: [lesson_d, lesson_e]       # casos de teste faltando
  doc: [lesson_f]                  # knowledge/concepts/ ou BACKLOG
  skill: [lesson_g]                # skill nova ou update
```

---

## FASE HUMAN GATE (main thread)

### step 8 — apply_lessons_prompt
Determinístico. **Gate de approval humano.**

Escreva `.wingx/sprint-NN-lessons.md` com:
- Todas lessons categorizadas
- Ação proposta por lesson (onde vai ser aplicada)

Mostre ao user o arquivo + peça:
```
Approval options:
  a) Apply all (todas lessons serão aplicadas em step 9)
  b) Apply only (selecionar subset)
  c) Defer (só registrar no report, não aplicar)
  d) Skip (não gravar lessons, só fechar sprint)
```

Se user cancelar totalmente (`skip`) → continue mas com `lessons_applied: 0`.

Preserve `.wingx/sprint-NN-lessons.md` até o fim (user pode querer re-aplicar depois).

---

## FASE DOCS + REPORT (main thread, agents, ~65s)

### step 9 — update_docs
**Invoque Agent** com `subagent_type: "doc-updater"`:

```
Atualize docs canônicos da sprint <NN>.

Inputs:
- commits: <step 2>
- metrics: <step 4>
- lessons to apply: <step 8 approved lessons>
- compliance_report: <step 5>

Docs a atualizar (adapte ao consumer):
- BACKLOG.md — marcar sprint items done, mover pendings
- knowledge/sprints/sprint-NN.md — session changes, completions
- CLAUDE.md — se convenções mudaram
- knowledge/concepts/*.md — se lessons geram novos conceitos
- docs/log.md — append sprint entry

Output:
{
  files_updated: [{path, change_summary}],
  files_created: [...],
  lessons_applied: N
}
```

Fallback se agent ausente: Claude direto aplica lessons target_layer=doc nos files correspondentes.

### step 10 — verify_change_impact
Hook determinístico. Rode `hooks/pre-commit/change-impact-check.cjs` contra os files atualizados no step 9:

```yaml
coherence_ok: true | false
violations: [...]   # ex: CLAUDE.md mudou mas AGENTS.md não mudou
```

Se violations, Claude adiciona fixes e re-roda até coherence_ok OU sinaliza no report que violations ficaram pendentes.

### step 11 — build_report
**Invoque Agent** com `subagent_type: "report-builder"`:

```
Gere sprint report comprehensivo.

Inputs:
- metrics: <step 4>
- compliance: <step 5>
- lessons: <step 6 + 7>
- lessons_applied: <step 9>
- docs_updated: <step 9>
- change_impact: <step 10>

Output: knowledge/sprints/sprint-NN-report.md com seções:
  # Sprint NN — Report
  ## Summary
  ## Metrics (tabela)
  ## Tasks by PRD  ← D30: agrupa via step 4 tasks_by_prd
    ### PRD-035 (<titulo ler do PRD file>)
      - w3-item2 — 4 commits (b109b7d..9e22149) — done
      - w3-item3 — iniciada, pending
    ### PRD-031 (<titulo>)
      - phase-4 — 1 commit (abc123) — done
    ### Autocontained
      - 2 commits sem ref
  ## Compliance
  ## Lessons learned
  ## Docs updated
  ## Next sprint recommendations
```

Fallback se agent ausente: Claude direto gera report usando template fixo.

---

## FASE FINALIZE (main thread)

### step 12 — emit_sprint_metrics_mc
Determinístico. `McTelemetry.trackSprintClose({sprint_nn, metrics, compliance, lessons_count, duration_ms})` fire-forget.

### step 13 — finalize_git
**Invoque Agent** com `subagent_type: "git-closer"` (ou deterministic fallback):

```
Finalize git pra sprint <NN>.

Tarefas:
1. git add — docs atualizados (BACKLOG, sprint-NN*.md, CLAUDE.md, etc.)
2. git commit — msg: "chore(sprint-NN): close sprint — N commits, X% compliance"
3. Tag: git tag sprint-NN-end (se consumer usa tag convention)
4. Run CI check se aplicável: gh run list --limit 1 (detectar se último push disparou CI)

NÃO FAZER:
- git push (requer approval explícito do user)
- merge de branches (não é papel do close-sprint)

Output:
{
  commit_hash: "...",
  tag_created: "sprint-NN-end | null",
  ci_status: "pending | passing | failing | not_applicable"
}
```

Fallback se agent ausente: Claude direto faz `git add <files>` + `git commit`. Sem tag. Sem push.

### step 14 — update_session_log
Determinístico. Append em `knowledge/sessions/<date>.md`:

```markdown
### [ts] /close-sprint — Sprint NN closed
- commits: N
- loc: +A -R
- compliance: <verdict>
- lessons: N (M applied)
- commit: <hash>
- duration: Xs
```

### step 15 — clear_sprint_sentinels
Determinístico. Remove:
- `.wingx/sprint-NN-lessons.md` (já arquivado no sprint-NN-report.md)
- `.sprint-active-command` (legacy Paraguai sentinel)
- `.sprint-step-*` (legacy)
- Qualquer outro artifact efêmero da sprint

### step 16 — emit_telemetry
Final fire-forget com status overall:

```
McTelemetry.trackRun({
  command: 'close-sprint',
  status: 'success' | 'partial' | 'terminal_failure',
  duration_ms,
  step_events,
  sprint_nn,
  compliance_passed,
  lessons_applied,
  commit_hash
})
```

---

## Exit states

### Sucesso

```
✓ /close-sprint NN completado em <duração>.
  Compliance:       <pass | pass_with_warnings>
  Commits:          N (range: <range>)
  LOC:              +<added> -<removed>
  Tests:            +<added>
  Lessons:          <total> (<applied> aplicadas, <deferred> adiadas)
  Docs updated:     <N files>
  Sprint report:    knowledge/sprints/sprint-NN-report.md
  Commit hash:      <hash>
  CI status:        <status>

Para push:
  git push origin <branch> --tags
```

### Compliance fail (step 5 bloqueante)

```
✗ /close-sprint bloqueado pelo rules-auditor.
  Violations:
    - R<N>: <descrição>
    - R<N>: <descrição>

Corrija violations e re-rode /close-sprint.
Nenhum arquivo alterado. Estado preservado.
```

### User skip lessons (step 8)

```
⚠ /close-sprint completado com lessons SKIPPED pelo user.
  Lessons foram registradas no report mas não aplicadas aos docs.
  .wingx/sprint-NN-lessons.md preservado caso queira aplicar depois.
```

### Falha terminal

```
✗ /close-sprint falhou no step <N>.
  Motivo: <razão>

Incident: knowledge/incidents/close-sprint-<ts>.md
Estado parcial preservado:
  - Docs atualizados até step 9: <list>
  - Lessons artifact: .wingx/sprint-NN-lessons.md
  - Nenhum commit feito

Pra continuar manualmente:
  <sugestões por step>
```

---

## Regras (anti-patterns)

- **NÃO pushar automaticamente.** git push requer approval explícito do user.
- **NÃO mergear branches.** close-sprint só fecha a sprint; merge é decisão separada.
- **NÃO bypass compliance.** Se step 5 retorna fail, aborta — correção primeiro.
- **NÃO aplicar lessons sem approval no step 8.** Human gate é parte do fluxo.
- **NÃO usar worktree.** close-sprint atualiza docs in-place. Worktree adicionaria merge overhead desnecessário.
- **NÃO editar status global de PRDs sem approval.** Update seção Progress, não lifecycle status.

---

## Gotchas

- **Sprint range detection** — consumer pode usar tag (`sprint-NN-start`), sentinel (`.sprint-start`), branch name (`sprint-NN`), ou date range. Platform tenta heuristics em ordem; se ambíguo, pede ao user no step 2.
- **Agents ausentes** — fallback mode degrada qualidade mas não quebra. Sprint report inclui nota "rodado em fallback mode — considere criar agents locais".
- **Working tree sujo** — step 1 bloqueia. Paraguai-legacy tem files gitignored (`.sprint-active-command`) que não contam como sujo; platform detecta via gitignore.
- **CI status check** — `gh run list` exige `gh` CLI instalado + authed. Soft-skip se ausente (ci_status: "not_applicable").
- **change-impact violations** — se step 10 detecta violation e não consegue auto-fixar, pode deixar close-sprint com warning em vez de aborting (configurable via sprint config).

---

## Referências

- PRD-035 §Appendix L1580-1609 — catálogo /close-sprint completo
- PRD-035 §9 D24-D28 — decisões da implementação
- `skills/_rules/SKILL.md` — step 5 compliance baseline
- `skills/change-impact/SKILL.md` — step 10
- `hooks/pre-commit/change-impact-check.cjs` — implementação step 10
- Agents locais do consumer (não platform): rules-auditor, retro-learner, doc-updater, report-builder, git-closer
- `commands/fix.md` + `commands/task.md` — commands que geram commits que esta sprint agrega
