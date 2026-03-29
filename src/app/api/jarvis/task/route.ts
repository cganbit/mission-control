import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

const N8N_JARVIS_WEBHOOK = process.env.N8N_JARVIS_WEBHOOK ?? 'http://evolution-api-h4pg-n8n-1:5678/webhook/jarvis-task';

// POST /api/jarvis/task
// Body: { task: string, workdir?: string }
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { task, workdir } = await req.json();
  if (!task || typeof task !== 'string') {
    return NextResponse.json({ error: 'task is required' }, { status: 400 });
  }

  const res = await fetch(N8N_JARVIS_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, workdir }),
    signal: AbortSignal.timeout(240000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
