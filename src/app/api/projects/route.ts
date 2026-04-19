import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import crypto from 'node:crypto';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgIdFilter = req.nextUrl.searchParams.get('organization_id');

  const sql = `
    SELECT p.id, p.slug, p.name, p.owner_organization_id, p.created_at,
           o.slug AS org_slug, o.name AS org_name,
           om.role AS member_role
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id AND o.deleted_at IS NULL
    JOIN projects p ON p.owner_organization_id = om.organization_id AND p.deleted_at IS NULL
    WHERE om.user_id = $1
      ${orgIdFilter ? 'AND om.organization_id = $2' : ''}
    ORDER BY o.created_at ASC, p.created_at ASC
  `;
  const params = orgIdFilter ? [session.sub, orgIdFilter] : [session.sub];
  const projects = await query(sql, params);

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    organization_id?: unknown; slug?: unknown; name?: unknown;
  };
  if (typeof body.organization_id !== 'string') {
    return NextResponse.json({ error: 'organization_id obrigatorio' }, { status: 400 });
  }
  if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
    return NextResponse.json({ error: 'slug invalido' }, { status: 400 });
  }
  if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.trim().length > 100) {
    return NextResponse.json({ error: 'name deve ter 3-100 chars' }, { status: 400 });
  }

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [body.organization_id, session.sub]
  );
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden — owner/admin required' }, { status: 403 });
  }

  const dup = await queryOne<{ id: string }>(
    `SELECT id FROM projects WHERE owner_organization_id = $1 AND slug = $2 AND deleted_at IS NULL`,
    [body.organization_id, body.slug]
  );
  if (dup) return NextResponse.json({ error: `slug ja existe na org` }, { status: 409 });

  const projectId = crypto.randomUUID();
  await query(
    `INSERT INTO projects (id, owner_organization_id, slug, name)
     VALUES ($1, $2, $3, $4)`,
    [projectId, body.organization_id, body.slug, body.name.trim()]
  );

  return NextResponse.json(
    { id: projectId, slug: body.slug, name: body.name.trim(), owner_organization_id: body.organization_id },
    { status: 201 }
  );
}
