import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

// PRD-035 Week 5 C1 — multi-tenant core schema.
// Roda o SQL canônico em scripts/migrations/20260419-multi-tenant-schema.sql.
// Source-of-truth é o SQL file; esta route é thin wrapper pra aplicar via deploy.
//
// Idempotente: CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT, ADD COLUMN
// IF NOT EXISTS, DO blocks nas FKs. Re-rodar é safe.
const MIGRATION_FILE = '20260419-multi-tenant-schema.sql';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sqlPath = join(process.cwd(), 'scripts', 'migrations', MIGRATION_FILE);
    const sql = readFileSync(sqlPath, 'utf-8');
    await query(sql);

    const [{ org_count }] = await query<{ org_count: string }>(
      `SELECT COUNT(*)::text AS org_count FROM organizations`
    );
    const [{ project_count }] = await query<{ project_count: string }>(
      `SELECT COUNT(*)::text AS project_count FROM projects`
    );
    const [{ member_count }] = await query<{ member_count: string }>(
      `SELECT COUNT(*)::text AS member_count FROM organization_members`
    );

    return NextResponse.json(
      {
        ok: true,
        message: 'Multi-tenant schema applied',
        migration: MIGRATION_FILE,
        counts: {
          organizations: Number(org_count),
          projects: Number(project_count),
          organization_members: Number(member_count),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Migration failed', detail: message },
      { status: 500 }
    );
  }
}
