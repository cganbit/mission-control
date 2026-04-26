import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
  if (!session && !isWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = isWorker ? { worker: true } : await getProjectScopeFromRequest(req);

  const squads = await query(`
    SELECT s.*,
      COUNT(DISTINCT a.id) AS agent_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done' AND t.type = 'task') AS open_tasks,
      COUNT(DISTINCT t.id) FILTER (WHERE t.type = 'sprint') AS sprint_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.type IN ('task','subtask')) AS total_tasks,
      COUNT(DISTINCT t.id) FILTER (WHERE t.type IN ('task','subtask') AND t.status = 'done') AS done_tasks
    FROM squads s
    LEFT JOIN agents a ON a.squad_id = s.id
    LEFT JOIN tasks t  ON t.squad_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at
  `, [], scope);

  return NextResponse.json(squads);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = !session && req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
  if (!session && !isWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, mission, color } = body;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

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

  const [squad] = await query(
    `INSERT INTO squads (name, description, mission, color, project_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, description ?? null, mission ?? null, color ?? '#6366f1', projectId],
    scope
  );

  return NextResponse.json(squad, { status: 201 });
}
