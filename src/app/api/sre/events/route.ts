import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

const PERIOD_MAP: Record<string, string> = {
  '2h': '2 hours',
  '24h': '24 hours',
  '7d': '7 days',
};

// ─── GET — lista eventos do audit log ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const type    = searchParams.get('type')   || null;
  const status  = searchParams.get('status') || null;
  const seller  = searchParams.get('seller') || null;
  const period  = searchParams.get('period') || '24h';
  const page    = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit   = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const offset  = (page - 1) * limit;

  const interval = PERIOD_MAP[period] ?? '24 hours';

  const db = getPool();

  const [eventsRes, totalRes, errorsRes] = await Promise.all([
    db.query(
      `SELECT * FROM mc_audit_log
       WHERE ($1::text IS NULL OR event_type = $1)
         AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR seller_nickname = $3)
         AND created_at > NOW() - $4::interval
       ORDER BY created_at DESC
       LIMIT $5 OFFSET $6`,
      [type, status, seller, interval, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM mc_audit_log
       WHERE ($1::text IS NULL OR event_type = $1)
         AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR seller_nickname = $3)
         AND created_at > NOW() - $4::interval`,
      [type, status, seller, interval]
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM mc_audit_log
       WHERE status = 'error'
         AND created_at > NOW() - INTERVAL '2 hours'`
    ),
  ]);

  return NextResponse.json({
    events: eventsRes.rows,
    total: totalRes.rows[0]?.total ?? 0,
    has_errors_last_2h: (errorsRes.rows[0]?.cnt ?? 0) > 0,
  });
}
