import { NextRequest, NextResponse } from 'next/server';
import { backfillPedidos } from '@wingx-app/api-ml';
import { getPool } from '@/lib/db';
import { getMlAccounts } from '@/lib/ml-tokens';

// POST /api/mercado-livre/pedidos/backfill
// Protected by x-worker-key
export async function POST(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const expectedKey = process.env.MC_WORKER_KEY;
  if (!expectedKey || workerKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getPool();
    const provider = { getMlAccounts };
    const result = await backfillPedidos(db, provider);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/mercado-livre/pedidos/backfill]', err);
    const status = err?.status ?? 500;
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status });
  }
}
