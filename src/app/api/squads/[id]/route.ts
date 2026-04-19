import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  const squad = await queryOne('SELECT * FROM squads WHERE id = $1', [id], scope);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(squad);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  const { name, description, mission, color } = await req.json();

  const [squad] = await query(
    `UPDATE squads SET
      name        = COALESCE($1, name),
      description = COALESCE($2, description),
      mission     = COALESCE($3, mission),
      color       = COALESCE($4, color)
     WHERE id = $5 RETURNING *`,
    [name, description, mission, color, id],
    scope
  );
  return NextResponse.json(squad);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  await query('DELETE FROM squads WHERE id = $1', [id], scope);
  return NextResponse.json({ ok: true });
}
