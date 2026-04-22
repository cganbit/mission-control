import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { meCancelShipment } from '@wingx-app/api-me';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

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
    // Buscar pedido
    const pedido = await db.query(
      `SELECT me_order_id, me_status FROM ml_pedidos WHERE ml_order_id = $1 LIMIT 1`,
      [order_id]
    );

    if (pedido.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const row = pedido.rows[0];

    if (!row.me_order_id) {
      return NextResponse.json({ error: 'Nenhuma etiqueta gerada para este pedido' }, { status: 400 });
    }

    // Só pode cancelar se ainda não foi postado
    if (['posted', 'in_transit', 'delivered'].includes(row.me_status)) {
      return NextResponse.json({ error: `Não é possível cancelar — status: ${row.me_status}` }, { status: 400 });
    }

    // Cancelar no Melhor Envio (estorna saldo)
    await meCancelShipment(row.me_order_id);

    // Resetar campos ME no DB — volta pro fluxo de simulação
    await db.query(
      `UPDATE ml_pedidos SET
        me_order_id = NULL,
        me_tracking_code = NULL,
        me_label_url = NULL,
        me_cost = NULL,
        me_carrier = NULL,
        me_status = 'address_confirmed'
       WHERE ml_order_id = $1`,
      [order_id]
    );

    // Remover da fila de impressão se existir
    await db.query(
      `DELETE FROM print_queue WHERE ml_order_id = $1 AND status IN ('queued', 'pending')`,
      [order_id]
    );

    return NextResponse.json({ ok: true, message: 'Etiqueta cancelada e saldo estornado' });
  } catch (e: any) {
    console.error('[cancel-label] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
