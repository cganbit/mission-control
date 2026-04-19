import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

async function getMembership(orgId: string, userId: string) {
  return queryOne<{ role: string }>(
    `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
}

function canWrite(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const org = await queryOne<{
    id: string; slug: string; name: string; created_at: string; deleted_at: string | null;
  }>(
    'SELECT id, slug, name, created_at, deleted_at FROM organizations WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const membership = await getMembership(id, session.sub);
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ ...org, member_role: membership.role });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const membership = await getMembership(id, session.sub);
  if (!canWrite(membership?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { name?: unknown };
  if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.trim().length > 100) {
    return NextResponse.json({ error: 'name deve ter 3-100 chars' }, { status: 400 });
  }

  const updated = await queryOne<{ id: string; slug: string; name: string }>(
    `UPDATE organizations SET name = $1 WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, slug, name`,
    [body.name.trim(), id]
  );
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const membership = await getMembership(id, session.sub);
  if (membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — only owner can delete' }, { status: 403 });
  }

  const res = await queryOne<{ id: string }>(
    `UPDATE organizations SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (!res) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true, id: res.id });
}
