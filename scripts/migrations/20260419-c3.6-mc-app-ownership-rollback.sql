-- PRD-035 C3.6 rollback — Revert ownership de public schema pra evolution.
-- Aplicar se precisar voltar DATABASE_URL pra role evolution.

REVOKE CREATE ON SCHEMA public FROM mc_app;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'mc_app' LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO evolution';
  END LOOP;
  FOR r IN SELECT s.sequence_name FROM information_schema.sequences s
           JOIN pg_class c ON c.relname = s.sequence_name
           WHERE s.sequence_schema = 'public' AND pg_get_userbyid(c.relowner) = 'mc_app' LOOP
    EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO evolution';
  END LOOP;
  FOR r IN SELECT v.table_name FROM information_schema.views v
           JOIN pg_class c ON c.relname = v.table_name
           WHERE v.table_schema = 'public' AND pg_get_userbyid(c.relowner) = 'mc_app' LOOP
    EXECUTE 'ALTER VIEW public.' || quote_ident(r.table_name) || ' OWNER TO evolution';
  END LOOP;
END $$;
