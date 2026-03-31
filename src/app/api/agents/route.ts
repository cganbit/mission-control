import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squadId = req.nextUrl.searchParams.get('squad_id');
  const params: unknown[] = [];
  const where = squadId ? (params.push(squadId), `WHERE a.squad_id = $1`) : '';

  const agents = await query(`
    SELECT a.*, s.name AS squad_name, s.color AS squad_color,
      COUNT(t.id) FILTER (WHERE t.status != 'done') AS open_tasks
    FROM agents a
    LEFT JOIN squads s ON s.id = a.squad_id
    LEFT JOIN tasks  t ON t.agent_id = a.id
    ${where}
    GROUP BY a.id, s.name, s.color
    ORDER BY s.name, a.name
  `, params);

  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { squad_id, name, role, system_prompt } = await req.json();
  if (!squad_id || !name) return NextResponse.json({ error: 'squad_id and name required' }, { status: 400 });

  const [agent] = await query(
    `INSERT INTO agents (squad_id, name, role, system_prompt)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [squad_id, name, role ?? null, system_prompt ?? null]
  );

  return NextResponse.json(agent, { status: 201 });
}
