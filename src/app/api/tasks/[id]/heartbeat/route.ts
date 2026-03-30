import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

// PATCH /api/tasks/[id]/heartbeat — Jarvis reporta progresso de uma task
// Body: { status?: string, tokens_used?: number }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status, tokens_used } = await req.json();

  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];

  if (status) { values.push(status); updates.push(`status = $${values.length}`); }
  if (tokens_used != null) { values.push(tokens_used); updates.push(`tokens_used = $${values.length}`); }

  values.push(id);
  await query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

  return NextResponse.json({ ok: true });
}
