import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const userId = url.searchParams.get('user_id');

  // Returns login events joined with their corresponding logout events (if any)
  // Duration = difference between login and logout of same session_id
  const rows = await query<{
    id: string;
    user_id: string | null;
    username: string;
    session_id: string;
    action: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    logout_at: string | null;
    duration_minutes: number | null;
  }>(`
    SELECT
      l.id,
      l.user_id,
      l.username,
      l.session_id,
      l.action,
      l.ip,
      l.user_agent,
      l.created_at,
      o.created_at AS logout_at,
      CASE
        WHEN o.created_at IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (o.created_at - l.created_at)) / 60)
        ELSE NULL
      END AS duration_minutes
    FROM access_logs l
    LEFT JOIN access_logs o
      ON o.session_id = l.session_id AND o.action = 'logout'
    WHERE l.action = 'login'
      ${userId ? 'AND l.user_id = $2' : ''}
    ORDER BY l.created_at DESC
    LIMIT $1
  `, userId ? [limit, userId] : [limit]);

  return NextResponse.json(rows);
}
