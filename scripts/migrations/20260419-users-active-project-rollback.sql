-- Rollback: remove users.active_project_id (C3.1)
-- Safe: column is nullable, ON DELETE SET NULL — no dependents.

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS active_project_id;

COMMIT;
