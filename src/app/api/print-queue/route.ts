import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { listQueue, enqueueJob, deleteQueue } from '@wingx-app/api-print';

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
  const jobs = await listQueue(db);
  return NextResponse.json({ jobs });
}

// ─── DELETE /api/print-queue — limpar fila (requer QUEUE_KEY) ────────────────

export async function DELETE(req: NextRequest) {
  const key = req.headers.get('x-queue-key') ?? req.nextUrl.searchParams.get('key');
  if (!key || key !== (process.env.QUEUE_KEY ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let statusFilter: string | undefined;
  try {
    const body = await req.json();
    statusFilter = body.status;
  } catch { /* body opcional */ }

  const db = getPool();
  const result = await deleteQueue(db, { status: statusFilter });
  return NextResponse.json({ deleted: result.deleted });
}

// ─── POST /api/print-queue — cria job (chamado internamente pelo webhook) ─────

export async function POST(req: NextRequest) {
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

  const db = getPool();
  const result = await enqueueJob(db, { ml_order_id, ml_shipment_id, seller_nickname, immediate });
  return NextResponse.json({ ok: true, token: result.token });
}
