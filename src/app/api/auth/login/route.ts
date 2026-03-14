import { NextRequest, NextResponse } from 'next/server';
import { signToken, hashPassword, verifyPassword, ADMIN_PASSWORD } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import crypto from 'crypto';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255),
  password_hash VARCHAR(200) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','member','viewer')),
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE TABLE IF NOT EXISTS access_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  username   VARCHAR(50) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  action     VARCHAR(20) NOT NULL CHECK (action IN ('login','logout')),
  ip         VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function ensureTable() {
  await query(INIT_SQL);
}

async function bootstrapAdmin(): Promise<void> {
  const count = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM users');
  if (count && Number(count.c) === 0) {
    const hash = hashPassword(ADMIN_PASSWORD);
    await query(
      `INSERT INTO users (username, name, password_hash, role)
       VALUES ('admin', 'Administrador', $1, 'admin')
       ON CONFLICT DO NOTHING`,
      [hash]
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { username?: string; password?: string };
  const username = (body.username ?? '').toLowerCase().trim();
  const password = body.password ?? '';

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuário e senha obrigatórios' }, { status: 400 });
  }

  await ensureTable();
  await bootstrapAdmin();

  const user = await queryOne<{
    id: string; username: string; name: string; email: string | null;
    password_hash: string; role: string; active: boolean;
  }>('SELECT * FROM users WHERE username = $1', [username]);

  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 });
  }

  // Update last_login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

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
  });

  const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);
  const res = NextResponse.json({ ok: true, role: user.role, name: user.name });
  res.cookies.set('mc_token', token, {
    httpOnly: true,
    secure: false,
    maxAge: SESSION_HOURS * 60 * 60,
    path: '/',
  });
  return res;
}
