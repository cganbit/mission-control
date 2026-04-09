import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import crypto from 'crypto';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';

function checkAgentAuth(req: NextRequest): boolean {
  const key = req.headers.get('x-agent-key');
  return !!AGENT_KEY && key === AGENT_KEY;
}

// ─── GET /api/print-queue — agente local puxa jobs pendentes ─────────────────

export async function GET(req: NextRequest) {
  if (!checkAgentAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();
  const result = await db.query(
    `SELECT id, ml_order_id, ml_shipment_id, seller_nickname, status, created_at
     FROM print_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 10`
  );

  return NextResponse.json({ jobs: result.rows });
}

// ─── DELETE /api/print-queue — limpar fila (requer QUEUE_KEY) ────────────────

export async function DELETE(req: NextRequest) {
  // Accept x-queue-key header (preferred) or query param (backward compat)
  const key = req.headers.get('x-queue-key') ?? req.nextUrl.searchParams.get('key');
  if (!key || key !== (process.env.QUEUE_KEY ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let statusFilter: string | undefined;
  try {
    const body = await req.json();
    statusFilter = body.status;
  } catch { /* body opcional */ }

  const allowed = ['queued', 'error', 'pending'];
  const statuses = statusFilter && allowed.includes(statusFilter) ? [statusFilter] : allowed;

  const db = getPool();
  const result = await db.query(
    `DELETE FROM print_queue WHERE status = ANY($1) RETURNING id`,
    [statuses]
  );

  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}

// ─── POST /api/print-queue — cria job (chamado internamente pelo webhook) ─────

export async function POST(req: NextRequest) {
  // Aceita session JWT (dashboard) ou x-internal-key (chamada interna)
  const session = await getSessionFromRequest(req);
  const isDashboard = !!(session && hasRole(session, 'member'));
  const authHeader = req.headers.get('x-internal-key');
  const internalKey = process.env.INTERNAL_API_KEY ?? '';
  const isInternal = !!internalKey && authHeader === internalKey;
  if (!isDashboard && !isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ml_order_id, ml_shipment_id, seller_nickname, immediate } = await req.json();
  if (!ml_order_id) {
    return NextResponse.json({ error: 'ml_order_id required' }, { status: 400 });
  }

  // immediate=true (dashboard click) → pending (agent picks up right away)
  // immediate=false (webhook) → queued (user selects in /fila)
  const initialStatus = immediate ? 'pending' : 'queued';
  const token = crypto.randomBytes(20).toString('hex');
  const db = getPool();

  // Enriquecer com dados de ml_pedidos (logistic_type, buyer_name)
  const pedido = await db.query(
    `SELECT logistic_type, shipment_id FROM ml_pedidos WHERE ml_order_id = $1 LIMIT 1`,
    [ml_order_id]
  );
  const logisticType = pedido.rows[0]?.logistic_type ?? null;
  const shipmentId = ml_shipment_id ?? pedido.rows[0]?.shipment_id ?? null;

  await db.query(
    `INSERT INTO print_queue (ml_order_id, ml_shipment_id, seller_nickname, token, status, logistic_type, origin)
     VALUES ($1, $2, $3, $4, $5, $6, 'mercadolivre')
     ON CONFLICT DO NOTHING`,
    [ml_order_id, shipmentId, seller_nickname ?? null, token, initialStatus, logisticType]
  );

  const row = await db.query(
    `SELECT id, token FROM print_queue WHERE ml_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [ml_order_id]
  );

  return NextResponse.json({ ok: true, token: row.rows[0]?.token });
}
