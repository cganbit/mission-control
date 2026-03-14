import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const agent = await queryOne('SELECT * FROM agents WHERE id = $1', [id]);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(agent);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const [agent] = await query(
    `UPDATE agents SET
      name          = COALESCE($1, name),
      role          = COALESCE($2, role),
      status        = COALESCE($3, status),
      system_prompt = COALESCE($4, system_prompt),
      tools         = COALESCE($5, tools),
      workflow      = COALESCE($6, workflow),
      last_heartbeat = CASE WHEN $3 = 'active' THEN NOW() ELSE last_heartbeat END
     WHERE id = $7 RETURNING *`,
    [body.name, body.role, body.status, body.system_prompt, body.tools, body.workflow, id]
  );
  return NextResponse.json(agent);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await query('DELETE FROM agents WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
