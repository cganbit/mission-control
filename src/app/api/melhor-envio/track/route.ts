import { NextRequest, NextResponse } from 'next/server';
import { trackShipment } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/melhor-envio/track?orderId=
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const input = {
      projectId: session.project_id,
      orderId: sp.get('orderId') ?? '',
    };
    const result = await trackShipment(getPool(), input);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/track]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
