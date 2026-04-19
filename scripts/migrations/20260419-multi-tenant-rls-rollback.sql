-- ============================================================================
-- Migration: 20260419-multi-tenant-rls (ROLLBACK)
-- Reverte 20260419-multi-tenant-rls.sql.
--
-- ⚠️  ATENÇÃO:
--   - Rollback DESATIVA isolamento multi-tenant. Rode apenas se C2.2/C3
--     tiverem dado problema e precisar voltar ao estado C1 (schema only,
--     sem RLS). Schema C1 é preservado.
--   - Se C3 já está em prod (endpoints fazendo SET), rollback deste C2.1
--     torna o SET no-op mas não quebra nada (queries continuam funcionando
--     com ou sem SET).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Drop policies tenant_isolation (11 tabelas)
-- ============================================================================
DROP POLICY IF EXISTS tenant_isolation ON pipeline_runs;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_steps;
DROP POLICY IF EXISTS tenant_isolation ON pipeline_log_events;
DROP POLICY IF EXISTS tenant_isolation ON harness_health_scores;
DROP POLICY IF EXISTS tenant_isolation ON squads;
DROP POLICY IF EXISTS tenant_isolation ON agents;
DROP POLICY IF EXISTS tenant_isolation ON tasks;
DROP POLICY IF EXISTS tenant_isolation ON activity_log;
DROP POLICY IF EXISTS tenant_isolation ON token_usage;
DROP POLICY IF EXISTS tenant_isolation ON agent_memories;
DROP POLICY IF EXISTS tenant_isolation ON agent_documents;

-- ============================================================================
-- 2. DISABLE + NO FORCE RLS nas 11 tabelas
-- ============================================================================
ALTER TABLE pipeline_runs          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs          DISABLE  ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps         DISABLE  ROW LEVEL SECURITY;
ALTER TABLE pipeline_log_events    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_log_events    DISABLE  ROW LEVEL SECURITY;
ALTER TABLE harness_health_scores  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE harness_health_scores  DISABLE  ROW LEVEL SECURITY;
ALTER TABLE squads                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE squads                 DISABLE  ROW LEVEL SECURITY;
ALTER TABLE agents                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE agents                 DISABLE  ROW LEVEL SECURITY;
ALTER TABLE tasks                  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                  DISABLE  ROW LEVEL SECURITY;
ALTER TABLE activity_log           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_log           DISABLE  ROW LEVEL SECURITY;
ALTER TABLE token_usage            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE token_usage            DISABLE  ROW LEVEL SECURITY;
ALTER TABLE agent_memories         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_memories         DISABLE  ROW LEVEL SECURITY;
ALTER TABLE agent_documents        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_documents        DISABLE  ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Drop helpers + schema app
-- ============================================================================
DROP FUNCTION IF EXISTS app.current_project_id();
DROP FUNCTION IF EXISTS app.is_worker_bypass();
DROP SCHEMA   IF EXISTS app;

COMMIT;

-- ============================================================================
-- Pós-rollback: estado é idêntico ao pré-C2.1 (C1 schema intacto, RLS off).
-- ============================================================================
