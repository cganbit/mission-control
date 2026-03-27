import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { auditLog } from '@/lib/mc-audit';

function htmlError(): NextResponse {
  const html = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0e1a;color:#fff;}
.card{text-align:center;padding:2rem;max-width:400px;}
.icon{font-size:4rem;margin-bottom:1rem;}
h1{color:#ef4444;margin:0 0 .5rem;}
p{color:#94a3b8;margin:.25rem 0;}
</style></head>
<body><div class="card">
<div class="icon">❌</div>
<h1>Token Inválido</h1>
<p>Token inválido ou embalagem já confirmada.</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function htmlSuccess(mlOrderId: string, sellerNickname: string, confirmedAt: Date): NextResponse {
  const dataHora = confirmedAt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0e1a;color:#fff;}
.card{text-align:center;padding:2rem;max-width:400px;}
.icon{font-size:4rem;margin-bottom:1rem;}
h1{color:#22c55e;margin:0 0 .5rem;}
p{color:#94a3b8;margin:.25rem 0;}
</style></head>
<body><div class="card">
<div class="icon">✅</div>
<h1>Embalagem Confirmada!</h1>
<p>Pedido #${mlOrderId}</p>
<p style="color:#64748b;font-size:.85rem;margin-top:1rem">${sellerNickname} · ${dataHora}</p>
</div></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── GET — público, autenticado apenas pelo token único ──────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) return htmlError();

  const db = getPool();

  // 1. Buscar na print_queue WHERE token = $1 AND status = 'done'
  const row = await db.query(
    `SELECT id, ml_order_id, seller_nickname FROM print_queue WHERE token = $1 AND status = 'done'`,
    [token]
  );

  if (!row.rows[0]) return htmlError();

  const { id, ml_order_id, seller_nickname } = row.rows[0];

  // 2. Confirmar: UPDATE status, confirmed_at, confirmed_by
  await db.query(
    `UPDATE print_queue SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = 'QR-scan' WHERE id = $1`,
    [id]
  );

  const confirmedAt = new Date();

  // 3. Audit log
  await auditLog({
    event_type: 'label_confirmed',
    entity_type: 'print_queue',
    entity_id: Number(id),
    seller_nickname,
    status: 'ok',
  });

  return htmlSuccess(String(ml_order_id), seller_nickname, confirmedAt);
}
