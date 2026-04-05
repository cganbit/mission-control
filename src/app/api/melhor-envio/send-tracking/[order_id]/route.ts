import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';
const ML_API = 'https://api.mercadolibre.com';

export async function POST(req: NextRequest, { params }: { params: Promise<{ order_id: string }> }) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY && WORKER_KEY !== '';
  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order_id } = await params;
  const db = getPool();

  try {
    // Buscar pedido com tracking e dados ML
    const result = await db.query(
      `SELECT p.ml_order_id, p.me_tracking_code, p.me_carrier, p.me_status,
              p.pack_id, p.seller_id, p.buyer_nickname,
              t.access_token
       FROM ml_pedidos p
       LEFT JOIN ml_tokens_json t ON t.seller_id = p.seller_id
       WHERE p.ml_order_id = $1
       LIMIT 1`,
      [order_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const row = result.rows[0];

    if (!row.me_tracking_code) {
      return NextResponse.json({ error: 'Tracking code não disponível — gere a etiqueta primeiro' }, { status: 400 });
    }

    if (!row.access_token) {
      return NextResponse.json({ error: 'Token ML não disponível para este seller' }, { status: 400 });
    }

    const packId = row.pack_id || row.ml_order_id;
    const carrierName = row.me_carrier === 'sedex' ? 'SEDEX' : 'PAC';
    const prazo = row.me_carrier === 'sedex' ? '2-4' : '5-10';

    // Montar mensagem
    const buyerName = row.buyer_nickname || 'Comprador';
    const message = `${buyerName}, segue o código de rastreio do seu pedido: ${row.me_tracking_code} (${carrierName}). Previsão de entrega: ${prazo} dias úteis. Qualquer dúvida, estamos à disposição!`;

    // Enviar via ML Messages API
    const mlRes = await fetch(
      `${ML_API}/messages/packs/${packId}/sellers/${row.seller_id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${row.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { user_id: row.seller_id },
          to: { resource: 'orders', resource_id: row.ml_order_id, site_id: 'MLB' },
          text: message,
        }),
      }
    );

    if (!mlRes.ok) {
      const err = await mlRes.json().catch(() => ({}));
      return NextResponse.json({ error: 'Falha ao enviar mensagem ML', detail: err }, { status: 502 });
    }

    // Atualizar status
    await db.query(
      `UPDATE ml_pedidos SET me_status = 'posted' WHERE ml_order_id = $1`,
      [order_id]
    );

    return NextResponse.json({ ok: true, message_sent: true, tracking: row.me_tracking_code });
  } catch (e: any) {
    console.error('[send-tracking] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
