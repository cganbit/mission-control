import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

// ─── GET /api/sre/health — último status de cada check (leitura do banco) ────

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();
  const result = await db.query(
    `SELECT id, service, check_name, enabled, last_checked_at, last_status, last_error
     FROM sre_checks
     ORDER BY service, check_name`
  );

  return NextResponse.json({ checks: result.rows });
}
