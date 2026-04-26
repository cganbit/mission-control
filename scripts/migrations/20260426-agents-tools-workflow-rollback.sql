-- ============================================================================
-- Migration: 20260426-agents-tools-workflow (ROLLBACK)
-- Reverte 20260426-agents-tools-workflow.sql.
--
-- ATENÇÃO: DROP COLUMN destrói dados nas colunas. Backup antes de rodar
--   se houver agentes com tools/workflow populados via UI ou via
--   sync-agents-to-mc.mjs (D5.2 PRD-041 §13.3).
-- ============================================================================

BEGIN;

ALTER TABLE agents
  DROP COLUMN IF EXISTS tools,
  DROP COLUMN IF EXISTS workflow;

COMMIT;
