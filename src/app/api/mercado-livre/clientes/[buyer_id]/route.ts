import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { safeDecrypt } from '@/lib/crypto';

// GET /api/mercado-livre/clientes/[buyer_id]
// Retorna perfil completo: dados do cliente + lojas compradas + histórico de pedidos
export async function GET(
  req: NextRequest,
  { params }: { params: { buyer_id: string } }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const buyerId = Number(params.buyer_id);
  if (!buyerId || isNaN(buyerId)) {
    return NextResponse.json({ error: 'buyer_id inválido' }, { status: 400 });
  }

  try {
    const db = getPool();

    // 1. Dados do cliente
    const clienteResult = await db.query(
      `SELECT
        id, ml_buyer_id, nome, cpf, telefone, email,
        COALESCE(notas, '') AS notas,
        created_at
       FROM ml_clientes
       WHERE ml_buyer_id = $1`,
      [buyerId]
    );

    if (clienteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const clienteRaw = clienteResult.rows[0];
    const cliente = {
      ...clienteRaw,
      cpf: safeDecrypt(clienteRaw.cpf),
      telefone: safeDecrypt(clienteRaw.telefone),
      email: safeDecrypt(clienteRaw.email),
    };

    // 2. Pedidos agrupados por loja
    const lojasResult = await db.query(
      `SELECT
        seller_nickname,
        COUNT(*)::int                          AS total_pedidos,
        COALESCE(SUM(total_amount), 0)::numeric AS total_gasto
       FROM ml_pedidos
       WHERE ml_buyer_id = $1
       GROUP BY seller_nickname
       ORDER BY total_pedidos DESC`,
      [buyerId]
    );

    // 3. Histórico completo de pedidos com flag de etiqueta
    const pedidosResult = await db.query(
      `SELECT
        p.id,
        p.ml_order_id,
        p.seller_nickname,
        p.items_json,
        p.total_amount,
        p.status,
        COALESCE(p.logistic_type, 'me2') AS logistic_type,
        p.ml_shipment_id,
        p.created_at,
        CASE WHEN EXISTS(
          SELECT 1 FROM print_queue pq
          WHERE pq.ml_order_id = p.ml_order_id AND pq.status = 'done'
        ) THEN true ELSE false END AS has_label
       FROM ml_pedidos p
       WHERE p.ml_buyer_id = $1
       ORDER BY p.created_at DESC`,
      [buyerId]
    );

    // Para pedidos com etiqueta, buscar o print_queue_id para montar a URL
    const pedidosComLabel = await Promise.all(
      pedidosResult.rows.map(async (pedido) => {
        if (!pedido.has_label) return pedido;

        const pqResult = await db.query(
          `SELECT id FROM print_queue
           WHERE ml_order_id = $1 AND status = 'done'
           LIMIT 1`,
          [pedido.ml_order_id]
        );

        const pqId = pqResult.rows[0]?.id ?? null;
        return {
          ...pedido,
          label_url: pqId ? `/labels/${pqId}.pdf` : null,
        };
      })
    );

    return NextResponse.json({
      cliente,
      lojas_compradas: lojasResult.rows,
      pedidos: pedidosComLabel,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
