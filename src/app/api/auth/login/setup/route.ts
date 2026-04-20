import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { hashPassword, ADMIN_PASSWORD } from '@/lib/auth';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query(INIT_SQL);

  // Bootstrap admin if users table is empty
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

  return NextResponse.json(
    { ok: true, message: 'auth/login schema ready' },
    { status: 201 }
  );
}
