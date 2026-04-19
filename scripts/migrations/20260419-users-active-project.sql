-- Migration: users.active_project_id for session-based project scope (C3.1)
-- PRD-035 Sec 9 D39 (fallback_user_project_resolution)
--
-- Adds users.active_project_id NULL → last selected project via switcher (C3.4).
-- Backfill: resolves via organization_members earliest by created_at → first project
-- of that org (earliest by created_at). In current prod state (Paraguai only),
-- all users get Paraguai project UUID 00000000-0000-0000-0000-000000000001.
--
-- Apply via: ssh root@VPS "docker exec -i evolution-api-h4pg-postgres-1 \
--   psql -U mc_app -d mission_control" < 20260419-users-active-project.sql
-- Rollback: same method with 20260419-users-active-project-rollback.sql

BEGIN;

-- Add column (idempotent via IF NOT EXISTS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_project_id UUID NULL
  REFERENCES projects(id) ON DELETE SET NULL;

-- Backfill for existing active users without active_project_id set
UPDATE users u
SET active_project_id = (
  SELECT p.id
  FROM organization_members om
  JOIN projects p ON p.owner_organization_id = om.organization_id
  WHERE om.user_id = u.id
    AND p.deleted_at IS NULL
  ORDER BY om.created_at ASC, p.created_at ASC
  LIMIT 1
)
WHERE u.active = TRUE
  AND u.active_project_id IS NULL;

-- Verify: every active user now has an active_project_id
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM users
  WHERE active = TRUE AND active_project_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % active users without active_project_id', orphan_count;
  END IF;
END $$;

COMMIT;

-- Post-apply smoke:
-- SELECT u.username, u.active_project_id, p.slug
-- FROM users u LEFT JOIN projects p ON p.id = u.active_project_id
-- WHERE u.active = TRUE ORDER BY u.username;
