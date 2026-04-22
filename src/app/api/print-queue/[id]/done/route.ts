import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { markJobDone } from '@wingx-app/api-print';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';

// ─── PATCH /api/print-queue/[id]/done — agente marca job como concluído ───────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  if (!AGENT_KEY || key !== AGENT_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { error_msg } = (await req.json().catch(() => ({}))) as { error_msg?: string };

  const db = getPool();
  const result = await markJobDone(db, { jobId: Number(id), error_msg });
  return NextResponse.json({ ok: result.ok, status: result.status });
}
