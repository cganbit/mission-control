import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';

async function ensureTable(db: any) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS paraguai_audit_log (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      fingerprint TEXT,
      detail JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_fingerprint ON paraguai_audit_log(fingerprint)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON paraguai_audit_log(created_at DESC)`);
}

// GET — lista auditoria (opcional: ?fingerprint=X&limit=100)
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fingerprint = searchParams.get('fingerprint');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);

  const db = getArbitragemPool();
  await ensureTable(db);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (fingerprint) {
    conditions.push(`fingerprint = $${pi++}`);
    params.push(fingerprint);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const result = await db.query(
    `SELECT id, username, action, fingerprint, detail, created_at
     FROM paraguai_audit_log
     ${where}
     ORDER BY created_at DESC
     LIMIT $${pi}`,
    params
  );

  return NextResponse.json(result.rows);
}

// POST — registrar evento de auditoria
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { action: string; fingerprint?: string; detail?: Record<string, unknown> };
  try {
    body = await req.json();
    if (!body.action) throw new Error('action obrigatório');
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 });
  }

  const db = getArbitragemPool();
  await ensureTable(db);

  await db.query(
    `INSERT INTO paraguai_audit_log (username, action, fingerprint, detail)
     VALUES ($1, $2, $3, $4)`,
    [session.username, body.action, body.fingerprint ?? null, JSON.stringify(body.detail ?? {})]
  );

  return NextResponse.json({ ok: true });
}
