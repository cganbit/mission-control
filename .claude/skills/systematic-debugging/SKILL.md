---
name: systematic-debugging
description: Metodologia de debugging em 4 fases com análise de causa raiz e verificação baseada em evidências. Usar ao debugar issues complexos.
allowed-tools: Read, Glob, Grep
---

# Systematic Debugging

> **Metodologia:** Prevenir palpites aleatórios. Entender o problema antes de resolver.
> **Princípio:** debugging eficaz é uma busca por evidência, não uma série de adivinhações.

---

## 4-Phase Debugging Process

### Phase 1: Reproduce

Antes de corrigir, reproduza o issue de forma confiável.

```
- Passos exatos para reproduzir
- Taxa de reprodução (sempre / frequente / raro)
- Comportamento esperado vs atual
- Ambiente (dev / staging / prod / OS / versão)
```

Se não reproduz = não está entendido. Nunca corrija bug que você não reproduziu ao menos 1x.

### Phase 2: Isolate

Identifique a origem e o escopo.

```
- Quando começou a acontecer? (git log, issue tracker, deploy history)
- O que mudou recentemente? (código, dependências, config, infra, dados)
- Acontece em todos os ambientes? (dev vs staging vs prod — diferente = pista)
- Qual é o menor caso que reproduz? (minimize inputs, remove ruído)
```

Bisect (`git bisect`) quando há commit de quebra em histórico longo.

### Phase 3: Understand

Encontre a **causa raiz**, não apenas sintomas.

**5 Whys:**
1. Por quê: [primeira observação]
2. Por quê: [razão mais profunda]
3. Por quê: [ainda mais fundo]
4. Por quê: [chegando perto]
5. Por quê: [causa raiz]

Pare quando a resposta é estrutural (design, contrato, invariante violado), não circunstancial ("alguém esqueceu de atualizar").

### Phase 4: Fix & Verify

```
- [ ] Bug não reproduz mais (rodar Phase 1 de novo)
- [ ] Funcionalidade relacionada ainda funciona (regression manual/automated)
- [ ] Nenhum novo issue introduzido (code review + CI)
- [ ] Teste adicionado para prevenir regressão (unit / integration / e2e conforme apropriado)
- [ ] Causa raiz documentada (knowledge/lessons ou commit body)
```

---

## Debugging Checklist

**Antes de começar:**
- [ ] Consigo reproduzir consistentemente
- [ ] Tenho caso mínimo de reprodução
- [ ] Entendo o comportamento esperado

**Durante a investigação:**
- [ ] Verificar mudanças recentes (`git log --oneline -20`, `git diff <last-known-good>`)
- [ ] Verificar logs de erro (app + infra + dependências externas)
- [ ] Adicionar logging/tracing se necessário (remover antes de mergear)
- [ ] Validar **assumptions**: o que você "sabe" pode estar errado. Inspecionar valores reais, não inferir.

**Após o fix:**
- [ ] Causa raiz documentada (não só "o que mudei")
- [ ] Fix verificado em ambiente similar ao do bug
- [ ] Teste de regressão adicionado
- [ ] Se padrão recorrente, atualizar gotchas do projeto

---

## Anti-Patterns

❌ **Mudanças aleatórias** — "Talvez se eu mudar isso..." (shotgun debugging)
❌ **Ignorar evidências contrárias** — "Isso não pode ser a causa" quando os logs dizem que é
❌ **Assumir sem verificar** — "Deve ser X" sem rodar `console.log` / debugger / breakpoint
❌ **Não reproduzir primeiro** — corrigir às cegas baseado só no relato
❌ **Parar nos sintomas** — fix pontual que esconde o bug estrutural pra reaparecer em outro lugar
❌ **Fix sem teste** — bug arrumado sem teste = bug que volta em 6 meses
❌ **"Deve ser race condition"** — sem prova, isso é chutar. Race precisa de evidência (timing log, repro com delay artificial, thread dump)

---

## Princípios transversais

- **Debuggar é buscar evidência, não adivinhar.** Cada hipótese precisa de 1 experimento que a confirma ou descarta.
- **Loops sem progresso:** se você tentou a mesma abordagem 2x e não funcionou, pare. Reabra Phase 2 (isolate) — provavelmente você está debuggando o sintoma errado.
- **Parse cuidadoso de API externa:** regex, JSON path, YAML indent — behaviors sutis (flag `m` vs não, lookahead vs lookbehind, quantificador greedy vs lazy). Prefira parser dedicado (ex: `yaml`, `xml2js`) a regex ad-hoc pra estruturas.
- **"Funciona na minha máquina":** diferença de ambiente é 90% das vezes: versão de dependência, envvar, timezone, locale, ou dado real vs fixture.
- **Bug intermitente ≠ bug aleatório.** Sempre tem causa: timing, ordem de init, cache, GC, rede, concorrência. A aparente "aleatoriedade" vira determinística quando você encontra a variável certa.

---

## Ferramentas por camada

| Camada | Ferramenta |
|---|---|
| Código | `console.log` com contexto, debugger IDE, breakpoints condicionais |
| Runtime | Node inspect (`node --inspect`), Chrome DevTools |
| Rede | `curl -v`, Wireshark, browser Network tab, proxy (mitmproxy, Charles) |
| DB | `EXPLAIN ANALYZE`, slow query log, pg_stat_statements |
| Infra | logs centralizados, APM (Sentry / Datadog), tracing (OpenTelemetry) |
| Git | `git bisect`, `git blame`, `git reflog` |
