import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp } from '@/lib/whatsapp';

const ML_API = 'https://api.mercadolibre.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTokens(): Array<{ seller_id: number; nickname: string; access_token: string }> {
  const db = getPool();
  // Tokens are in connector_configs, read synchronously via cached pool
  // (same pattern as ml-token-refresh — we re-read here to avoid coupling)
  return []; // populated async in handler below
}

async function getTokensAsync(): Promise<Array<{ seller_id: number; nickname: string; access_token: string }>> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return [];
  const parsed = JSON.parse(row.rows[0].value);
  const accounts = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  return accounts;
}

async function mlGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatSaleMessage(order: any, nickname: string): string {
  const item = order.order_items?.[0];
  const title = item?.item?.title ?? 'Produto';
  const qty = item?.quantity ?? 1;
  const total = order.total_amount ?? 0;
  const buyer = order.buyer?.nickname ?? order.buyer?.first_name ?? 'Comprador';
  const orderId = order.id;
  const shipping = order.shipping?.logistic_type === 'fulfillment' ? 'Full' : 'Clássico';

  return [
    `🛍️ *Nova Venda — ${nickname}*`,
    ``,
    `📦 ${qty}x ${title}`,
    `👤 Comprador: ${buyer}`,
    `💰 Total: R$ ${Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `🚚 Envio: Mercado Envios ${shipping}`,
    `📋 Pedido: #${orderId}`,
  ].join('\n');
}

// ─── POST — ML notification receiver ─────────────────────────────────────────
// ML sends: { resource: "/orders/123", user_id: 456, topic: "orders_v2", ... }
// Must respond 200 immediately — ML retries on non-200.

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Acknowledge immediately (ML requires fast 200)
  // Processing happens in the same tick — Next.js serverless will wait for the promise
  const { topic, resource, user_id } = body ?? {};

  // Only process paid orders
  if (topic !== 'orders_v2' || !resource || !user_id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const accounts = await getTokensAsync();
    const account = accounts.find(a => a.seller_id === Number(user_id));
    if (!account) return NextResponse.json({ ok: true, skipped: true, reason: 'account not found' });

    // Fetch full order from ML API
    const orderUrl = resource.startsWith('http') ? resource : `${ML_API}${resource}`;
    const order = await mlGet(orderUrl, account.access_token);

    // Only notify on paid orders
    if (order.status !== 'paid') {
      return NextResponse.json({ ok: true, skipped: true, reason: `status=${order.status}` });
    }

    const message = formatSaleMessage(order, account.nickname);
    await sendWhatsApp(message);

    return NextResponse.json({ ok: true, order_id: order.id });
  } catch (e: any) {
    // Log error but still return 200 so ML doesn't retry forever
    console.error('[ML Webhook] Error processing notification:', e.message);
    return NextResponse.json({ ok: true, error: e.message });
  }
}

// ─── GET — health check / last received notification ─────────────────────────
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/mercado-livre/webhook',
    info: 'ML webhook receiver. Handles: orders_v2 (paid). Sends WhatsApp via Evolution API.',
  });
}
