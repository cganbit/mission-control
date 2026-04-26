import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole, verifyWorkerKey } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = !session && verifyWorkerKey(req);
  if (session && !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!session && !isWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = isWorker ? { worker: true } : await getProjectScopeFromRequest(req);

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
  `, params, scope);

  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = !session && verifyWorkerKey(req);
  if (!session && !isWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { squad_id, name, role, system_prompt, tools, workflow } = body;
  if (!squad_id || !name) return NextResponse.json({ error: 'squad_id and name required' }, { status: 400 });

  // Resolve project_id: session takes precedence; worker accepts body.project_id
  // OR falls back to first project (single-tenant assumption).
  let projectId = session?.projectId ?? body.project_id;
  if (isWorker && !projectId) {
    const [proj] = await query(`SELECT id FROM projects ORDER BY created_at LIMIT 1`, [], { worker: true });
    projectId = proj?.id;
  }
  if (!projectId) {
    return NextResponse.json({ error: 'No active project (provide project_id in body or login)' }, { status: 400 });
  }

  const scope = isWorker ? { worker: true } : { projectId };

  const [agent] = await query(
    `INSERT INTO agents (squad_id, name, role, system_prompt, tools, workflow, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [squad_id, name, role ?? null, system_prompt ?? null, tools ?? null, workflow ?? null, projectId],
    scope
  );

  return NextResponse.json(agent, { status: 201 });
}
