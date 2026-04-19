-- ============================================================================
-- Migration: 20260419-multi-tenant-rls (forward)
-- PRD-035 Week 5 — C2.1 slicing (RLS policies + helper functions)
-- Ref: wingx-platform/knowledge/plans/week5-multi-tenant-slicing.md
-- Depende de: 20260419-multi-tenant-schema.sql (C1, já aplicado)
--
-- Escopo C2.1 (DB only):
--   1. Schema `app` pra helper functions isoladas do `public`
--   2. Helper SQL: app.current_project_id() / app.is_worker_bypass()
--   3. ENABLE + FORCE ROW LEVEL SECURITY em 11 tabelas escopáveis
--   4. Policy `tenant_isolation` por tabela com fallback PERMISSIVO:
--        USING (project_id = app.current_project_id()
--               OR app.current_project_id() IS NULL
--               OR app.is_worker_bypass())
--        WITH CHECK (mesma expressão)
--
-- Por que fallback permissivo (D1 aprovado 2026-04-19):
--   - Endpoints atuais NÃO setam `app.current_project_id` ainda (C2.2/C3)
--   - Sem fallback, RLS bloqueia TUDO e apps caem em produção
--   - Paraguai é o único tenant real em prod; "vazar" = mostrar dados do
--     próprio Paraguai pra user Paraguai (no-op de segurança)
--   - Endpoints migram gradualmente em C3; a cada endpoint migrado, RLS
--     passa a ser strict pra aquela query (porque SET será feito)
--   - Quando 2ª org real existir, C3 estará completo; strict mode via
--     `ALTER POLICY` removendo o `OR app.current_project_id() IS NULL`
--
-- Escape hatch worker-key (D2 aprovado 2026-04-19):
--   - Mesma role `evolution`; worker routes fazem `SET LOCAL app.bypass_rls`
--   - Não exige role Postgres separada (simples, zero grant extra)
--
-- Idempotência:
--   - CREATE SCHEMA IF NOT EXISTS
--   - CREATE OR REPLACE FUNCTION
--   - ALTER TABLE ENABLE RLS (idempotente em re-run)
--   - DROP POLICY IF EXISTS + CREATE POLICY
-- Re-rodar é safe — produz o mesmo estado final.
--
-- Tabelas cobertas (11): pipeline_runs, pipeline_steps, pipeline_log_events,
--   harness_health_scores, squads, agents, tasks, activity_log, token_usage,
--   agent_memories, agent_documents
--
-- Fora de escopo C2.1 (virá em fases posteriores):
--   - db.ts refactor (query(text, params, opts: {projectId, worker}))  → C2.2
--   - Auth middleware helper withProjectScope()                        → C2.2
--   - Endpoints migrando pra opts.projectId                            → C3
--   - Strict mode (remover fallback NULL da policy)                    → C3 final
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Schema `app` — hosting pra helper functions
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS app;

-- ============================================================================
-- 2. Helper functions — STABLE pra poder ser usado em policies sem penalty
-- ============================================================================
CREATE OR REPLACE FUNCTION app.current_project_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $fn$
    SELECT NULLIF(current_setting('app.current_project_id', true), '')::uuid;
  $fn$;

CREATE OR REPLACE FUNCTION app.is_worker_bypass() RETURNS boolean
  LANGUAGE sql STABLE
  AS $fn$
    SELECT COALESCE(current_setting('app.bypass_rls', true) = 'true', false);
  $fn$;

-- ============================================================================
-- 3. ENABLE + FORCE RLS + Policy tenant_isolation em 11 tabelas
--    FORCE RLS força RLS mesmo pra quem é TABLE OWNER (previne bypass
--    acidental se evolution virar owner em rebuild).
-- ============================================================================

