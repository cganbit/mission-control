import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  const [doc] = await query(
    `SELECT d.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
     FROM agent_documents d
     LEFT JOIN agents a ON a.id = d.agent_id
     LEFT JOIN squads s ON s.id = d.squad_id
     WHERE d.id = $1`, [id], scope
  );
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  await query('DELETE FROM agent_documents WHERE id = $1', [id], scope);
  return NextResponse.json({ ok: true });
}
