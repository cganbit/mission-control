// TODO F7 Fase 3: refactor to use MlAccountsProvider from @wingx-app/api-ml once
// oauth/token-refresh functions are extracted (PRD-036 F7 Fase 3). Kept as-is for now.
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

const ML_API = 'https://api.mercadolibre.com';
const MC_URL = process.env.MC_URL ?? 'https://mc.wingx.app.br';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getPool();

  // Buscar conta
  const accRow = await db.query(
    `SELECT seller_id, nickname FROM ml_account_configs WHERE id = $1`, [id]
  );
  if (!accRow.rows[0]) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });

  const { seller_id, nickname } = accRow.rows[0];

  // Buscar token da conta
  const tokenRow = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!tokenRow.rows[0]) return NextResponse.json({ error: 'ml_tokens_json não encontrado' }, { status: 500 });
  const parsed = JSON.parse(tokenRow.rows[0].value);
  const accounts: Array<{ seller_id: number; access_token: string }> = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  const account = accounts.find(a => Number(a.seller_id) === Number(seller_id));
  if (!account) return NextResponse.json({ error: `Token não encontrado para ${nickname}` }, { status: 404 });

  // Buscar último pedido pago
  const mlRes = await fetch(
    `${ML_API}/orders/search?seller=${seller_id}&order.status=paid&sort=date_desc&limit=1`,
    { headers: { Authorization: `Bearer ${account.access_token}` }, signal: AbortSignal.timeout(10000) }
  );
  if (!mlRes.ok) return NextResponse.json({ error: `ML API ${mlRes.status}` }, { status: 502 });
  const mlData = await mlRes.json();
  const lastOrder = mlData.results?.[0];
  if (!lastOrder) return NextResponse.json({ error: 'Nenhum pedido pago encontrado' }, { status: 404 });

  // Disparar webhook interno
  const webhookRes = await fetch(`${MC_URL}/api/mercado-livre/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'orders_v2',
      resource: `/orders/${lastOrder.id}`,
      user_id: Number(seller_id),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const webhookData = await webhookRes.json().catch(() => ({}));

  return NextResponse.json({
    ok: true,
    order_id: lastOrder.id,
    total: lastOrder.total_amount,
    webhook: webhookData,
  });
}
