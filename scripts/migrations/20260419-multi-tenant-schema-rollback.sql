-- ============================================================================
-- Migration: 20260419-multi-tenant-schema (ROLLBACK)
-- Reverte 20260419-multi-tenant-schema.sql.
--
-- ⚠️  ATENÇÃO:
--   - Só rode se C2 (RLS) ainda não foi aplicado. Caso contrário, rollback de C1
--     quebra C2 antes. Rollback C2 primeiro.
--   - pipeline_runs.project_id e harness_health_scores.project_id são PRESERVADOS
--     (vieram antes desta migration, na Week 1). Só dropamos FK + indexes criados
--     aqui; a column fica.
--   - organization_members e projects são apagados completamente. Se tiver outros
--     projects criados além do Paraguai, PERDIDOS. Confirmar antes de rodar.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Drop FK constraints (11 total)
-- ============================================================================
ALTER TABLE pipeline_runs          DROP CONSTRAINT IF EXISTS fk_pipeline_runs_project;
ALTER TABLE harness_health_scores  DROP CONSTRAINT IF EXISTS fk_harness_health_scores_project;
ALTER TABLE squads                 DROP CONSTRAINT IF EXISTS fk_squads_project;
ALTER TABLE agents                 DROP CONSTRAINT IF EXISTS fk_agents_project;
ALTER TABLE tasks                  DROP CONSTRAINT IF EXISTS fk_tasks_project;
ALTER TABLE activity_log           DROP CONSTRAINT IF EXISTS fk_activity_log_project;
ALTER TABLE token_usage            DROP CONSTRAINT IF EXISTS fk_token_usage_project;
ALTER TABLE agent_memories         DROP CONSTRAINT IF EXISTS fk_agent_memories_project;
ALTER TABLE agent_documents        DROP CONSTRAINT IF EXISTS fk_agent_documents_project;
ALTER TABLE pipeline_steps         DROP CONSTRAINT IF EXISTS fk_pipeline_steps_project;
ALTER TABLE pipeline_log_events    DROP CONSTRAINT IF EXISTS fk_pipeline_log_events_project;

-- ============================================================================
-- 2. Drop indexes criados aqui (9 — pipeline_runs/harness_health indexes NÃO)
-- ============================================================================
DROP INDEX IF EXISTS idx_squads_project;
DROP INDEX IF EXISTS idx_agents_project;
DROP INDEX IF EXISTS idx_tasks_project;
DROP INDEX IF EXISTS idx_activity_log_project;
DROP INDEX IF EXISTS idx_token_usage_project;
DROP INDEX IF EXISTS idx_agent_memories_project;
DROP INDEX IF EXISTS idx_agent_documents_project;
DROP INDEX IF EXISTS idx_pipeline_steps_project;
DROP INDEX IF EXISTS idx_pipeline_log_events_project;

-- ============================================================================
-- 3. Drop project_id das 9 tabelas novas
--    (pipeline_runs e harness_health_scores PRESERVADOS — pré-existentes Week 1)
-- ============================================================================
ALTER TABLE squads             DROP COLUMN IF EXISTS project_id;
ALTER TABLE agents             DROP COLUMN IF EXISTS project_id;
ALTER TABLE tasks              DROP COLUMN IF EXISTS project_id;
ALTER TABLE activity_log       DROP COLUMN IF EXISTS project_id;
ALTER TABLE token_usage        DROP COLUMN IF EXISTS project_id;
ALTER TABLE agent_memories     DROP COLUMN IF EXISTS project_id;
ALTER TABLE agent_documents    DROP COLUMN IF EXISTS project_id;
ALTER TABLE pipeline_steps     DROP COLUMN IF EXISTS project_id;
ALTER TABLE pipeline_log_events DROP COLUMN IF EXISTS project_id;

-- ============================================================================
-- 4. Drop tabelas novas (ordem: filhas antes de pais)
-- ============================================================================
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS organizations;

COMMIT;

-- ============================================================================
-- Pós-rollback: estado é idêntico ao pré-20260419-multi-tenant-schema.
-- pipeline_runs.project_id e harness_health_scores.project_id mantêm NOT NULL
-- DEFAULT Paraguai (como estavam na Week 1).
-- ============================================================================
