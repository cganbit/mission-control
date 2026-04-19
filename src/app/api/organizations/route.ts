import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import crypto from 'node:crypto';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return 'slug deve ser string';
  if (!SLUG_RE.test(slug)) return 'slug invalido (lowercase, alnum + hyphen, 3-50 chars, nao pode comecar/terminar com hyphen)';
  return null;
}

function validateName(name: unknown): string | null {
  if (typeof name !== 'string') return 'name deve ser string';
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return 'name deve ter 3-100 chars';
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgs = await query(
    `SELECT o.id, o.slug, o.name, o.created_at, om.role AS member_role
     FROM organization_members om
     JOIN organizations o ON o.id = om.organization_id AND o.deleted_at IS NULL
     WHERE om.user_id = $1
     ORDER BY o.created_at ASC`,
    [session.sub]
  );

  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { slug?: unknown; name?: unknown };
  const slugErr = validateSlug(body.slug);
  const nameErr = validateName(body.name);
  if (slugErr || nameErr) {
    return NextResponse.json({ error: slugErr ?? nameErr }, { status: 400 });
  }

  const slug = body.slug as string;
  const name = (body.name as string).trim();

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM organizations WHERE slug = $1 AND deleted_at IS NULL',
    [slug]
  );
  if (existing) {
    return NextResponse.json({ error: `slug ja existe: ${slug}` }, { status: 409 });
  }

  const orgId = crypto.randomUUID();
  await query(
    `INSERT INTO organizations (id, slug, name) VALUES ($1, $2, $3)`,
    [orgId, slug, name]
  );
  await query(
    `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [orgId, session.sub]
  );

  return NextResponse.json(
    { id: orgId, slug, name, member_role: 'owner' },
    { status: 201 }
  );
}
