import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// POST /api/melhor-envio/cancel
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const input = { projectId: session.project_id, ...body };
    const result = await cancelOrder(getPool(), input);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/cancel]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
