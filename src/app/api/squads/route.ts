import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const squads = await query(`
    SELECT s.*,
      COUNT(DISTINCT a.id) AS agent_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done') AS open_tasks
    FROM squads s
    LEFT JOIN agents a ON a.squad_id = s.id
    LEFT JOIN tasks t  ON t.squad_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at
  `);

  return NextResponse.json(squads);
}

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description, mission, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const [squad] = await query(
    `INSERT INTO squads (name, description, mission, color)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, description ?? null, mission ?? null, color ?? '#6366f1']
  );

  return NextResponse.json(squad, { status: 201 });
}
