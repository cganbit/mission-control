import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/mercado-livre/clientes
// Lista clientes com histórico consolidado de pedidos
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q') ?? '';
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const offset = Number(searchParams.get('offset') ?? 0);

  try {
    const db = getPool();

    const whereClause = search
      ? `WHERE c.nome ILIKE $3 OR c.cpf ILIKE $3 OR c.telefone ILIKE $3`
      : '';
    const params: any[] = [limit, offset];
    if (search) params.push(`%${search}%`);

    const result = await db.query(
      `SELECT
        c.id,
        c.ml_buyer_id,
        c.nome,
        c.cpf,
        c.telefone,
        c.endereco_json,
        c.lead,
        c.created_at,
        c.updated_at,
        COUNT(p.id)::int AS total_pedidos,
        SUM(p.total)::numeric AS total_gasto,
        MAX(p.created_at) AS ultima_compra,
        MIN(p.created_at) AS primeira_compra,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'order_id', p.ml_order_id,
            'seller', p.seller_nickname,
            'items', p.items_json,
            'total', p.total,
            'status', p.status,
            'data', p.created_at
          ) ORDER BY p.created_at DESC
        ) AS pedidos
      FROM ml_clientes c
      LEFT JOIN ml_pedidos p ON p.ml_buyer_id = c.ml_buyer_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY MAX(p.created_at) DESC NULLS LAST
      LIMIT $1 OFFSET $2`,
      params
    );

    const total = await db.query(
      `SELECT COUNT(*)::int FROM ml_clientes c ${whereClause}`,
      search ? [`%${search}%`] : []
    );

    return NextResponse.json({
      clientes: result.rows,
      total: total.rows[0].count,
      limit,
      offset,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
