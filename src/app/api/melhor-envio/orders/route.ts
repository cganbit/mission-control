import { NextRequest, NextResponse } from 'next/server';
import { listOrders } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/melhor-envio/orders?status=&limit=&offset=
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const order_id = sp.get('order_id') ?? '';
    const result = await listOrders(getPool(), { order_id });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/orders]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
