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

  if (account) { conditions.push(`seller_nickname = $${i++}`); values.push(account); }
  if (status) { conditions.push(`status = $${i++}`); values.push(status); }
  if (from) { conditions.push(`created_at >= $${i++}`); values.push(from); }
  if (to) { conditions.push(`created_at < $${i++}`); values.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const db = getPool();
  const result = await db.query(
    `SELECT id, ml_order_id, ml_shipment_id, seller_nickname,
            status, error_msg, created_at, updated_at,
            items_summary, logistic_type, buyer_name, has_label
     FROM print_queue
     ${where}
     ORDER BY created_at DESC
     LIMIT $${i}`,
    values
  );

  // Lista de contas para o filtro
  const accounts = await db.query(
    `SELECT DISTINCT seller_nickname FROM print_queue WHERE seller_nickname IS NOT NULL ORDER BY seller_nickname`
  );

  return NextResponse.json({ jobs: result.rows, accounts: accounts.rows.map((r: { seller_nickname: string }) => r.seller_nickname) });
}
