import { NextRequest, NextResponse } from 'next/server';
import { getBalance } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
// GET /api/melhor-envio/balance
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await getBalance();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/balance]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
