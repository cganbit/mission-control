---
name: change-impact
description: Como declarar e validar dependências entre arquivos via knowledge/change-impact.yaml. Quando você muda X, o hook pre-commit confere se Y foi atualizado junto. Dogfood ativo na própria platform (D22).
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Change Impact — dependências entre docs/arquivos

> **Problema que resolve:** docs e estruturas evoluem juntas, mas desenvolvedores esquecem. Mudou o PRD? Atualizou o BACKLOG? Mudou `CLAUDE.md`? Mirror em `AGENTS.md`?
> **Como:** declara regras em `knowledge/change-impact.yaml`; o hook `hooks/pre-commit/change-impact-check.cjs` valida antes do commit passar.
> **Dogfood:** PRD-035 §9 D22 — a própria `@wingx-app/platform` usa esse mecanismo no próprio repo.

---

## Formato do `change-impact.yaml`

```yaml
version: 1
rules:
  - name: mirror-entry-points
    when_changes: ["CLAUDE.md"]
    must_also_change: ["AGENTS.md"]
    severity: block
    message: "CLAUDE.md e AGENTS.md devem manter paridade de conteúdo (entry point cross-tool)."

  - name: prd-sync-backlog
    when_changes: ["knowledge/prds/**/*.md"]
    must_also_change: ["BACKLOG.md"]
    severity: block
    message: "Mudanças em PRD devem refletir em BACKLOG (status / checklist)."

  - name: agents-list-backlog
    when_changes: ["agents/**/*.md"]
    must_also_change: ["BACKLOG.md"]
    severity: warn
    message: "Novo agent ou mudança semântica geralmente atualiza tabela do BACKLOG."
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | ID único da regra |
| `when_changes` | array de globs | Quando **algum** desses paths aparece em staged |
| `must_also_change` | array de globs | Então **pelo menos um** destes deve também estar staged |
| `severity` | `block` \| `warn` | `block` = commit falha; `warn` = avisa mas deixa passar |
| `message` | string | O que mostrar quando a regra dispara |

**Matching:** globs interpretados via `minimatch` (ou `micromatch`). `**` = qualquer profundidade; `*` = qualquer arquivo no mesmo nível.

---

## Como o hook opera

`hooks/pre-commit/change-impact-check.cjs`:

1. Lê `knowledge/change-impact.yaml` (se não existe, **skip silencioso** — zero-config default).
2. Para cada regra, confere se algum path em `git diff --cached --name-only` bate com `when_changes`.
3. Se sim, confere se algum path staged também bate com `must_also_change`.
4. Se não bater:
   - `severity: block` → imprime `message`, exit 1, commit bloqueado.
   - `severity: warn` → imprime `message` em amarelo, exit 0.
5. Zero dependências externas (só Node built-ins).

**Escape:** `WINGX_ALLOW_BYPASS=1 git commit ...` pula o hook (usar só em incidente autorizado — ver `_rules` anti-bypass).

---

## Quando declarar uma regra nova

Cada vez que você pensar "se eu mudar A, não posso esquecer de B" — formalize como regra. Critério:

- ✅ **Regra boa:** "mudei schema em `docs/sql/` → migration correspondente em `migrations/` deve existir"
- ✅ **Regra boa:** "novo endpoint em `src/app/api/` → teste de integração em `__tests__/api/`"
- ❌ **Evitar:** regras super-gerais tipo "qualquer mudança em `src/` requer teste" (gera ruído, pessoas começam a bypassar mentalmente).

**Heurística:** a regra deve capturar um esquecimento que **já aconteceu pelo menos 2×**. Declarar preventivamente sem evidência = ruído.

---

## Dogfood atual (`@wingx-app/platform`)

O próprio repo da platform tem `knowledge/change-impact.yaml` com 3 regras (D22):

1. `CLAUDE.md ↔ AGENTS.md` mirror (block)
2. `knowledge/prds/** → BACKLOG.md` sync (block)
3. `agents/** → BACKLOG.md` list update (warn)

Motivo: validar o hook no próprio repo antes de expor pra consumers; capturar gotchas reais (AGENTS.md drift, BACKLOG out-of-sync com PRD) que aconteceram nas Weeks 0-1.

---

## Gotchas

- **Rename entra como delete + add:** se você renomeia `CLAUDE.md` → `agents.md`, o diff staged lista ambos. Pode disparar regra inesperada. Solução: regras genéricas o suficiente, ou seção de exceções no yaml.
- **Commit parcial:** `git add -p` pode stagear só parte de A sem stagear B. O hook olha staged, não working tree — comportamento correto: B **precisa** ser staged pra passar.
- **Revert:** commit de revert que toca A sem tocar B passaria? Normalmente sim — revert é caso legítimo. Se problema real, adicionar flag `when_not_revert: true` (feature opcional a implementar se necessário).

---

## Instalar em um consumer

Após `npm install @wingx-app/platform`:

```bash
wingx register  # instala hooks incluindo change-impact-check
```

Depois crie `knowledge/change-impact.yaml` no repo consumer com regras específicas do domínio.

---

## Anti-Patterns

❌ **Lista gigante de regras** — > 10 regras é sinal de over-engineering; probably captura padrões demais que deveriam ser convenção de review.
❌ **Mensagens genéricas** — "atualizar arquivos relacionados" é inútil; a mensagem deve dizer **qual** atualização fazer.
❌ **Severity: block em regras `warn` na intenção** — se você não quer bloquear merge, use `warn`. `block` é pra invariante que **quebra** algo se não seguida.
❌ **Bypass via `WINGX_ALLOW_BYPASS` pra "emergência que não é emergência"** — ver `_rules` anti-bypass.
