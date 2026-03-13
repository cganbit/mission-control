import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const squad = await queryOne('SELECT * FROM squads WHERE id = $1', [id]);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(squad);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { name, description, mission, color } = await req.json();

  const [squad] = await query(
    `UPDATE squads SET
      name        = COALESCE($1, name),
      description = COALESCE($2, description),
      mission     = COALESCE($3, mission),
      color       = COALESCE($4, color)
     WHERE id = $5 RETURNING *`,
    [name, description, mission, color, id]
  );
  return NextResponse.json(squad);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await query('DELETE FROM squads WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
