---
name: token-optimizer
description: |
  Protocolo de defesa e otimização do contexto do Claude.
  Gerencia bandas de qualidade, leitura seletiva de arquivos e compactação inteligente.
  Triggers: "contexto alto", "muitos tokens", "economia de tokens", "limpar contexto".
allowed-tools: Read, Grep, Glob, Bash
---

# Token Optimizer

> Protocolo de "dieta de contexto" aplicável a qualquer projeto consumer da `@wingx-app/platform`.
> O agent atua sob orçamento finito de tokens — ignorar isso degrada qualidade silenciosamente antes de falhar explicitamente.

---

## 1. Bandas de Qualidade (Sinalização)

Antes de iniciar qualquer tarefa grande — ou ao sentir lentidão — estime o consumo. Use `ctx stats` (se `context-mode` instalado) ou a própria sinalização do cliente.

| Savings* | Sinal | Estado | Ações Obrigatórias |
|:---:|---|---|---|
| < 30% | 🟢 **Peak** | Ótimo | Nenhuma. Proceder com tarefas complexas. |
| 30–50% | 🟡 **Optimized** | Atenção | Evite ler arquivos inteiros. Use `grep` + range. |
| 50–70% | 🟠 **Full** | Pesado | **Checkpoint mandatório.** Atualize state/BACKLOG. Considere `/compact`. |
| 70–90% | 🔴 **Critical** | Instável | **Fechar sessão.** Salve estado + handoff. Reiniciar. |
| > 90% | ⛔ **Emergency** | Esgotado | **Parar tudo.** Não tente salvar nada novo. `/clear` imediato. |

> *Savings = proporção de tokens cacheados ou offloaded (sandbox) vs. total da janela.*

---

## 2. Protocolo de Leitura Seletiva (Anti-Bloat)

**NUNCA** leia arquivos > 200 linhas sem filtrar primeiro.

### Estratégia `Grep-First`:
1. `grep -n 'termo' arquivo.md` → identifica ranges
2. Ler só as linhas de interesse com offset/limit

### Estratégia `Context-Mode` (Offload):
Para logs, JSONs grandes, outputs de CLI:
1. `ctx_execute` roda o comando no sandbox (output não entra no contexto)
2. `ctx_search` / `ctx_execute_file` com `intent` extrai só o relevante
3. Apenas o summary printado entra no contexto

### Regra prática:
- ≤ 200 linhas → Read inteiro OK
- 200–1000 linhas → grep + Read ranges
- > 1000 linhas → offload via context-mode

---

## 3. Protocolo de Compactação Inteligente

Ao atingir a banda 🟠 **Full**, siga este rito antes de resetar a sessão:

1. **Persistir estado:** atualizar `project_current_work.md` (memória) ou `state.md` local com o que foi feito desde o último checkpoint.
2. **Sync BACKLOG:** marcar itens concluídos, promover Week done → seção "Done".
3. **Sync entry-points:** atualizar `CLAUDE.md`/`AGENTS.md` se houve mudança de escopo/regras.
4. **Handoff:** gerar "Prompt de Continuidade" para a próxima sessão (quando /retomada disponível, usar).
5. **Flush:** `/clear` ou nova conversa.

**Anti-pattern:** continuar trabalhando na banda 🔴/⛔ com a ilusão de que "só falta pouco". Context corrompido produz edits silenciosamente errados — prejuízo > custo de abrir nova sessão.

---

## 4. Manutenção de Docs (Dieta Estrutural)

- **BACKLOG.md:** mover sprints/milestones concluídos para `docs/archive/` ou `knowledge/logs/` quando passar de ~400 linhas.
- **CLAUDE.md / AGENTS.md:** manter **curto** — detalhes de infra ficam em `knowledge/concepts/architecture.md`; credenciais em envvars (nunca no entry-point).
- **Skills:** evitar carregar skill pesada quando a task é edição de texto simples — o loader cobra o budget inteiro.
- **Knowledge docs:** preferir múltiplos arquivos pequenos (`knowledge/lessons/*.md`) a um "bible" de 2000 linhas. Loader/grep encontra o relevante com menos bloat.

---

## 5. Regras de Ouro (Métricas)

1. **Modelo certo para a tarefa certa:** edição de markdown trivial em Opus é caro e lento; use Haiku/Sonnet quando couber. Opus pra design/reasoning denso; Haiku pra ops mecânicas.
2. **Tool overhead:** manter inventário de ferramentas ativo enxuto — MCPs não usados ainda custam schema em cada turno.
3. **Cache hits:** prompt cache dura ~5 min. Bloquear leituras repetidas do mesmo arquivo em janela curta mantém cache warm.
4. **Leituras uma vez:** re-ler o mesmo arquivo várias vezes na mesma sessão é smell — ou você não entendeu, ou está com context decay. Pause antes de rerun.
5. **Offload antes de degradar:** se output esperado > 20 linhas, rote pelo sandbox desde o início — não espere a banda subir.

---

## 6. Anti-Patterns

❌ Ler arquivo de 2000 linhas "pra entender o contexto" quando precisa de 1 função específica
❌ Cola de logs inteiros na conversa em vez de offload pra sandbox
❌ Re-rodar `git log` / `ls -la` sem escopo (output enorme, relevante mínimo)
❌ Ignorar sinal 🟠/🔴 e continuar "só mais uma edição"
❌ Carregar skill pesada (schema + exemplos) pra task que não precisa
❌ Não persistir estado antes do `/clear` — handoff perdido = retrabalho na próxima sessão
