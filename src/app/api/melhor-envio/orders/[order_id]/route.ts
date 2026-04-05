import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { order_id: string } }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getPool();
    const result = await db.query(
      `SELECT
        me_status,
        me_tracking_code,
        me_label_url,
        me_carrier,
        me_cost,
        me_delivery_address
       FROM ml_pedidos
       WHERE ml_order_id = $1
       LIMIT 1`,
      [params.order_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
