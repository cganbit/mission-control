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

  await db.query(`ALTER TABLE preco_ml_cache ADD COLUMN IF NOT EXISTS ml_enriched_json JSONB`).catch(() => {});

  return NextResponse.json(
    { ok: true, message: 'preco_ml_cache.ml_enriched_json ready' },
    { status: 201 }
  );
}
