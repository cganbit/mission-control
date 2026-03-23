import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';

// ─── PATCH /api/print-queue/[id]/done — agente marca job como concluído ───────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  if (!AGENT_KEY || key !== AGENT_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { error_msg } = (await req.json().catch(() => ({}))) as { error_msg?: string };
  const newStatus = error_msg ? 'error' : 'done';

  const db = getPool();
  await db.query(
    `UPDATE print_queue
     SET status = $1, error_msg = $2, updated_at = NOW()
     WHERE id = $3`,
    [newStatus, error_msg ?? null, id]
  );

  return NextResponse.json({ ok: true, status: newStatus });
}
