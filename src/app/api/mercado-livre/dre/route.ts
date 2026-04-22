import { NextRequest, NextResponse } from 'next/server';
import { computeDRE } from '@wingx-app/api-ml';
import { getSessionFromRequest } from '@/lib/auth';
import { getMlAccounts } from '@/lib/ml-tokens';

const provider = { getMlAccounts };

// GET /api/mercado-livre/dre?seller_id=X&from=...&to=...
// seller_id é opcional — se omitido, retorna DRE de todas as contas
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sp = req.nextUrl.searchParams;
    const sellerIdParam = sp.get('seller_id');
    const input = {
      sellerId: sellerIdParam ? Number(sellerIdParam) : undefined,
      from:     sp.get('from') ?? undefined,
      to:       sp.get('to')   ?? undefined,
    };

    const result = await computeDRE(provider, input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/dre]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
