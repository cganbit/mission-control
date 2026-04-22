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
    const input = {
      projectId: session.project_id,
      status: sp.get('status') ?? '',
      limit: Math.min(parseInt(sp.get('limit') ?? '100', 10), 500),
      offset: parseInt(sp.get('offset') ?? '0', 10),
    };
    const result = await listOrders(getPool(), input);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/orders]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
