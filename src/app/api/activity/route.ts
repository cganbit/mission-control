import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squadId = req.nextUrl.searchParams.get('squad_id');
  const limit   = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 200);

  const params: unknown[] = [];
  const where = squadId ? (params.push(squadId), `WHERE al.squad_id = $1`) : '';
  params.push(limit);
  const limitIdx = params.length;

  const activities = await query(`
    SELECT al.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
    FROM activity_log al
    LEFT JOIN agents a ON a.id = al.agent_id
    LEFT JOIN squads s ON s.id = al.squad_id
    ${where}
    ORDER BY al.timestamp DESC
    LIMIT $${limitIdx}
  `, params);

  return NextResponse.json(activities);
}