-- ---- pipeline_runs ----
ALTER TABLE pipeline_runs ENABLE  ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_runs;
CREATE POLICY tenant_isolation ON pipeline_runs
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- pipeline_steps ----
ALTER TABLE pipeline_steps ENABLE  ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_steps;
CREATE POLICY tenant_isolation ON pipeline_steps
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- pipeline_log_events ----
ALTER TABLE pipeline_log_events ENABLE  ROW LEVEL SECURITY;
ALTER TABLE pipeline_log_events FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_log_events;
CREATE POLICY tenant_isolation ON pipeline_log_events
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- harness_health_scores ----
ALTER TABLE harness_health_scores ENABLE  ROW LEVEL SECURITY;
ALTER TABLE harness_health_scores FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON harness_health_scores;
CREATE POLICY tenant_isolation ON harness_health_scores
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- squads ----
ALTER TABLE squads ENABLE  ROW LEVEL SECURITY;
ALTER TABLE squads FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON squads;
CREATE POLICY tenant_isolation ON squads
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- agents ----
ALTER TABLE agents ENABLE  ROW LEVEL SECURITY;
ALTER TABLE agents FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agents;
CREATE POLICY tenant_isolation ON agents
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- tasks ----
ALTER TABLE tasks ENABLE  ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tasks;
CREATE POLICY tenant_isolation ON tasks
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- activity_log ----
ALTER TABLE activity_log ENABLE  ROW LEVEL SECURITY;
ALTER TABLE activity_log FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON activity_log;
CREATE POLICY tenant_isolation ON activity_log
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- token_usage ----
ALTER TABLE token_usage ENABLE  ROW LEVEL SECURITY;
ALTER TABLE token_usage FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON token_usage;
CREATE POLICY tenant_isolation ON token_usage
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- agent_memories ----
ALTER TABLE agent_memories ENABLE  ROW LEVEL SECURITY;
ALTER TABLE agent_memories FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_memories;
CREATE POLICY tenant_isolation ON agent_memories
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

-- ---- agent_documents ----
ALTER TABLE agent_documents ENABLE  ROW LEVEL SECURITY;
ALTER TABLE agent_documents FORCE   ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_documents;
CREATE POLICY tenant_isolation ON agent_documents
  USING      (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

COMMIT;

-- ============================================================================
-- Verificação pós-migration (rode manualmente):
--
-- SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--   WHERE n.nspname='app' ORDER BY proname;                        -- expect 2 rows
-- SELECT tablename FROM pg_tables
--   WHERE rowsecurity = true AND schemaname='public' ORDER BY tablename;  -- expect 11
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND policyname='tenant_isolation' ORDER BY tablename;  -- expect 11
--
-- Smoke test (rode em SESSÕES SEPARADAS pra SET LOCAL ter efeito):
--
-- -- 0. Criar org+project sintética
-- INSERT INTO organizations (id, slug, name) VALUES
--   ('00000000-0000-0000-0000-000000000099'::uuid, 'test-org', 'Test Org (smoke)')
-- ON CONFLICT DO NOTHING;
-- INSERT INTO projects (id, owner_organization_id, slug, name) VALUES
--   ('00000000-0000-0000-0000-000000000099'::uuid,
--    '00000000-0000-0000-0000-000000000099'::uuid,
--    'test-project', 'Test Project (smoke)')
-- ON CONFLICT DO NOTHING;
--
-- -- 1. Sem SET: fallback permissivo, retorna tudo
-- SELECT COUNT(*) AS all_runs FROM pipeline_runs;
--
-- -- 2. SET Paraguai: retorna só Paraguai
-- BEGIN;
-- SET LOCAL app.current_project_id = '00000000-0000-0000-0000-000000000001';
-- SELECT COUNT(*) AS paraguai_runs FROM pipeline_runs;
-- COMMIT;
--
-- -- 3. SET test-project: retorna 0
-- BEGIN;
-- SET LOCAL app.current_project_id = '00000000-0000-0000-0000-000000000099';
-- SELECT COUNT(*) AS test_runs FROM pipeline_runs;
-- COMMIT;
--
-- -- 4. SET bypass: retorna tudo (worker mode)
-- BEGIN;
-- SET LOCAL app.bypass_rls = 'true';
-- SELECT COUNT(*) AS bypass_runs FROM pipeline_runs;
-- COMMIT;
--
-- -- Cleanup:
-- DELETE FROM projects WHERE id = '00000000-0000-0000-0000-000000000099';
-- DELETE FROM organizations WHERE id = '00000000-0000-0000-0000-000000000099';
-- ============================================================================
