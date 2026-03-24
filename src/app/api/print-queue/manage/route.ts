import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const QUEUE_KEY = process.env.QUEUE_KEY ?? '';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkKey(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get('key');
  return !!QUEUE_KEY && key === QUEUE_KEY;
}

// GET /api/print-queue/manage?key=XXX — lista jobs das últimas 48h
export async function GET(req: NextRequest) {
  if (!checkKey(req)) return unauthorized();

  const db = getPool();
  const result = await db.query(`
    SELECT id, ml_order_id, ml_shipment_id, seller_nickname,
           status, error_msg, created_at, updated_at,
           items_summary, logistic_type, buyer_name, has_label
    FROM print_queue
    WHERE created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at DESC
  `);

  return NextResponse.json({ jobs: result.rows });
}

// POST /api/print-queue/manage?key=XXX — ativa jobs em massa (queued → pending)
export async function POST(req: NextRequest) {
  if (!checkKey(req)) return unauthorized();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: 'ids array required' }, { status: 400 });

  const db = getPool();
  const result = await db.query(
    `UPDATE print_queue
     SET status = 'pending', updated_at = NOW()
     WHERE id = ANY($1::int[]) AND status = 'queued'
     RETURNING id`,
    [ids]
  );

  return NextResponse.json({ ok: true, activated: result.rowCount ?? 0 });
}
