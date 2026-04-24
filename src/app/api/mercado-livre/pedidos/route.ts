import { NextRequest, NextResponse } from 'next/server';
import { listPedidos } from '@wingx-app/api-ml';
import type { ShippingGroup } from '@wingx-app/api-ml';

const VALID_SHIPPING: readonly ShippingGroup[] = ['full', 'flex', 'me', 'proprio'];
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/mercado-livre/pedidos?account=&status=&from=&to=&limit=
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const rawShip = sp.get('shipping');
    const shipping = rawShip && (VALID_SHIPPING as readonly string[]).includes(rawShip)
      ? (rawShip as ShippingGroup)
      : undefined;
    const input = {
      account: sp.get('account') ?? '',
      status:  sp.get('status')  ?? '',
      from:    sp.get('from')    ?? '',
      to:      sp.get('to')      ?? '',
      shipping,
      limit:   Math.min(parseInt(sp.get('limit') ?? '100', 10), 500),
    };

    const db = getPool();
    const result = await listPedidos(db, input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/pedidos]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
