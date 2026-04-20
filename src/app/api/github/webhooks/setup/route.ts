import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query(`
    CREATE TABLE IF NOT EXISTS github_issues (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id   BIGINT NOT NULL UNIQUE,
      project_id  UUID NOT NULL,
      repo        TEXT NOT NULL,
      number      INT NOT NULL,
      title       TEXT NOT NULL,
      state       TEXT NOT NULL,
      labels      JSONB NOT NULL DEFAULT '[]'::jsonb,
      body        TEXT,
      opened_at   TIMESTAMPTZ NOT NULL,
      closed_at   TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS github_prs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id   BIGINT NOT NULL UNIQUE,
      project_id  UUID NOT NULL,
      repo        TEXT NOT NULL,
      number      INT NOT NULL,
      title       TEXT NOT NULL,
      state       TEXT NOT NULL,
      labels      JSONB NOT NULL DEFAULT '[]'::jsonb,
      body        TEXT,
      head_ref    TEXT,
      base_ref    TEXT,
      opened_at   TIMESTAMPTZ NOT NULL,
      closed_at   TIMESTAMPTZ,
      merged_at   TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS github_webhook_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id   UUID NOT NULL,
      event_type   TEXT NOT NULL,
      delivery_id  TEXT NOT NULL,
      payload      JSONB NOT NULL,
      received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS github_issue_number INT`);
  await query(`ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS github_repo TEXT`);

  await query(`CREATE INDEX IF NOT EXISTS idx_github_issues_project_repo_number        ON github_issues(project_id, repo, number)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_github_prs_project_repo_number           ON github_prs(project_id, repo, number)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_github_webhook_events_project_received   ON github_webhook_events(project_id, received_at DESC)`);

  await query(`ALTER TABLE github_issues         ENABLE ROW LEVEL SECURITY`);
  await query(`ALTER TABLE github_issues         FORCE  ROW LEVEL SECURITY`);
  await query(`DROP POLICY IF EXISTS tenant_isolation ON github_issues`);
  await query(`
    CREATE POLICY tenant_isolation ON github_issues
      USING      (project_id = app.current_project_id() OR app.is_worker_bypass())
      WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass())
  `);

  await query(`ALTER TABLE github_prs            ENABLE ROW LEVEL SECURITY`);
  await query(`ALTER TABLE github_prs            FORCE  ROW LEVEL SECURITY`);
  await query(`DROP POLICY IF EXISTS tenant_isolation ON github_prs`);
  await query(`
    CREATE POLICY tenant_isolation ON github_prs
      USING      (project_id = app.current_project_id() OR app.is_worker_bypass())
      WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass())
  `);

  await query(`ALTER TABLE github_webhook_events ENABLE ROW LEVEL SECURITY`);
  await query(`ALTER TABLE github_webhook_events FORCE  ROW LEVEL SECURITY`);
  await query(`DROP POLICY IF EXISTS tenant_isolation ON github_webhook_events`);
  await query(`
    CREATE POLICY tenant_isolation ON github_webhook_events
      USING      (project_id = app.current_project_id() OR app.is_worker_bypass())
      WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass())
  `);

  return NextResponse.json(
    { ok: true, message: 'github webhooks schema ready' },
    { status: 201 }
  );
}
