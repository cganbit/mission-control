import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole, hashPassword } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await query<{
    id: string; username: string; name: string; email: string | null;
    role: string; active: boolean; created_at: string; last_login: string | null;
  }>('SELECT id, username, name, email, role, active, created_at, last_login FROM users ORDER BY created_at');

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { username, name, email, password, role } = await req.json() as {
    username: string; name: string; email?: string; password: string; role: string;
  };

  if (!username || !name || !password || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios: username, name, password, role' }, { status: 400 });
  }

  const normalizedUsername = username.toLowerCase().trim();
  const hash = hashPassword(password);

  try {
    const [user] = await query<{ id: string }>(
      `INSERT INTO users (username, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [normalizedUsername, name, email ?? null, hash, role]
    );
    return NextResponse.json({ ok: true, id: user.id }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique')) return NextResponse.json({ error: 'Username já existe' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
