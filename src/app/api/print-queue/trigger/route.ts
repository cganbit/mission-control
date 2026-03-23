import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// ─── GET /api/print-queue/trigger?token=XXX — rota pública ───────────────────
// Usuário toca no link pelo celular → job vai de 'queued' para 'pending'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
      '<h2>❌ Link inválido</h2><p>Token não encontrado.</p></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const db = getPool();
  const result = await db.query(
    `UPDATE print_queue
     SET status = 'pending', updated_at = NOW()
     WHERE token = $1 AND status = 'queued'
     RETURNING id, ml_order_id`,
    [token]
  );

  if (result.rowCount === 0) {
    // Verificar se já foi ativado antes
    const existing = await db.query(
      `SELECT status FROM print_queue WHERE token = $1`,
      [token]
    );
    const status = existing.rows[0]?.status;
    if (status && status !== 'queued') {
      return new NextResponse(
        '<html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
        `<h2>✅ Impressão já solicitada</h2><p>Status atual: <b>${status}</b></p></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }
    return new NextResponse(
      '<html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
      '<h2>❌ Link expirado ou inválido</h2></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const { id, ml_order_id } = result.rows[0];

  return new NextResponse(
    `<html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4">
        <h2>🖨️ Impressão solicitada!</h2>
        <p>Pedido <b>#${ml_order_id}</b> (job #${id}) está na fila.</p>
        <p style="color:#666;font-size:14px">O agente no notebook vai imprimir em instantes.</p>
      </body>
    </html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}
