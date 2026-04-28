import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { activateJob, reprintJob, deleteJob48h } from '@wingx-app/api-print';

const QUEUE_KEY = process.env.QUEUE_KEY ?? '';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-queue-key') ?? req.nextUrl.searchParams.get('key');
  if (!!QUEUE_KEY && key === QUEUE_KEY) return true;
  const session = await getSessionFromRequest(req);
  return !!session;
}

// GET /api/print-queue/manage — lista jobs das últimas 48h
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  const db = getPool();
  const result = await db.query<{
    id: number;
    ml_order_id: string;
    ml_shipment_id: string | null;
    seller_nickname: string;
    status: string;
    error_msg: string | null;
    created_at: string;
    updated_at: string;
    items_summary: string | null;
    logistic_type: string | null;
    buyer_name: string | null;
    has_label: boolean;
    token: string | null;
    qr_code_url: string | null;
    payment_status: string | null;
  }>(`
    SELECT pq.id, pq.ml_order_id, pq.ml_shipment_id, pq.seller_nickname,
           pq.status, pq.error_msg, pq.created_at, pq.updated_at,
           pq.items_summary, pq.logistic_type, pq.buyer_name, pq.has_label,
           pq.token, pq.qr_code_url,
           mp.status AS payment_status
    FROM print_queue pq
    LEFT JOIN ml_pedidos mp ON pq.ml_order_id = mp.ml_order_id
    WHERE pq.created_at > NOW() - INTERVAL '48 hours'
    ORDER BY pq.created_at DESC
  `);
  return NextResponse.json({ jobs: result.rows });
}

// POST /api/print-queue/manage?key=XXX
// action: 'activate' (default) — queued → pending
// action: 'reprint'            — done/error → queued
// action: 'delete'             — hard delete
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: 'ids array required' }, { status: 400 });

  const action: string = ['reprint', 'delete'].includes(body?.action) ? body.action : 'activate';
  const db = getPool();

  if (action === 'delete') {
    const result = await deleteJob48h(db, ids);
    return NextResponse.json({ ok: true, deleted: result.deleted });
  }

  if (action === 'reprint') {
    const result = await reprintJob(db, ids);
    return NextResponse.json({ ok: true, requeued: result.requeued });
  }

  const result = await activateJob(db, ids);
  return NextResponse.json({ ok: true, activated: result.activated });
}
