import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

const JARVIS_BRIDGE_URL = process.env.JARVIS_BRIDGE_URL ?? 'http://187.77.43.141:3010';
const JARVIS_SECRET = process.env.JARVIS_SECRET ?? 'jarvis-2026';
const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

// POST /api/jarvis/task — dispara pipeline (auth: sessão)
// Body: { task: string, task_id?: string, squad_id?: string, workdir?: string }
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { task, task_id, squad_id, workdir } = await req.json();
  if (!task || typeof task !== 'string') {
    return NextResponse.json({ error: 'task is required' }, { status: 400 });
  }

  const res = await fetch(`${JARVIS_BRIDGE_URL}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jarvis-secret': JARVIS_SECRET,
    },
    body: JSON.stringify({ task, task_id, squad_id, workdir }),
    signal: AbortSignal.timeout(10000), // bridge responde 202 imediato — timeout curto
  });

  const data = await res.json();
  // Repassar status real do bridge (202 = queued, 5xx = erro)
  return NextResponse.json(data, { status: res.ok ? res.status : 502 });
}

// PATCH /api/jarvis/task — Jarvis reporta conclusão (auth: x-worker-key)
// Body: { task_id: string, status: string, commit_hash?: string }
export async function PATCH(req: NextRequest) {
  if (req.headers.get('x-worker-key') !== WORKER_KEY || !WORKER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { query } = await import('@/lib/db');
  const { task_id, status, commit_hash } = await req.json();
  if (!task_id || !status) return NextResponse.json({ error: 'task_id and status required' }, { status: 400 });

  await query(
    `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, task_id]
  );

  if (commit_hash) {
    await query(
      `INSERT INTO activity_log (action, detail) VALUES ('jarvis_done', $1)`,
      [`task ${task_id} → ${status} | commit: ${commit_hash}`]
    ).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
