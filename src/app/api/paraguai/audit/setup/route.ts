import { NextRequest, NextResponse } from 'next/server';
import { getArbitragemPool } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getArbitragemPool();

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

  return NextResponse.json(
    { ok: true, message: 'paraguai_audit_log schema ready' },
    { status: 201 }
  );
}
