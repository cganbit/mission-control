import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

const JARVIS_BRIDGE_URL = process.env.JARVIS_BRIDGE_URL ?? 'http://187.77.43.141:3010';
const JARVIS_SECRET = process.env.JARVIS_SECRET ?? 'jarvis-2026';

// POST /api/jarvis/task
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
    signal: AbortSignal.timeout(240000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
