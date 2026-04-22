import { NextRequest, NextResponse } from 'next/server';
import { sendTracking } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// POST /api/melhor-envio/send-tracking
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const result = await sendTracking(getPool(), { order_id: body.order_id });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/send-tracking]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
