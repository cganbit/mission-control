import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

// GET /api/mercado-livre/pedidos?account=&status=&from=&to=&limit=
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const account = sp.get('account') ?? '';
  const status = sp.get('status') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const limit = Math.min(parseInt(sp.get('limit') ?? '100', 10), 500);

  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (account) { conditions.push(`p.seller_nickname = $${i++}`); values.push(account); }
  if (status) { conditions.push(`p.status = $${i++}`); values.push(status); }
  if (from) { conditions.push(`p.created_at >= $${i++}`); values.push(from); }
  if (to) { conditions.push(`p.created_at < $${i++}`); values.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const db = getPool();
  const result = await db.query(
    `SELECT p.id, p.ml_order_id, p.shipment_id AS ml_shipment_id, p.seller_nickname,
            p.status, p.items_json, p.total, p.logistic_type, p.listing_type,
            p.shipping_status, p.ml_buyer_id, p.created_at, p.updated_at,
            pq.status AS print_status, pq.has_label, pq.buyer_name, pq.error_msg
     FROM ml_pedidos p
     LEFT JOIN print_queue pq ON pq.ml_order_id = p.ml_order_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${i}`,
    values
  );

  // Lista de contas para o filtro
  const accounts = await db.query(
    `SELECT DISTINCT seller_nickname FROM ml_pedidos WHERE seller_nickname IS NOT NULL ORDER BY seller_nickname`
  );

  return NextResponse.json({ orders: result.rows, accounts: accounts.rows.map((r: { seller_nickname: string }) => r.seller_nickname) });
}
