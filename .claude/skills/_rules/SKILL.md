---
name: _rules
description: Mecanismo de injeção das regras canônicas R1-R10, anti-bypass e anti-hallucination no prompt do agent. Auto-carregada pelo session-start hook; aplicável a qualquer task. Esta skill é o ponto único de verdade — agentes individuais herdam, não duplicam.
allowed-tools: Read, Grep
---

# `_rules` — Regras canônicas (injeção universal)

> Esta skill é o **ponto único de verdade** para as regras comportamentais aplicáveis a qualquer trabalho feito por Claude Code em um projeto consumer da `@wingx-app/platform`.
> Agentes individuais (`backend`, `frontend`, `qa`, etc.) **herdam** via injeção; eles não devem duplicar nem sobrescrever essas regras.
> Entry points (`CLAUDE.md`, `AGENTS.md`) **resumem** mas não repetem — linkam pra esta skill.

---

## R1–R10 — Pre-Work & Code Quality

1. **R1 STEP 0 RULE** — dead code cleanup separado antes de refactor em arquivo > 300 LOC.
2. **R2 PHASED EXECUTION** — nunca multi-file refactor em 1 resposta; fases ≤ 5 arquivos, aprovação entre fases.
3. **R3 SENIOR DEV OVERRIDE** — arquitetura / estado / padrões quebrados devem ser corrigidos, não ignorados.
4. **R4 FORCED VERIFICATION** — rodar `pnpm typecheck` + `pnpm lint` (ou equivalente no stack) antes de declarar completo.
5. **R5 SUB-AGENT SWARMING** — > 5 arquivos independentes = sub-agents paralelos.
6. **R6 CONTEXT DECAY AWARENESS** — re-ler arquivo antes de editar após 10+ mensagens.
7. **R7 FILE READ BUDGET** — 2000 linhas/read; arquivos > 500 LOC em chunks com offset/limit.
8. **R8 TOOL RESULT BLINDNESS** — outputs > 50k chars truncam silenciosamente; re-rodar com escopo menor.
9. **R9 EDIT INTEGRITY** — re-read antes e depois de cada edit; máx 3 edits sem verification read.
10. **R10 NO SEMANTIC SEARCH** — rename/change busca separado: calls, types, strings, imports, re-exports.

---

## ⛔ Anti-Bypass (princípio universal)

O agent está **PROIBIDO** de:

1. Criar waivers, exceções ou portas dos fundos em checks/hooks mecânicos.
2. Usar flags como `--no-verify`, `--force`, `--skip-checks`, envvar de bypass arbitrário.
3. Pular validações de schema ou typecheck alegando "pequeno escopo".

**Princípio:** classifica → delega → verifica. Se um check bloqueia, entende o porquê e resolve a causa raiz, **não bypassa**.

**Escape válido:** único caminho é o envvar oficial (`WINGX_ALLOW_BYPASS=1`) em situação de incidente humano-autorizada — e mesmo assim deve ser documentada em `knowledge/logs/` após o fato.

---

## ⛔ Anti-Alucinação

1. **Verificar antes de afirmar:** todo path, função, flag, comando ou tipo citado **deve existir** — checar via Read/Grep antes de mencionar.
2. **Nunca inventar:** se não tem certeza, dizer "não verificado" — proibido construir resposta sobre suposição.
3. **Loops > 2 sem progresso = parar:** mesma tentativa falhando 2× → reportar + pedir direção, nunca tentar 3ª variação às cegas.
4. **Re-ler após 10+ mensagens:** context decay derruba memória de arquivo — Re-Read obrigatório antes de Edit em arquivo tocado > 10 msgs atrás.
5. **Flagar incerteza explicitamente:** marcar "assumindo X" / "não verificado" — deixar o humano decidir se vale verificar antes.

---

## Protocolo de Contexto (5 Bandas)

| Savings | Estado | Ação |
|:---:|---|---|
| < 30% | 🟢 Peak | Continuar normal |
| 30–55% | 🟡 Optimized | Evitar leituras redundantes |
| 55–70% | 🟠 Full | Recarregar contexto. Se não resolver → nova sessão |
| 70–90% | 🔴 Critical | **Nova sessão imediata** após checkpoint |
| > 90% | ⛔ Emergency | Parar. Flush context agora. |

Detalhes operacionais em [token-optimizer](../token-optimizer/SKILL.md).

---

## Hierarquia de Fontes (ordem de autoridade)

Quando duas fontes discordam, a de **maior** autoridade vence:

1. **`_rules` (esta skill)** — regras R1-R10 + anti-bypass + anti-hallucination. Imutáveis sem alteração formal aqui.
2. **`knowledge/prds/*.md`** ativos — escopo e decisões lockadas do projeto.
3. **`CLAUDE.md` / `AGENTS.md`** — entry points (resumem 1 e 2, não substituem).
4. **`knowledge/concepts/*.md`** — arquitetura, domain, schema do consumer.
5. **Memória pessoal (`~/.claude/memory/`)** — preferências do operador humano (escopo individual, não sobrescreve regras).
6. **CLAUDE.md de repos adjacentes** — referência cruzada; nunca sobrescreve o CLAUDE.md do repo em que você está.

---

## Aplicação por agent

Cada agent em `agents/*.md` do consumer (herdados de `@wingx-app/platform/agents/`) assume essas regras **sem redeclarar**. O prompt de sistema do agent injeta a skill `_rules` via o loader; o agent começa o raciocínio já com elas ativas.

**Anti-pattern:** agent que reescreve R1-R10 no próprio prompt (duplicação = drift quando `_rules` evolui). Se um agent precisa de regra adicional **específica** da função dele, ela vira seção dedicada no arquivo do agent, não cópia das canônicas.

---

## Evolução das regras

Alterar `_rules` é mudança de platform primitives → impacta todos os consumers. Processo:

1. Proposta em ADR formal em `wingx-platform/knowledge/decisions/ADR-NNN-rule-change.md`.
2. Discussão + aprovação pelo owner.
3. Implementação nesta skill + bump minor da `@wingx-app/platform` (ou major se breaking).
4. Consumers pegam automaticamente no próximo `npm install @wingx-app/platform@latest`.

Mudanças ad-hoc no arquivo sem ADR são **proibidas** (quebra R3 pra platform).
