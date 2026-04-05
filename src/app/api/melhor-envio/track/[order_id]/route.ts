import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { meTrackShipment } from '@/lib/melhor-envio';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

export async function GET(req: NextRequest, { params }: { params: Promise<{ order_id: string }> }) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY && WORKER_KEY !== '';
  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order_id } = await params;
  const db = getPool();

  try {
    // Buscar me_order_id do pedido
    const result = await db.query(
      `SELECT me_order_id, me_status, me_tracking_code
       FROM ml_pedidos WHERE ml_order_id = $1 LIMIT 1`,
      [order_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const row = result.rows[0];
    if (!row.me_order_id) {
      return NextResponse.json({ error: 'Etiqueta não gerada ainda', me_status: row.me_status }, { status: 400 });
    }

    // Consultar ME tracking API
    const trackingData = await meTrackShipment([row.me_order_id]);
    const shipment = trackingData?.[row.me_order_id] ?? trackingData;

    // Mapear status ME → status interno
    const meStatus = shipment?.status ?? 'unknown';
    let newStatus = row.me_status;

    if (meStatus === 'delivered') {
      newStatus = 'delivered';
    } else if (meStatus === 'in_transit' || meStatus === 'shipped') {
      newStatus = 'in_transit';
    } else if (meStatus === 'posted') {
      newStatus = 'posted';
    }

    // Atualizar DB se status mudou
    if (newStatus !== row.me_status) {
      await db.query(
        `UPDATE ml_pedidos SET me_status = $1 WHERE ml_order_id = $2`,
        [newStatus, order_id]
      );
    }

    // Atualizar tracking code se veio da API e não temos
    const trackingCode = shipment?.tracking ?? row.me_tracking_code;
    if (trackingCode && trackingCode !== row.me_tracking_code) {
      await db.query(
        `UPDATE ml_pedidos SET me_tracking_code = $1 WHERE ml_order_id = $2`,
        [trackingCode, order_id]
      );
    }

    return NextResponse.json({
      ml_order_id: order_id,
      me_order_id: row.me_order_id,
      me_status: newStatus,
      me_tracking_code: trackingCode,
      tracking_events: shipment?.events ?? shipment?.melhorenvio_tracking ?? [],
      raw_status: meStatus,
    });
  } catch (e: any) {
    console.error('[track] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
