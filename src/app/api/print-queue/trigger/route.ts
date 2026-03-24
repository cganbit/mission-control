import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

function html(icon: string, title: string, body: string, color: string, status: number): NextResponse {
  const page = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a; color: #e2e8f0;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .card {
      background: #1e293b; border: 1px solid ${color}33;
      border-radius: 20px; padding: 40px 32px;
      text-align: center; max-width: 360px; width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .icon { font-size: 56px; margin-bottom: 20px; line-height: 1; }
    h1 { font-size: 20px; font-weight: 700; color: ${color}; margin-bottom: 10px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .badge {
      display: inline-block; margin-top: 16px;
      background: ${color}22; color: ${color};
      border: 1px solid ${color}44; border-radius: 99px;
      padding: 4px 14px; font-size: 12px; font-weight: 600;
    }
    .footer { margin-top: 24px; font-size: 11px; color: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="footer">Mission Control · WingX</div>
  </div>
</body>
</html>`;
  return new NextResponse(page, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─── GET /api/print-queue/trigger?token=XXX ──────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return html('❌', 'Link inválido', 'Token não encontrado.', '#ef4444', 400);

  const db = getPool();

  const result = await db.query(
    `UPDATE print_queue
     SET status = 'pending', updated_at = NOW()
     WHERE token = $1 AND status = 'queued'
     RETURNING id, ml_order_id`,
    [token]
  );

  if (result.rowCount === 0) {
    const existing = await db.query(
      `SELECT status, error_msg FROM print_queue WHERE token = $1`,
      [token]
    );
    const row = existing.rows[0];
    if (!row) return html('❌', 'Link expirado', 'Este link não é mais válido.', '#ef4444', 404);

    if (row.status === 'done') {
      return html('✅', 'Já impresso!', 'Esta etiqueta já foi impressa com sucesso.', '#22c55e', 200);
    }
    if (row.status === 'pending' || row.status === 'printing') {
      return html('🖨️', 'Na fila!', 'Impressão já solicitada. O agente está processando.', '#6366f1', 200);
    }
    if (row.status === 'error') {
      return html('⚠️', 'Erro na impressão', `Ocorreu um erro ao imprimir.<br><small style="opacity:.6">${row.error_msg ?? ''}</small>`, '#f59e0b', 200);
    }
    return html('ℹ️', 'Status desconhecido', `Status atual: ${row.status}`, '#94a3b8', 200);
  }

  const { id, ml_order_id } = result.rows[0];

  return html(
    '🖨️',
    'Impressão solicitada!',
    `Pedido <strong style="color:#e2e8f0">#${ml_order_id}</strong> entrou na fila.<br>A etiqueta será impressa em instantes.`,
    '#6366f1',
    200
  );
}
