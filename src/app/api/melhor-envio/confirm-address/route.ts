import { NextRequest, NextResponse } from 'next/server';
import { confirmAddress, getAddress } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/melhor-envio/confirm-address
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const order_id = req.nextUrl.searchParams.get('order_id') ?? '';
    const result = await getAddress(getPool(), { order_id });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/confirm-address GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/melhor-envio/confirm-address
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const result = await confirmAddress(getPool(), body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/confirm-address PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
