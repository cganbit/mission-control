-- PRD-035 C3.6 — Transfer ownership of public schema objects to mc_app.
--
-- Contexto: após swap DATABASE_URL pra mc_app, endpoints com pattern
-- `ensureTable()` (CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS)
-- falhavam com "permission denied for schema public" / "must be owner of table".
-- CREATE só precisa GRANT CREATE; ALTER exige ownership.
--
-- Setup endpoints (/api/analytics/setup, /api/pipeline-runs/setup,
-- /api/organizations/setup) também rodam DDL idempotente sob mc_app pós-swap.
--
-- Solução: mc_app owner de todas tables/sequences/views do public no DB
-- mission_control. Role evolution permanece SUPERUSER + owner do DB; só
-- transfere ownership de objects-level.
--
-- Safety: DB mission_control é isolado; evolution-api/WhatsApp usa DB
-- evolution (shared postgres container, DB separado).

GRANT CREATE ON SCHEMA public TO mc_app;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO mc_app';
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
    EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO mc_app';
  END LOOP;
  FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public' LOOP
    EXECUTE 'ALTER VIEW public.' || quote_ident(r.table_name) || ' OWNER TO mc_app';
  END LOOP;
END $$;

-- Verify:
-- SELECT count(*) FILTER (WHERE tableowner='mc_app') AS owned, count(*) AS total
--   FROM pg_tables WHERE schemaname='public';
