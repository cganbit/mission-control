import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { triggerJobByToken, buildFlowSteps } from '@wingx-app/api-print';
import type { StepInfo } from '@wingx-app/api-print';

// ─── HTML renderer (MC owns this — data comes from triggerJobByToken) ─────────

function html(
  icon: string, title: string, body: string, color: string, httpStatus: number,
  opts?: { orderId?: string; steps?: StepInfo[]; errorDetail?: string; actionLabel?: string; actionHref?: string }
): NextResponse {
  const stepsHtml = opts?.steps ? `
    <div class="steps">
      ${opts.steps.map((s, i) => `
        <div class="step ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}">
          <div class="step-dot">${s.done ? '✓' : s.active ? s.icon : (i + 1)}</div>
          <div class="step-label">${s.label}</div>
        </div>
        ${i < opts.steps!.length - 1 ? `<div class="step-line ${s.done ? 'done' : ''}"></div>` : ''}
      `).join('')}
    </div>` : '';

  const orderHtml = opts?.orderId
    ? `<div class="order-id">Pedido #${opts.orderId}</div>` : '';

  const errorHtml = opts?.errorDetail
    ? `<div class="error-detail">${opts.errorDetail}</div>` : '';

  const actionHtml = opts?.actionLabel && opts?.actionHref
    ? `<a href="${opts.actionHref}" class="action-btn">${opts.actionLabel}</a>` : '';

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
      background: #1e293b; border: 1px solid ${color}44;
      border-radius: 24px; padding: 36px 28px;
      text-align: center; max-width: 380px; width: 100%;
      box-shadow: 0 25px 50px rgba(0,0,0,0.6), 0 0 0 1px ${color}11;
    }
    .icon { font-size: 52px; margin-bottom: 16px; line-height: 1; }
    .order-id {
      font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: #475569; margin-bottom: 12px;
    }
    h1 { font-size: 19px; font-weight: 700; color: ${color}; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 4px; }
    .steps {
      display: flex; align-items: center; justify-content: center;
      margin: 24px 0 8px; gap: 0;
    }
    .step { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .step-dot {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700;
      background: #1e3a5f22; border: 2px solid #334155; color: #475569;
      transition: all .2s;
    }
    .step.done .step-dot { background: #16a34a33; border-color: #16a34a; color: #4ade80; }
    .step.active .step-dot { background: ${color}22; border-color: ${color}; color: ${color}; box-shadow: 0 0 12px ${color}44; }
    .step-label { font-size: 10px; color: #475569; font-weight: 600; white-space: nowrap; }
    .step.done .step-label { color: #4ade80; }
    .step.active .step-label { color: ${color}; }
    .step-line {
      width: 28px; height: 2px; background: #334155;
      margin-bottom: 16px; flex-shrink: 0;
    }
    .step-line.done { background: #16a34a; }
    .error-detail {
      margin-top: 12px; padding: 10px 14px; background: #7f1d1d33;
      border: 1px solid #991b1b44; border-radius: 10px;
      font-size: 12px; color: #fca5a5; text-align: left; word-break: break-word;
    }
    .action-btn {
      display: inline-block; margin-top: 20px;
      background: ${color}22; color: ${color};
      border: 1px solid ${color}55; border-radius: 12px;
      padding: 10px 24px; font-size: 14px; font-weight: 700;
      text-decoration: none; transition: background .15s;
    }
    .action-btn:hover { background: ${color}33; }
    .footer { margin-top: 24px; font-size: 11px; color: #1e293b; }
    .footer span { color: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    ${orderHtml}
    <h1>${title}</h1>
    <p>${body}</p>
    ${stepsHtml}
    ${errorHtml}
    ${actionHtml}
    <div class="footer"><span>Mission Control · WingX</span></div>
  </div>
</body>
</html>`;
  return new NextResponse(page, { status: httpStatus, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─── GET /api/print-queue/trigger?token=XXX[&action=reprint] ─────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const action = req.nextUrl.searchParams.get('action') ?? undefined;

  if (!token) return html('❌', 'Link inválido', 'Token não encontrado.', '#ef4444', 400);

  const db = getPool();
  const data = await triggerJobByToken(db, { token, action });

  const { status, orderId, steps, errorMsg } = data;

  if (status === 'invalid_token') {
    return html('❌', 'Link inválido', 'Token não encontrado.', '#ef4444', 400);
  }

  if (status === 'not_found') {
    return html('❌', 'Link expirado', 'Este link não é mais válido.', '#ef4444', 404);
  }

  if (status === 'reprint_queued' || status === 'triggered') {
    return html('🖨️', 'Impressão solicitada!',
      'A etiqueta entrou na fila e será impressa em instantes.',
      '#6366f1', 200,
      { orderId, steps: steps ?? buildFlowSteps('pending') });
  }

  if (status === 'already_confirmed') {
    return html('📦', 'Coleta confirmada!',
      'A etiqueta foi impressa e a coleta já foi confirmada.',
      '#14b8a6', 200,
      { orderId, steps: steps ?? buildFlowSteps('confirmed') });
  }

  if (status === 'already_done') {
    return html('✅', 'Etiqueta já impressa!',
      'Aguardando confirmação de coleta.',
      '#22c55e', 200,
      { orderId, steps: steps ?? buildFlowSteps('done') });
  }

  if (status === 'already_printing') {
    return html('🖨️', 'Imprimindo agora!',
      'Aguarde.',
      '#a855f7', 200,
      { orderId, steps: steps ?? buildFlowSteps('printing') });
  }

  if (status === 'already_pending') {
    const reprintUrl = `/api/print-queue/trigger?token=${token}&action=reprint`;
    return html('⏳', 'Na fila de impressão',
      'A etiqueta já está na fila. O agente irá imprimir em instantes.',
      '#6366f1', 200,
      { orderId, steps: steps ?? buildFlowSteps('pending'), actionLabel: '🖨️ Imprimir', actionHref: reprintUrl });
  }

  if (status === 'error_state') {
    return html('⚠️', 'Erro ao imprimir',
      'Ocorreu um problema durante a impressão. A equipe já foi notificada.',
      '#f59e0b', 200,
      { orderId, steps: steps ?? buildFlowSteps('error'), errorDetail: errorMsg ?? '' });
  }

  return html('ℹ️', 'Status desconhecido', `Status atual: ${status}`, '#94a3b8', 200);
}
