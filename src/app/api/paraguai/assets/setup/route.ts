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
    CREATE TABLE IF NOT EXISTS paraguai_assets (
      id BIGSERIAL PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      titulo TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      preco_usd NUMERIC(10,2) NOT NULL,
      fornecedor TEXT,
      data_compra DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'comprado' CHECK (status IN ('comprado','em_transito','em_estoque','vendido','cancelado')),
      preco_venda_brl NUMERIC(10,2),
      data_venda DATE,
      observacoes TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_assets_fingerprint ON paraguai_assets(fingerprint)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_assets_status ON paraguai_assets(status)`);

  return NextResponse.json(
    { ok: true, message: 'paraguai_assets schema ready' },
    { status: 201 }
  );
}
