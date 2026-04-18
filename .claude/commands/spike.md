---
name: spike
description: Pipeline skill-driven de pesquisa read-only. 13 steps (understand → plan → research paralelo → synthesize → decisions → followup → write doc). Não edita código-alvo — escreve apenas em `knowledge/spikes/`. Tiered (opus plan/synthesize + sonnet research + haiku finalize).
argument-hint: "<pergunta ou tópico de investigação>"
allowed-tools: Read, Grep, Glob, Write, Bash, WebFetch
---

# /spike — Skill-driven research pipeline (read-only)

Você está executando o command `/spike` do `@wingx-app/platform`.

**Input:** `$ARGUMENTS` = pergunta aberta, decisão em aberto, ou tópico a investigar.

**Objetivo:** pesquisar em profundidade (código + docs + web), sintetizar findings, propor decisões com rationale, sugerir follow-up tasks. Escrever spike doc em `knowledge/spikes/spike-NNN-<slug>.md`. **Não edita código-alvo.** Wall-clock 2-3min.

**Diferença vs /fix:** spike é **read-only**. Nunca cria worktree, nunca toca código de produção. Único write é o spike doc em `knowledge/spikes/`. Portanto roda 100% no main thread (sem Agent isolation).

---

## Arquitetura (PRD §Appendix L1530-1548 + §9 D27)

| Fase | Steps | Model | Observações |
|---|---|---|---|
| understand | 1-4 | sonnet | parse + plan leve + schema validate |
| research | 5-7 | sonnet | codebase + docs + web em paralelo |
| synthesize | 8-10 | **opus** | raciocínio — findings, decisões, follow-ups |
| write | 11-13 | haiku/determinístico | doc + session log + telemetry |

---

## FASE 1 — understand (main thread, sonnet, ~12s)

### step 1 — load_memory_gates
Invoque a skill `_rules`. Ler `knowledge/` relevante do consumer (skills, concepts, decisions anteriores). Deterministic.

### step 1.5 — resolve_prd_reference (D30)
Determinístico, ~200ms. Detecta ref a PRD no início de `$ARGUMENTS`:

```
regex: /^(PRD-\d+)(?:\/([a-z0-9-]+))?\s+(.+)$/i
  match → { prd_id, task_slug (opt), question_description }
  no match → { prd_id: null, question_description: $ARGUMENTS }

if prd_id:
  - read knowledge/prds/<PRD-NNN>-*.md
  - if task_slug: locate section (heading kebab-case ou frontmatter id)
  - extract open_questions (seção §Open questions ou similar se existir)
```

Output:

```yaml
prd_id: "PRD-035 | null"
task_slug: "w3-item3 | null"
question_description: "<resto dos args, sem o ref>"
prd_open_questions: [...]  # se PRD declara
```

Exemplos:
- `/spike PRD-040 Jira vs Linear` → spike linkado a PRD-040 (decisão pendente do PRD)
- `/spike estruturar daily-briefing-agent` → spike discovery, pode virar novo PRD

### step 2 — parse_spike_intent
Analise `question_description` (output de 1.5). Retorne:

```yaml
question: "string clara, 1 frase"
depth: quick | deep    # quick = <30min research; deep = pode usar web
category: architecture | library_choice | performance | security | integration | other
out_of_scope: ["itens que NÃO serão investigados"]
```

### step 3 — plan_research
**Model: sonnet.**

Gere research plan:

```yaml
research_steps:
  - id: codebase
    scope: "grep + file reads em src/ por pattern X"
    effort: low | medium | high
  - id: docs
    scope: "ler docs/ + README + ADRs relevantes"
  - id: web
    scope: "se depth=deep, buscar em sites Y/Z"
    effort: medium
estimated_duration_sec: 120
```

### step 4 — validate_plan
Determinístico. Schema: `{research_steps[], estimated_duration_sec}`. Se estimated > 600s, warning (considerar quebrar em múltiplos spikes).

---

## FASE 2 — research (main thread, sonnet, ~60s wall-clock PARALELO)

Execute os 3 steps em paralelo quando possível (invocar as ferramentas juntas na mesma resposta):

### step 5 — search_codebase
Grep + Glob + Read dos files relevantes ao tópico. Captura: padrões existentes, uso atual, interfaces, exemplos. Output:

```yaml
codebase_findings:
  - pattern: "..."
    occurrences: 12
    files: ["src/foo.ts:42", "src/bar.ts:88"]
    analysis: "..."
```

### step 6 — search_docs
Read de `docs/`, README, ADRs, PRDs anteriores relacionados. Output:

```yaml
docs_findings:
  - source: "docs/architecture.md"
    relevant_sections: [...]
    quotes: [...]
```

### step 7 — search_web (só se depth=deep)
WebFetch de sites oficiais relevantes (MDN, docs do framework, blog posts de maintainers). **NÃO fazer web search especulativo** — só URLs já identificadas em step 3. Soft-skip se depth=quick.

---

## FASE 3 — synthesize (main thread, OPUS, ~70s)

### step 8 — synthesize_findings
**Model: opus.**

Consolide outputs dos steps 5-7 em um findings_md estruturado:

```markdown
## Findings

### Current state
<o que já existe, com refs>

### Options considered
1. Option A — pros/cons
2. Option B — pros/cons
3. Option C — pros/cons

### Tradeoffs
<matriz ou narrativa>

### Evidence
<links, snippets, benchmarks citados>
```

### step 9 — propose_decisions
**Model: opus.**

