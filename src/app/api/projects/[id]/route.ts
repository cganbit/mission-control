import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  owner_organization_id: string;
  created_at: string;
  deleted_at: string | null;
}

async function getProject(id: string): Promise<ProjectRow | null> {
  return queryOne<ProjectRow>(
    'SELECT id, slug, name, owner_organization_id, created_at, deleted_at FROM projects WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
}

async function getMembershipRole(orgId: string, userId: string): Promise<string | null> {
  const row = await queryOne<{ role: string }>(
    `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  return row?.role ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getMembershipRole(project.owner_organization_id, session.sub);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ ...project, member_role: role });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getMembershipRole(project.owner_organization_id, session.sub);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — owner/admin required' }, { status: 403 });
  }

  const body = await req.json() as { name?: unknown };
  if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.trim().length > 100) {
    return NextResponse.json({ error: 'name deve ter 3-100 chars' }, { status: 400 });
  }

  const updated = await queryOne<{ id: string; slug: string; name: string }>(
    `UPDATE projects SET name = $1 WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, slug, name`,
    [body.name.trim(), id]
  );
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getMembershipRole(project.owner_organization_id, session.sub);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — owner/admin required' }, { status: 403 });
  }

  await query(`UPDATE projects SET deleted_at = NOW() WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true, id });
}
