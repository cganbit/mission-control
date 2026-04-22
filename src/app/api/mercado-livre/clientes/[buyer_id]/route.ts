import { NextRequest, NextResponse } from 'next/server';
import { getCliente } from '@wingx-app/api-ml';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { safeDecrypt } from '@/lib/crypto';

const cryptoAdapter = { safeDecrypt };

// GET /api/mercado-livre/clientes/[buyer_id]
// Retorna perfil completo: dados do cliente + lojas compradas + histórico de pedidos
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buyer_id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { buyer_id } = await params;
  const buyerId = Number(buyer_id);
  if (!buyerId || isNaN(buyerId)) {
    return NextResponse.json({ error: 'buyer_id inválido' }, { status: 400 });
  }

  try {
    const db = getPool();
    const result = await getCliente(db, { buyerId }, cryptoAdapter);
    if (!result) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/clientes/[buyer_id]]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
