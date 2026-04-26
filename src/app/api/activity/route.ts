import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyWorkerKey } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = !session && verifyWorkerKey(req);
  if (!session && !isWorker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = isWorker ? { worker: true } : await getProjectScopeFromRequest(req);

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
  `, params, scope);

  return NextResponse.json(activities);
}

// PRD-041 §13.3 D7 — activity events emission. Used by wingx-platform telemetry
// (graphs/_shared/telemetry.mjs) to record agent_started, task_done, agent_stopped.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = !session && verifyWorkerKey(req);
  if (!session && !isWorker) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { squad_id, agent_id, action, detail } = body;
  if (!squad_id || !action) {
    return NextResponse.json({ error: 'squad_id and action required' }, { status: 400 });
  }

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

  const [activity] = await query(
    `INSERT INTO activity_log (squad_id, agent_id, action, detail, project_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [squad_id, agent_id ?? null, action, detail ?? null, projectId],
    scope
  );

  return NextResponse.json(activity, { status: 201 });
}
