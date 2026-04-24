-- ============================================================================
-- Migration: 20260423-ml-pedidos-date-created (ROLLBACK)
-- Reverte 20260423-ml-pedidos-date-created.sql.
--
-- ⚠️  ATENÇÃO:
--   - Rollback só é safe se api-ml@0.1.5 + webhook fix AINDA não populou
--     date_created/date_closed em rows em prod. Caso já tenha dados,
--     DROP COLUMN perde a captura real da data ML sem chance de recovery.
--   - Queries em api-ml que usam COALESCE(date_created, created_at) devem
--     ser revertidas ANTES (re-deploy version anterior) — senão 42703.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_ml_pedidos_date_created;

ALTER TABLE ml_pedidos
  DROP COLUMN IF EXISTS date_closed,
  DROP COLUMN IF EXISTS date_created;

COMMIT;
