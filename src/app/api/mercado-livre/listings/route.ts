import { NextRequest, NextResponse } from 'next/server';
import { listListings, updateListing, getMlAccounts } from '@wingx-app/api-ml';
import type { ListingsMlAccountsProvider } from '@wingx-app/api-ml';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const provider: ListingsMlAccountsProvider = {
  getMlAccounts: () => getMlAccounts(getPool()),
};

// GET /api/mercado-livre/listings?seller_id=X&status=active&offset=0&limit=50
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const sellerId = Number(sp.get('seller_id'));
  if (!sellerId) return NextResponse.json({ error: 'seller_id obrigatório' }, { status: 400 });

  try {
    const input = {
      sellerId,
      status: sp.get('status') ?? undefined,
      offset: Number(sp.get('offset') ?? 0),
      limit:  Math.min(Number(sp.get('limit') ?? 50), 50),
    };

    const result = await listListings(provider, input);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/mercado-livre/listings GET]', err);
    const status = err?.status ?? 500;
    if (status === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/mercado-livre/listings
// Body: { seller_id, item_id, price?, available_quantity?, title? }
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { seller_id, item_id, price, available_quantity, title } = body;
    if (!seller_id || !item_id) {
      return NextResponse.json({ error: 'seller_id e item_id obrigatórios' }, { status: 400 });
    }

    const result = await updateListing(provider, { seller_id, item_id, price, available_quantity, title });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/mercado-livre/listings PUT]', err);
    const status = err?.status ?? 500;
    if (status === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
