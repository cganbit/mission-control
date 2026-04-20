import { NextRequest, NextResponse } from 'next/server';
import { signToken, verifyPassword } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import crypto from 'crypto';

// Schema + admin bootstrap moved to /api/auth/login/setup (invoked by deploy.yml).

export async function POST(req: NextRequest) {
  const body = await req.json() as { username?: string; password?: string };
  const username = (body.username ?? '').toLowerCase().trim();
  const password = body.password ?? '';

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuário e senha obrigatórios' }, { status: 400 });
  }

  const user = await queryOne<{
    id: string; username: string; name: string; email: string | null;
    password_hash: string; role: string; active: boolean;
    active_project_id: string | null;
  }>('SELECT * FROM users WHERE username = $1', [username]);

  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 });
  }

  // Update last_login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  // Resolve active project + organization (C3.1 session-based scope)
  let projectId: string | null = user.active_project_id ?? null;
  let organizationId: string | null = null;

  if (!projectId) {
    const resolved = await queryOne<{ project_id: string; org_id: string }>(
      `SELECT p.id AS project_id, om.organization_id AS org_id
       FROM organization_members om
       JOIN projects p ON p.owner_organization_id = om.organization_id
       WHERE om.user_id = $1 AND p.deleted_at IS NULL
       ORDER BY om.created_at ASC, p.created_at ASC LIMIT 1`,
      [user.id]
    );
    if (resolved) {
      projectId = resolved.project_id;
      organizationId = resolved.org_id;
      await query(
        'UPDATE users SET active_project_id = $1 WHERE id = $2',
        [projectId, user.id]
      );
    }
  } else {
    const proj = await queryOne<{ owner_organization_id: string }>(
      'SELECT owner_organization_id FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );
    if (proj) {
      organizationId = proj.owner_organization_id;
    } else {
      // Stale active_project_id (project deleted) — clear and re-resolve next login
      await query('UPDATE users SET active_project_id = NULL WHERE id = $1', [user.id]);
      projectId = null;
    }
  }

  // Generate session id for access log pairing
  const sessionId = crypto.randomUUID();

  // Log access
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? '';
  await query(
    `INSERT INTO access_logs (user_id, username, session_id, action, ip, user_agent)
     VALUES ($1, $2, $3, 'login', $4, $5)`,
    [user.id, user.username, sessionId, ip, ua]
  );

  const token = await signToken({
    sub: user.id,
    sid: sessionId,
    username: user.username,
    name: user.name,
    role: user.role as 'admin' | 'member' | 'viewer',
    ...(projectId ? { projectId } : {}),
    ...(organizationId ? { organizationId } : {}),
  });

  const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);
  const res = NextResponse.json({ ok: true, role: user.role, name: user.name });
  res.cookies.set('mc_token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_HOURS * 60 * 60,
    path: '/',
  });
  return res;
}
