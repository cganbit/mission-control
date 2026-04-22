import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = getProjectScopeFromSession(session);

  const url = req.nextUrl;
  const repo = url.searchParams.get('repo');
  const eventType = url.searchParams.get('event_type');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (repo) { conditions.push(`repo = $${idx++}`); params.push(repo); }
  if (eventType) { conditions.push(`event_type = $${idx++}`); params.push(eventType); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, totalRow] = await Promise.all([
    query(
      `SELECT id, project_id, event_type, delivery_id, classification, received_at
       FROM github_webhook_events
       ${where}
       ORDER BY received_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
      scope
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM github_webhook_events ${where}`,
      params,
      scope
    ),
  ]);

  return NextResponse.json({
    items: rows,
    total: parseInt(totalRow?.count ?? '0', 10),
    page,
    limit,
  });
}
