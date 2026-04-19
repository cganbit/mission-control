-- ============================================================================
-- Migration: 20260419-multi-tenant-schema (forward)
-- PRD-035 Week 5 — C1 slicing (multi-tenant core, schema only)
-- Ref: wingx-platform/knowledge/plans/week5-multi-tenant-slicing.md
--
-- Escopo C1:
--   1. Cria 3 tabelas: organizations, organization_members, projects
--   2. Seed: org Paraguai + project Paraguai (idempotente via ON CONFLICT)
--   3. Backfill: todos users active viram organization_members da org Paraguai
--      com role preservada do users.role atual (admin/member/viewer)
--   4. Add project_id NOT NULL DEFAULT Paraguai em 9 tabelas escopáveis
--      (pipeline_runs + harness_health_scores já tinham desde Week 1)
--   5. FK project_id → projects(id) ON DELETE RESTRICT em 11 tabelas
--
-- Fora de escopo C1 (virá em fases posteriores):
--   - RLS policies + get_current_company_id() helper           → C2
--   - Endpoints /api/organizations, /api/projects + UI         → C3
--   - ALTER COLUMN project_id DROP DEFAULT (force explicit)    → C3
--   - Migrar users.role pra "platform_role" (platform_admin)   → C3
--   - Org invitations via email, billing, quota                → pós-v1.0
--
-- Idempotência: CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT,
--   ALTER TABLE ADD COLUMN IF NOT EXISTS, DO blocks pra ADD CONSTRAINT.
-- Re-rodar é safe — produz o mesmo estado final.
--
-- UUIDs canônicos (hardcoded pra idempotência + referência cross-migration):
--   Organization Paraguai:  00000000-0000-0000-0000-000000000010
--   Project Paraguai:       00000000-0000-0000-0000-000000000001
--     (reuso do UUID já presente em pipeline_runs.project_id desde Week 1)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Tabela organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(50) NOT NULL,
  name        TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_live
  ON organizations(slug)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. Tabela organization_members (user ↔ org with role per-org)
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON organization_members(organization_id);

-- ============================================================================
-- 3. Tabela projects (owned by organization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                   VARCHAR(50) NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  deleted_at             TIMESTAMPTZ NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_org_live
  ON projects(owner_organization_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. Seed: organização + project Paraguai (idempotente)
-- ============================================================================
INSERT INTO organizations (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000010'::uuid, 'paraguai', 'Paraguai Arbitrage')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, owner_organization_id, slug, name, description)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  'paraguai',
  'Paraguai',
  'Projeto principal de arbitragem (migrado de UUID hardcoded Week 1 PRD-035 D14)'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Backfill organization_members: todos users active viram members da
--    org Paraguai com role preservada do users.role.
--    users.role CHECK atual = ('admin','member','viewer'). organization_members.role
--    CHECK = ('owner','admin','member','viewer'). Intersecção compatível (role
--    'owner' fica pra atribuição manual pós-migration pelo Cleiton).
-- ============================================================================
INSERT INTO organization_members (organization_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000010'::uuid,
  id,
  role
FROM users
WHERE active = TRUE
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- ============================================================================
-- 6. Add project_id NOT NULL DEFAULT Paraguai em 9 tabelas escopáveis
--    (pipeline_runs, harness_health_scores já têm desde Week 1)
-- ============================================================================
ALTER TABLE squads            ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE agents            ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE tasks             ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE activity_log      ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE token_usage       ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE agent_memories    ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE agent_documents   ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE pipeline_steps    ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE pipeline_log_events ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- 7. Backfill defensivo: se alguma row escapou dos defaults (edge case de
--    INSERT que setou project_id = NULL violando o NOT NULL? não deveria,
--    mas cinto+suspensório), normaliza pra Paraguai.
-- ============================================================================
UPDATE pipeline_runs         SET project_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM projects);
UPDATE harness_health_scores SET project_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM projects);

-- ============================================================================
-- 8. FK constraints project_id → projects(id) ON DELETE RESTRICT
--    DO $$ ... EXCEPTION pattern pra idempotência (ALTER TABLE ADD CONSTRAINT
--    não suporta IF NOT EXISTS direto).
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE pipeline_runs          ADD CONSTRAINT fk_pipeline_runs_project          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE harness_health_scores  ADD CONSTRAINT fk_harness_health_scores_project  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE squads                 ADD CONSTRAINT fk_squads_project                 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agents                 ADD CONSTRAINT fk_agents_project                 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE tasks                  ADD CONSTRAINT fk_tasks_project                  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activity_log           ADD CONSTRAINT fk_activity_log_project           FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE token_usage            ADD CONSTRAINT fk_token_usage_project            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_memories         ADD CONSTRAINT fk_agent_memories_project         FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_documents        ADD CONSTRAINT fk_agent_documents_project        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pipeline_steps         ADD CONSTRAINT fk_pipeline_steps_project         FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pipeline_log_events    ADD CONSTRAINT fk_pipeline_log_events_project    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 9. Indexes em project_id pras 9 tabelas novas (pipeline_runs + harness já
--    têm idx_pipeline_runs_project / idx_harness_health_project desde Week 1)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_squads_project              ON squads(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_project              ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project               ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project        ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_project         ON token_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project      ON agent_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_documents_project     ON agent_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_project      ON pipeline_steps(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_log_events_project ON pipeline_log_events(project_id);

COMMIT;

-- ============================================================================
-- Verificação pós-migration (rode manualmente se desejar):
--
-- SELECT COUNT(*) AS orgs              FROM organizations;                     -- expect 1
-- SELECT COUNT(*) AS projects          FROM projects;                          -- expect 1
-- SELECT COUNT(*) AS members           FROM organization_members;              -- expect = count(users WHERE active)
-- SELECT COUNT(*) FILTER (WHERE role='admin')  AS admins,
--        COUNT(*) FILTER (WHERE role='member') AS members_role,
--        COUNT(*) FILTER (WHERE role='viewer') AS viewers
--   FROM organization_members;
-- SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_%_project' ORDER BY conname;  -- expect 11
-- ============================================================================
