-- ============================================================================
-- Migration: 20260426-agents-tools-workflow (forward)
-- PRD-041 §13.3 D5.1 — Schema drift fix: agents.tools + agents.workflow
-- Ref: wingx-platform/knowledge/prds/PRD-041-execution-pattern-upgrade.md §13.3
--
-- Escopo:
--   1. ADD COLUMN tools    TEXT (comma-separated allowed-tools list)
--   2. ADD COLUMN workflow TEXT (newline-separated workflow steps)
--
-- Contexto:
--   `tools` e `workflow` são referenciados em:
--     - src/app/api/agents/route.ts (POST + GET)
--     - src/app/api/agents/[id]/route.ts (PATCH)
--     - src/app/(dashboard)/agents/page.tsx (drawer editor + table)
--   ...mas NÃO estavam definidos em src/db/schema.ts. Schema drift legacy
--   nunca surfado em produção porque tabelas existentes herdaram colunas
--   via inserts manuais OR ALTER TABLE não rastreado.
--
-- Trigger: PRD-041 §13.3 D5.2 (sync-agents-to-mc.mjs) precisa popular
--   18 agentes wingx-platform via POST/PATCH /api/agents com tools+workflow.
--   Sem esta migration, INSERT silenciosamente perde os campos.
--
-- Idempotência: ADD COLUMN IF NOT EXISTS. Re-rodar é safe.
-- ============================================================================

BEGIN;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tools    TEXT,
  ADD COLUMN IF NOT EXISTS workflow TEXT;

COMMIT;

-- Verify:
-- \d+ agents
-- SELECT column_name FROM information_schema.columns WHERE table_name='agents';
