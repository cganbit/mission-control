-- ============================================================================
-- Migration: 20260423-ml-pedidos-date-created (forward)
-- PRD-036 F7 Fase 4 — Bug-1 fix: ml_pedidos.date_created ausente
-- Ref: wingx-platform/knowledge/prds/PRD-036-extract-ml-saas.md §F7-Fase-4
--
-- Escopo:
--   1. ADD COLUMN date_created TIMESTAMPTZ (data real da venda no ML)
--   2. ADD COLUMN date_closed  TIMESTAMPTZ (quando pagamento confirmou no ML)
--   3. CREATE INDEX date_created DESC (queries ORDER BY + filter from/to)
--
-- Contexto:
--   Schema atual só tem created_at = timestamp de INSERT no DB (DEFAULT NOW()).
--   Replay webhook recovery do incident 2026-04-23 criou 7 orders com
--   created_at = hoje, escondendo a data real da venda (spread 2026-04-07→22).
--
-- Idempotência: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--   Re-rodar é safe.
--
-- Ordem pós-migration:
--   1. Deploy api-ml@0.1.5 + MC com webhook populando date_created/date_closed
--   2. Backfill 7 orders recovery via re-fetch /orders/{id} (script separado)
-- ============================================================================

BEGIN;

ALTER TABLE ml_pedidos
  ADD COLUMN IF NOT EXISTS date_created TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_closed  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_date_created
  ON ml_pedidos (date_created DESC);

COMMIT;

-- Verify:
-- \d+ ml_pedidos
-- SELECT indexname FROM pg_indexes WHERE tablename='ml_pedidos';
