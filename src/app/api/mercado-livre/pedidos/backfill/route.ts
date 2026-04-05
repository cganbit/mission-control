import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const ML_API = 'https://api.mercadolibre.com';

async function getTokensAsync(): Promise<Array<{ seller_id: number; nickname: string; access_token: string }>> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return [];
  const parsed = JSON.parse(row.rows[0].value);
  return Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
}

async function mlGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ML API ${res.status}`);
  return res.json();
}

// POST /api/mercado-livre/pedidos/backfill
// Protected by x-worker-key
export async function POST(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const expectedKey = process.env.MC_WORKER_KEY;
  if (!expectedKey || workerKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();
  const accounts = await getTokensAsync();
  if (accounts.length === 0) {
    return NextResponse.json({ error: 'No ML accounts configured' }, { status: 500 });
  }

  // Get orders that need backfill
  const { rows: orders } = await db.query(
    `SELECT ml_order_id, seller_nickname, shipment_id
     FROM ml_pedidos
     WHERE logistic_type IS NULL OR listing_type IS NULL OR shipping_status IS NULL
     ORDER BY created_at DESC`
  );

  const results: Array<{ order_id: string; status: string; detail?: string }> = [];
  let updated = 0;
  let errors = 0;

  for (const order of orders) {
    const account = accounts.find(a => a.nickname === order.seller_nickname);
    if (!account) {
      results.push({ order_id: order.ml_order_id, status: 'skip', detail: 'account not found' });
      continue;
    }

    try {
      // Fetch order from ML API
      const mlOrder = await mlGet(`${ML_API}/orders/${order.ml_order_id}`, account.access_token);

      let logisticType = mlOrder.shipping?.logistic_type ?? null;
      const listingType = mlOrder.order_items?.[0]?.listing_type_id ?? null;

      // Fetch shipment for shipping_status + logistic_type
      let shippingStatus: string | null = null;
      const shipmentId = mlOrder.shipping?.id ?? order.shipment_id;
      if (shipmentId) {
        try {
          const shipment = await mlGet(`${ML_API}/shipments/${shipmentId}`, account.access_token);
          shippingStatus = shipment?.status ?? null;
          if (!logisticType) logisticType = shipment?.logistic_type ?? null;
        } catch { /* shipment fetch optional */ }
      }

      // Update
      await db.query(
        `UPDATE ml_pedidos SET
           logistic_type = COALESCE($2, logistic_type),
           listing_type = COALESCE($3, listing_type),
           shipping_status = COALESCE($4, shipping_status),
           updated_at = NOW()
         WHERE ml_order_id = $1`,
        [order.ml_order_id, logisticType, listingType, shippingStatus]
      );

      updated++;
      results.push({
        order_id: order.ml_order_id,
        status: 'ok',
        detail: `logistic=${logisticType}, listing=${listingType}, shipping=${shippingStatus}`,
      });

      // Rate limit: ~2 req per order, 60/min limit → ~50ms delay
      await new Promise(r => setTimeout(r, 100));
    } catch (e: any) {
      errors++;
      results.push({ order_id: order.ml_order_id, status: 'error', detail: e.message });
    }
  }

  return NextResponse.json({
    total: orders.length,
    updated,
    errors,
    results,
  });
}
