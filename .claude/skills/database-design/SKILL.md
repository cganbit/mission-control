---
name: database-design
description: Princípios de design de banco de dados. Schema, indexação, seleção de ORM, migrations seguras, JSONB vs colunas. Genérico — projeto consumer documenta schema próprio em knowledge/concepts/database-schema.md.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Database Design

> **Aprenda a PENSAR, não copiar SQL.**
> Schema, regras de integridade e índices específicos do projeto consumer ficam em `knowledge/concepts/database-schema.md` (ou equivalente). Esta skill ensina os **princípios** que qualquer projeto deve aplicar.

---

## Checklist antes de desenhar schema

- [ ] A tabela já existe? Verificar via `\dt` (psql) / `.tables` (sqlite) / `SHOW TABLES` (mysql)
- [ ] É migration em tabela existente ou criação nova?
- [ ] Quais queries serão mais frequentes? Desenhar índices pra elas.
- [ ] JSONB/JSON vs colunas separadas? Prefira colunas se consultar frequentemente (não podem usar índice direto em chaves arbitrárias); use JSON pra dados realmente variáveis.
- [ ] FK constraint formal ou apenas convenção de nome? FK formal custa performance em write mas evita orphans; convenção exige disciplina do código.
- [ ] Soft delete (`deleted_at`) ou hard delete? Impacta todas queries subsequentes.
- [ ] Auditoria: precisa `created_at`/`updated_at`/`created_by`?

---

## Escolha de ORM vs SQL direto

| Situação | Escolha |
|---|---|
| CRUD padrão + evolução rápida + time pouco SQL-fluente | **ORM** (Drizzle / Prisma / TypeORM) |
| Queries complexas + tuning crítico de performance | **SQL direto** (com query builder opcional) |
| Misto: ORM pra 80% + SQL raw pra 20% complexo | **Híbrido** (todos ORMs modernos suportam `$queryRaw`) |

Não há resposta universal. Documentar a escolha + motivo em ADR.

---

## Padrões essenciais

### JSONB/JSON pra dados variáveis

```sql
-- Config key-value genérico
SELECT value FROM configs WHERE key = 'feature_flags';

-- Filtering em JSONB (PostgreSQL)
SELECT * FROM events WHERE metadata @> '{"type": "signup"}';
```

**Regra:** se você sempre acessa a mesma chave do JSON, promova pra coluna. JSON é pra esquema **realmente** variável.

### Migrations seguras (zero-downtime)

```sql
-- ✅ Adicionar coluna: sempre com DEFAULT antes de NOT NULL em 2 passos
ALTER TABLE t ADD COLUMN nova TEXT DEFAULT 'valor';
-- (depois, após backfill)
ALTER TABLE t ALTER COLUMN nova SET NOT NULL;

-- ✅ Adicionar índice em tabela grande: CONCURRENTLY pra não travar writes
CREATE INDEX CONCURRENTLY idx_nova ON t (coluna);

-- ❌ DROP COLUMN sem verificar uso no código
-- ❌ ALTER em coluna com bloqueio exclusivo em tabela de milhões de linhas
```

### Índices — pense na query, não na coluna

```sql
-- Query frequente: WHERE status = 'pending' ORDER BY created_at DESC
CREATE INDEX idx_status_created ON t (status, created_at DESC);

-- Unique parcial pra evitar duplicata em linha "ativa"
CREATE UNIQUE INDEX idx_active_unique ON t (user_id, resource_id) WHERE active = true;
```

**Heurística:** 1 índice por query crítica. Mais que 4-5 índices em tabela com muito write = sinal de problema de design.

---

## Anti-Patterns

❌ `SELECT *` em produção (fetch desnecessário, breakage silencioso quando schema muda)
❌ JSON quando colunas estruturadas servem (perde index, perde type safety)
❌ N+1 queries (usar JOIN ou batch via `IN (...)`)
❌ `DROP`/`ALTER` sem grep no código por uso da coluna
❌ Migration sem rollback plan (pelo menos mental: "como desfaço se quebrar?")
❌ FK sem índice (o PG cria UNIQUE índice na PK mas não no FK filho — lock em cascade vira full scan)
❌ Datas sem timezone (`timestamp` vs `timestamptz` — sempre `timestamptz` em PG)
❌ Naming inconsistente (snake_case vs camelCase misturado; plural vs singular; `user_id` vs `userId`)

---

## Gotchas cross-project

- **Nome de coluna "documentado" ≠ real:** sempre rodar `\d tabela` no psql antes de escrever query/doc. Nunca copiar de memória ou de doc desatualizada — documentação mente, schema não.
- **JOIN implícito não existe:** ORM não infere colunas de tabelas relacionadas sem JOIN explícito. Se precisa de campo de tabela-B numa query de tabela-A, adicionar `LEFT JOIN` explícito.
- **CTE scoping:** CTEs não herdam aliases de outras CTEs do mesmo `WITH`. Referenciar coluna de CTE vizinha requer subquery ou JOIN explícito, não alias direto.
- **`ADD COLUMN NOT NULL` sem DEFAULT trava tabela:** em PG < 11, reescreve toda a tabela; mesmo em PG 11+, se houver `DEFAULT` dinâmico (ex: `now()`) a tabela trava. Sempre 2 passos em tabela grande.
- **Append-only log tables:** decida cedo. Se é append-only, marque isso no nome/comentário + lint check pra bloquear `UPDATE`.
- **Particionamento preventivo vs reativo:** particionar antes de precisar é overhead; particionar tarde é downtime. Monitor quando tabela passa de ~1M-10M rows (depende do workload).

---

## Integridade: FK formal vs convenção

| Abordagem | Pros | Contras |
|---|---|---|
| FK constraint | Garantia no DB, rejeita orphan | Lock em cascade, custo em write, migrations mais lentas |
| Convenção + check no app | Flexível, sem lock | Orphan possível se app bugar ou SQL manual rodar |

**Regra:** FK constraint em relações críticas (fatura→cliente, ordem→usuário). Convenção em relações soft/audit (log→user pode sobreviver sem user).

---

## Encriptação em repouso

Colunas com dados sensíveis (CPF, telefone, chaves privadas, tokens OAuth refresh):
- Usar algoritmo reconhecido (AES-256-GCM, não AES-ECB)
- Chave em secret manager (envvar no CI; nunca hard-coded)
- Backup da chave **separado** do backup do DB — perder a chave = perder os dados
- Rotação planejada: schema precisa suportar re-encrypt batch

---

## Alertas de escala (monitorar sempre)

- Log/audit tables crescem linearmente — plano de archive ou particionamento
- Cache tables com TTL — job de limpeza se TTL é controlado por app
- Done/completed rows em filas — archive após N dias
- Índices sem uso (consultar `pg_stat_user_indexes`) — drop após confirmado

---

## Notas do consumer

Cada projeto deve documentar em `knowledge/concepts/` (ou equivalente):
- Schema canônico (quais databases, tabelas, relacionamentos)
- Regras de integridade conhecidas (app-enforced vs DB-enforced)
- Índices críticos + por quê existem
- Colunas encriptadas + chave envvar
- Padrões de naming (snake_case wire / camelCase TS — ver `api-patterns`)
- Alertas de escala específicos (particionamento, archive, limpeza)
