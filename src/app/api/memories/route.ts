import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getProjectScopeFromRequest(req);

  const search   = req.nextUrl.searchParams.get('q') ?? '';
  const agentId  = req.nextUrl.searchParams.get('agent_id') ?? '';
  const squadId  = req.nextUrl.searchParams.get('squad_id') ?? '';
  const category = req.nextUrl.searchParams.get('category') ?? '';

  const conditions = ['1=1'];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(m.content ILIKE $${params.length} OR m.tags ILIKE $${params.length})`);
  }
  if (agentId)  { params.push(agentId);  conditions.push(`m.agent_id = $${params.length}`); }
  if (squadId)  { params.push(squadId);  conditions.push(`m.squad_id = $${params.length}`); }
  if (category) { params.push(category); conditions.push(`m.category = $${params.length}`); }

  const rows = await query(`
    SELECT m.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
    FROM agent_memories m
    LEFT JOIN agents a ON a.id = m.agent_id
    LEFT JOIN squads s ON s.id = m.squad_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.created_at DESC
    LIMIT 200
  `, params, scope);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.projectId) {
    return NextResponse.json({ error: 'No active project in session' }, { status: 400 });
  }

  const { agent_id, squad_id, content, category = 'general', tags, source } = await req.json();
  if (!content || !squad_id) return NextResponse.json({ error: 'content and squad_id required' }, { status: 400 });

  const [row] = await query(
    `INSERT INTO agent_memories (agent_id, squad_id, content, category, tags, source, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [agent_id || null, squad_id, content, category, tags || null, source || null, session.projectId],
    { projectId: session.projectId }
  );
  return NextResponse.json(row, { status: 201 });
}
