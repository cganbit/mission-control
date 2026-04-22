import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { retriggerJob } from '@wingx-app/api-print';

// POST /api/print-queue/retrigger — reativa jobs queued/error pelo dashboard
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ids?: number[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const ids: number[] = Array.isArray(body?.ids) ? body.ids.slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  const db = getPool();
  const result = await retriggerJob(db, ids);
  return NextResponse.json({ ok: true, activated: result.activated });
}
