import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query } from '@/lib/db';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS connector_configs (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function ensureTable() {
  await query(INIT_SQL);
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensureTable();
  const rows = await query<{ key: string; value: string; updated_at: string }>('SELECT * FROM connector_configs');
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return NextResponse.json(map);
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await ensureTable();
  const body = await req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    await query(
      `INSERT INTO connector_configs (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
  }
  return NextResponse.json({ ok: true });
}
