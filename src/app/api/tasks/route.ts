import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const squadId = req.nextUrl.searchParams.get('squad_id');
  const status  = req.nextUrl.searchParams.get('status');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (squadId) { params.push(squadId); conditions.push(`t.squad_id = $${params.length}`); }
  if (status)  { params.push(status);  conditions.push(`t.status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const tasks = await query(`
    SELECT t.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
    FROM tasks t
    LEFT JOIN agents a ON a.id = t.agent_id
    LEFT JOIN squads s ON s.id = t.squad_id
    ${where}
    ORDER BY t.created_at DESC
  `, params);

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { squad_id, agent_id, title, description, priority, due_date } = await req.json();
  if (!squad_id || !title) return NextResponse.json({ error: 'squad_id and title required' }, { status: 400 });

  const [task] = await query(
    `INSERT INTO tasks (squad_id, agent_id, title, description, priority, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'user') RETURNING *`,
    [squad_id, agent_id || null, title, description || null, priority || 'medium', due_date || null]
  );

  // Log activity
  await query(
    `INSERT INTO activity_log (squad_id, agent_id, action, detail)
     VALUES ($1, $2, 'task_created', $3)`,
    [squad_id, agent_id ?? null, `Tarefa criada: ${title}`]
  );

  return NextResponse.json(task, { status: 201 });
}
