import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ order_id: string }> }) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY && WORKER_KEY !== '';
  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order_id } = await params;
  const db = getPool();

  try {
    const body = await req.json();
    const { cep, rua, numero, complemento, bairro, cidade, estado, nome, telefone } = body;

    if (!cep || !rua || !cidade || !estado) {
      return NextResponse.json({ error: 'Campos obrigatórios: cep, rua, cidade, estado' }, { status: 400 });
    }

    // Validar CEP (8 dígitos)
    const cleanCep = String(cep).replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      return NextResponse.json({ error: 'CEP inválido (8 dígitos)' }, { status: 400 });
    }

    const address = {
      cep: cleanCep,
      rua,
      numero: numero || 'S/N',
      complemento: complemento || '',
      bairro: bairro || '',
      cidade,
      estado: String(estado).toUpperCase().slice(0, 2),
      nome: nome || '',
      telefone: telefone || '',
    };

    const result = await db.query(
      `UPDATE ml_pedidos
       SET me_delivery_address = $1,
           me_status = CASE
             WHEN me_status IN ('pending', 'pending_address') THEN 'address_confirmed'
             ELSE me_status
           END
       WHERE ml_order_id = $2
       RETURNING me_status, me_delivery_address`,
      [JSON.stringify(address), order_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...result.rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — buscar endereço atual + dados do pedido ML para auto-fill
export async function GET(req: NextRequest, { params }: { params: Promise<{ order_id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { order_id } = await params;
  const db = getPool();

  try {
    const result = await db.query(
      `SELECT me_delivery_address, me_status, seller_id, seller_nickname
       FROM ml_pedidos WHERE ml_order_id = $1 LIMIT 1`,
      [order_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const row = result.rows[0];

    // Tentar buscar endereço da API ML se não temos endereço confirmado
    if (!row.me_delivery_address) {
      // Buscar token: por seller_id ou por nickname
      let token: string | null = null;
      if (row.seller_id) {
        const tokenRow = await db.query(
          `SELECT access_token FROM ml_tokens_json WHERE seller_id = $1 LIMIT 1`,
          [row.seller_id]
        );
        token = tokenRow.rows[0]?.access_token ?? null;
      }
      if (!token && row.seller_nickname) {
        const tokenRow = await db.query(
          `SELECT access_token FROM ml_tokens_json WHERE nickname = $1 LIMIT 1`,
          [row.seller_nickname]
        );
        token = tokenRow.rows[0]?.access_token ?? null;
      }
      if (!token) {
        // Fallback: pegar qualquer token ativo
        const tokenRow = await db.query(
          `SELECT access_token FROM ml_tokens_json ORDER BY updated_at DESC LIMIT 1`
        );
        token = tokenRow.rows[0]?.access_token ?? null;
      }

      if (token) {
        try {
          const mlRes = await fetch(`https://api.mercadolibre.com/orders/${order_id}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          });
          if (mlRes.ok) {
            const mlOrder = await mlRes.json();
            const ship = mlOrder?.shipping?.receiver_address;
            if (ship) {
              return NextResponse.json({
                me_delivery_address: null,
                me_status: row.me_status,
                ml_address: {
                  cep: ship.zip_code,
                  rua: ship.street_name,
                  numero: ship.street_number,
                  complemento: ship.comment || '',
                  bairro: ship.neighborhood?.name || '',
                  cidade: ship.city?.name || '',
                  estado: ship.state?.id?.replace('BR-', '') || '',
                  nome: mlOrder.buyer?.nickname || '',
                },
              });
            }
          }
        } catch { /* ML API fallback — return without ml_address */ }
      }
    }

    return NextResponse.json({
      me_delivery_address: row.me_delivery_address,
      me_status: row.me_status,
      ml_address: null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
