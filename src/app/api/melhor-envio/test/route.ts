import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
// GET /api/melhor-envio/test
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const result = await testConnection();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/melhor-envio/test]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
