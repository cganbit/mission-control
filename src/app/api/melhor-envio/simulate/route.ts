import { NextRequest, NextResponse } from 'next/server';
import { calculateShipping } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
// POST /api/melhor-envio/simulate
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const result = await calculateShipping(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/simulate]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
