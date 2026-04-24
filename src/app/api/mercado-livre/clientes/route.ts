import { NextRequest, NextResponse } from 'next/server';
import { listClientes, updateClienteNotas } from '@wingx-app/api-ml';
import type { ShippingGroup } from '@wingx-app/api-ml';

const VALID_SHIPPING: readonly ShippingGroup[] = ['full', 'flex', 'me', 'proprio'];
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { safeDecrypt } from '@/lib/crypto';

const cryptoAdapter = { safeDecrypt };

// GET /api/mercado-livre/clientes?search=nome&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sp = req.nextUrl.searchParams;
    const rawShip = sp.get('shipping');
    const shipping = rawShip && (VALID_SHIPPING as readonly string[]).includes(rawShip)
      ? (rawShip as ShippingGroup)
      : undefined;
    const input = {
      search: sp.get('search') ?? undefined,
      page:   Math.max(1, Number(sp.get('page')  ?? 1)),
      limit:  Math.min(Number(sp.get('limit') ?? 20), 200),
      shipping,
    };

    const db = getPool();
    const result = await listClientes(db, input, cryptoAdapter);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/clientes GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/mercado-livre/clientes
// Body: { ml_buyer_id: number, notas: string }
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { ml_buyer_id, notas } = await req.json();
    if (!ml_buyer_id) {
      return NextResponse.json({ error: 'ml_buyer_id obrigatório' }, { status: 400 });
    }

    const db = getPool();
    const found = await updateClienteNotas(db, { ml_buyer_id, notas });
    if (!found) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/mercado-livre/clientes PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
