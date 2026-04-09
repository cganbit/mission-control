import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

// ─── GET /api/sre/health — último status de cada check (leitura do banco) ────

export async function GET(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = WORKER_KEY && workerKey === WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session || !hasRole(session, 'member')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getPool();
  const result = await db.query(
    `SELECT id, service, check_name, enabled, last_checked_at, last_status, last_error
     FROM sre_checks
     ORDER BY service, check_name`
  );

  return NextResponse.json({ checks: result.rows });
}
