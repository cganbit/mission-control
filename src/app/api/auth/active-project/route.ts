import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, signToken } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { projectId?: unknown };
  if (typeof body.projectId !== 'string') {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  const projectId = body.projectId;

  const proj = await queryOne<{ owner_organization_id: string }>(
    `SELECT p.owner_organization_id
     FROM projects p
     JOIN organization_members om ON om.organization_id = p.owner_organization_id
     WHERE p.id = $1 AND p.deleted_at IS NULL AND om.user_id = $2`,
    [projectId, session.sub]
  );
  if (!proj) {
    return NextResponse.json({ error: 'Project not found or no membership' }, { status: 404 });
  }

  await query(
    'UPDATE users SET active_project_id = $1 WHERE id = $2',
    [projectId, session.sub]
  );

  const newToken = await signToken({
    sub: session.sub,
    sid: session.sid,
    username: session.username,
    name: session.name,
    role: session.role,
    projectId,
    organizationId: proj.owner_organization_id,
  });

  const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);
  const res = NextResponse.json({
    ok: true,
    projectId,
    organizationId: proj.owner_organization_id,
  });
  res.cookies.set('mc_token', newToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 60 * 60,
    path: '/',
  });
  return res;
}
