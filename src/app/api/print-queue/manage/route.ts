import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

const QUEUE_KEY = process.env.QUEUE_KEY ?? '';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  // Accept QUEUE_KEY via header (preferred) or query param (backward compat)
  const key = req.headers.get('x-queue-key') ?? req.nextUrl.searchParams.get('key');
  if (!!QUEUE_KEY && key === QUEUE_KEY) return true;
  const session = await getSessionFromRequest(req);
  return !!session;
}

// GET /api/print-queue/manage — lista jobs das últimas 48h
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  const db = getPool();
  const result = await db.query(`
    SELECT id, ml_order_id, ml_shipment_id, seller_nickname,
           status, error_msg, created_at, updated_at,
           items_summary, logistic_type, buyer_name, has_label,
           token, qr_code_url
    FROM print_queue
    WHERE created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at DESC
  `);

  return NextResponse.json({ jobs: result.rows });
}

// POST /api/print-queue/manage?key=XXX
// action: 'activate' (default) — queued → pending
// action: 'reprint'            — done/error → queued
export async function POST(req: NextRequest) {
  if (!await checkAuth(req)) return unauthorized();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: 'ids array required' }, { status: 400 });

  const action: string = ['reprint', 'delete'].includes(body?.action) ? body.action : 'activate';
  const db = getPool();

  if (action === 'delete') {
    const result = await db.query(
      `DELETE FROM print_queue WHERE id = ANY($1::int[]) RETURNING id`,
      [ids]
    );
    return NextResponse.json({ ok: true, deleted: result.rowCount ?? 0 });
  }

  if (action === 'reprint') {
    const result = await db.query(
      `UPDATE print_queue
       SET status = 'queued', error_msg = NULL, updated_at = NOW()
       WHERE id = ANY($1::int[]) AND status IN ('done', 'error')
       RETURNING id`,
      [ids]
    );
    return NextResponse.json({ ok: true, requeued: result.rowCount ?? 0 });
  }

  const result = await db.query(
    `UPDATE print_queue
     SET status = 'pending', updated_at = NOW()
     WHERE id = ANY($1::int[]) AND status = 'queued'
     RETURNING id`,
    [ids]
  );

  return NextResponse.json({ ok: true, activated: result.rowCount ?? 0 });
}
