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
    CREATE TABLE IF NOT EXISTS catalog_refresh_queue (
      id SERIAL PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      product_name TEXT NOT NULL,
      min_price NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
      requested_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      error_detail TEXT,
      UNIQUE(fingerprint)
    )
  `);
  await db.query(`ALTER TABLE catalog_refresh_queue ADD COLUMN IF NOT EXISTS error_detail TEXT`).catch(() => {});

  // preco_ml_cache extensions previously done inline in processJobInline (hot-path DDL).
  await db.query(`
    ALTER TABLE preco_ml_cache
      ADD COLUMN IF NOT EXISTS ml_catalog_id    TEXT,
      ADD COLUMN IF NOT EXISTS ml_catalog_url   TEXT,
      ADD COLUMN IF NOT EXISTS ml_catalogs_json JSONB,
      ADD COLUMN IF NOT EXISTS ml_price_premium NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS ml_price_classic NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS ml_shipping_type TEXT
  `).catch(() => {});

  return NextResponse.json(
    { ok: true, message: 'catalog_refresh_queue + preco_ml_cache schema ready' },
    { status: 201 }
  );
}
