---
name: deploy-safety
description: Heurísticas e checklists pré-deploy pra evitar incidentes. Aplicável a qualquer projeto consumer — cada um documenta o alvo concreto em knowledge/runbooks/deploy.md.
allowed-tools: Read, Grep, Bash
---

# Deploy Safety

> Deploy é ponto de contato entre código correto e realidade operacional. A maioria dos incidentes vem de etapas negligenciadas, não de bugs sofisticados.
> Esta skill é genérica — runbook **concreto** do stack/infra do projeto fica em `knowledge/runbooks/deploy.md` do consumer.

---

## Pré-Deploy Checklist (obrigatório)

**Código:**
- [ ] `pnpm typecheck` / `tsc --noEmit` passa
- [ ] `pnpm lint` passa
- [ ] `pnpm test` (unit + integration) passa
- [ ] Build local (`pnpm build`) bem-sucedido
- [ ] CI verde no PR (não confiar em "provavelmente passa")
- [ ] Migration pendente? Revisada + idempotente?

**Dados:**
- [ ] Migration testada em staging com dump recente de prod (se aplicável)
- [ ] Backup do banco recente (< 24h)
- [ ] Coluna adicionada com `DEFAULT` + `NOT NULL` só no passo 2 (ver [database-design](../database-design/SKILL.md))
- [ ] Feature flag pronta se mudança é risky

**Secrets / config:**
- [ ] Novas envvars documentadas em `.env.example`
- [ ] Envvars configuradas em CI + prod
- [ ] Zero secret novo em código commitado (pre-commit hook ativo)
- [ ] Secret sem trailing `\n` ao colar (validar `echo -n "$SECRET" | wc -c`)

**Rollback:**
- [ ] Plano de rollback testado mentalmente ("se quebrar em 5 min, como volto?")
- [ ] Migration reverse disponível ou documentada como "forward-only + fix forward"
- [ ] Último bom commit identificado (tag ou SHA anotado)

**Observabilidade:**
- [ ] Métrica / log pra detectar a nova funcionalidade em prod
- [ ] Alerta se rate de erro subir acima de baseline

---

## Durante o Deploy

1. **Avisar:** notificar stakeholders (Slack / WhatsApp / canal do projeto) antes do deploy não-trivial.
2. **Observar:** olhar logs + métricas durante a subida; não iniciar próxima task.
3. **Smoke test imediato:** depois do deploy, acessar rota crítica + verificar response OK. Automação > manual.
4. **Janela de observação:** 15-30 min monitorando antes de considerar estável (dependendo do tráfego).

---

## Pós-Deploy

- [ ] Smoke test completo passou
- [ ] Dashboards em valores normais
- [ ] Zero erro novo em Sentry / logs
- [ ] Tag criada (`v1.2.3` ou `deploy-YYYYMMDD-HHMM`)
- [ ] Handoff documentado se deploy pertenceu a outro colaborador

---

## Heurísticas

### Sexta 17h não é hora de deploy
Exceto emergência autorizada. Bug em sexta à noite ou fim de semana = ninguém disponível pra triar. Deploy cedo na semana, cedo no dia.

### "Pequeno deploy" não existe
Todo deploy toca prod. Tratar um-liner bug fix com a mesma disciplina de um deploy grande evita os incidentes que são "só mudei uma variável".

### Rollback > Fix forward (para risco conhecido)
Se depois de 10 min pós-deploy o sistema está instável, rollback **primeiro**, investigar depois. Tentar fix forward sob pressão = incidente duplo.

### Migration sem rollback = commitment
Forward-only migrations são legítimas, mas exigem cautela proporcional. Testadas em staging com dados reais.

### Secret rotacionado afeta TODOS os consumers
Antes de girar chave em GitHub Secret / secret manager, mapear **todos** os consumers (grep no workspace, CI pipelines de outros repos). Rotacionar secret sem atualizar um consumer = serviço quebrado silenciosamente.

---

## Deploy types e mitigações

| Tipo | Risco primário | Mitigação |
|---|---|---|
| Código-only | Bug em feature nova | Feature flag; deploy em horário de baixo tráfego |
| Migration | Lock em tabela grande; data loss | `CONCURRENTLY`; backup; migration em 2 passos (adiciona → backfill → set NOT NULL) |
| Infra/config | Downtime | Blue-green; health check antes de switchar tráfego |
| Secret rotation | Consumer quebrado | Mapear consumers; rotacionar de trás pra frente (novo → atualiza consumers → desativa antigo) |
| Dependency upgrade | Breaking silencioso | Changelog lido; staging run; smoke test expandido |
| Multi-repo coordenado | Ordem errada quebra | Deploy plan escrito; ordem clara; checklist por passo |

---

## Incident Response (quando deploy deu errado)

1. **Reconhecer:** "deploy quebrou" — não minimizar. Comunicar no canal agora.
2. **Rollback ou fix forward?**
   - < 10 min e causa óbvia + fix trivial → fix forward com cuidado.
   - Qualquer outra coisa → rollback.
3. **Rollback:** comando conhecido (do runbook). Validar que voltou ao estado anterior bom.
4. **Postmortem:** após estabilizar, documentar em `knowledge/lessons/deploy-incident-YYYY-MM-DD.md`:
   - O que aconteceu
   - Por que passou nos checks
   - O que vai mudar pra não repetir
   - Atualizar esta skill se padrão recorrente

---

## Anti-Patterns

❌ "Vou pular o typecheck só dessa vez" — typecheck existe precisamente pra pegar isso
❌ Deploy com `--no-verify` pra pular hook — ver [_rules](.._rules/SKILL.md) anti-bypass
❌ Migration destructive sem backup recente
❌ Commit de "fix deploy" sem entender o que quebrou
❌ Deploy em final de expediente / sexta / feriado / véspera de férias sem necessidade
❌ Ignorar warning "migration lenta" assumindo "é só alguns segundos a mais"
❌ Force-push em branch de deploy sem coordenação
❌ Pular smoke test porque "a CI já testou" — CI não valida prod config

---

## Notas do consumer

Cada projeto deve documentar em `knowledge/runbooks/deploy.md`:
- Comando exato de deploy (CI trigger, manual script, etc.)
- Comando exato de rollback
- Endpoints de smoke test críticos
- Como validar logs/métricas em tempo real (dashboard URL, CLI command)
- Histórico de incidentes passados + link pra postmortem