Pra cada decisão em aberto, propor direção com rationale:

```yaml
decisions:
  - id: D-spike-NN-001
    question: "Usar lib X ou Y?"
    recommendation: "X"
    rationale: "compatível com Z, cobertura de testes maior, mantida mais ativamente"
    confidence: low | medium | high
    risks: ["breaking change em vN+1 se Y parar de ser suportado"]
```

### step 10 — propose_followup_tasks
**Model: opus.**

Se o spike revelou trabalho concreto, sugerir tasks pra BACKLOG:

```yaml
suggested_tasks:
  - title: "Migrar X de libY pra libZ"
    command_suggestion: /task | /fix
    estimated_scope: small | medium | large
    prerequisites: ["resolver D-spike-NN-001 primeiro"]
```

Se o spike foi puramente exploratório sem ação imediata, retornar `suggested_tasks: []`.

---

## FASE 4 — write (main thread, haiku/determinístico, ~15s)

### step 11 — write_spike_doc
**Path convention (D30):**
- Se `prd_id != null`: `knowledge/spikes/<PRD-NNN>-<slug>.md` (slug derivado da question)
  - Se já existe, append "Revision N" no fim ou novo file `<PRD-NNN>-<slug>-rN.md`
- Se `prd_id == null`: `knowledge/spikes/spike-NNN-<slug>.md` (NNN sequencial legacy)

```bash
# determinar próximo NNN legacy:
ls knowledge/spikes/spike-*.md 2>/dev/null | wc -l
# (consumer pode usar docs/spikes/ se legado; config override futuro)
```

Escrever o doc (slug derivado da question):

```markdown
# Spike NNN — <title>

> **Data:** YYYY-MM-DD
> **Autor:** Claude (orquestrado via /spike)
> **Question:** <step 2 question>
> **Depth:** <quick|deep>
> **Duration:** <actual wall-clock>

## Findings
<step 8 findings_md>

## Decisions proposed
<step 9 table>

## Follow-up tasks (sugeridas)
<step 10 list>

## Evidence references
<links/files consultados>

## Out of scope
<step 2 out_of_scope>
```

**Model:** haiku suficiente (templating) ou determinístico (string template).

### step 12 — update_session_log
Append em `knowledge/sessions/<date>.md` (ou skip se consumer não usa):

```markdown
### [timestamp] /spike — <question>
- doc: knowledge/spikes/spike-NNN-<slug>.md
- decisions_proposed: N
- followup_tasks: N
- duration: Xs
```

### step 13 — emit_telemetry
Via `McTelemetry.trackRun({command: 'spike', status, duration_ms, spike_doc_path, decisions_count, tasks_count, prd_id, task_slug})` fire-forget. Haiku ou determinístico.

**PRD Open Questions sync (D30):** se `prd_id != null` e step 9 propôs decisões, opcional append em `knowledge/prds/<PRD-NNN>-*.md` seção `§Open questions` marcando cada question resolvida com link pro spike doc. Não auto-resolve — só anota "spike escrito: <doc path>". User decide se promove decisão pra ADR/PRD formalmente.

---

## Exit states

### Sucesso

```
✓ /spike completado em <duração>.
  Doc: knowledge/spikes/spike-NNN-<slug>.md
  Decisões propostas: <N>
  Follow-up tasks: <N>

Próximos passos sugeridos:
  - Revisar decisões no doc
  - Lockar em ADR se escopo arquitetural (mover pra knowledge/decisions/)
  - Criar tasks no BACKLOG se aplicável
```

### Falha terminal (rara — research steps não têm retry complexo)

```
✗ /spike falhou no step <N> (<razão>).
  Step 5 falha → grep/Glob sem permissão? Tente rodar fora de node_modules.
  Step 7 falha → WebFetch bloqueado? depth=quick skip web.

Incident: knowledge/incidents/spike-<ts>.md
Partial findings preservados em: .wingx/spike-partial-<ts>.md
```

---

## Regras (anti-patterns)

- **NÃO editar código-alvo.** Único write permitido é o spike doc e session log. Se a pergunta exige tentativa de fix, aborte sugerindo `/fix` ou `/task`.
- **NÃO fazer search web especulativo.** Só URLs planejadas no step 3.
- **NÃO invocar WebFetch se depth=quick.** Soft-skip.
- **NÃO fabricar decisões sem evidence.** Se findings inconclusivos, `decisions: []` com nota "precisa mais research".
- **NÃO exceder 600s wall-clock.** Se research plan estima > 600s, reporte no step 4 e peça pro user quebrar em spikes menores.

---

## Gotchas

- **Paraguai legacy** — consumer pode ter spike docs em `docs/spikes/` (Sprint < 95). Detectar via glob; preservar localização existente do consumer (não forçar migração).
- **Web fetch rate limit** — se step 7 bate rate limit, marcar `web_findings: {status: 'rate_limited'}` em vez de retry loop.
- **Spike de integração com serviços externos** — não chamar APIs pagas (Anthropic, OpenAI, AWS) sem approval explícito no step 3; só docs públicos.

---

## Referências

- PRD-035 §Appendix L1530-1548 — catálogo original /spike
- PRD-035 §9 D24+D27 — refinamentos + tiered models
- `skills/_rules/SKILL.md` — step 1
- `skills/systematic-debugging/SKILL.md` — reutilizável pra spikes de debugging
- `commands/fix.md` — sibling command; pode ser sugerido em `suggested_tasks`
