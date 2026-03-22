import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp } from '@/lib/whatsapp';

const ML_API = 'https://api.mercadolibre.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Salvar cliente e pedido no banco ────────────────────────────────────────

async function saveClienteAndPedido(order: any, shipment: any, sellerNickname: string) {
  const db = getPool();
  const buyer = order.buyer ?? {};

  // Montar dados do cliente
  const ml_buyer_id = buyer.id;
  if (!ml_buyer_id) return;

  const nome = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || null;
  const cpf = buyer.billing_info?.tax_payer_id ?? null;
  const phone = buyer.phone;
  const telefone = phone
    ? `+55${phone.area_code ?? ''}${phone.number ?? ''}`.replace(/\s/g, '')
    : null;
  const endereco = shipment?.receiver_address ?? null;

  // Detectar se é lead de bateria
  const isBateriaLead = (order.order_items ?? []).some((i: any) =>
    /bateria/i.test(i.item?.title ?? '')
  );

  // Upsert cliente
  await db.query(
    `INSERT INTO ml_clientes (ml_buyer_id, nome, cpf, telefone, endereco_json, lead, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (ml_buyer_id) DO UPDATE SET
       nome = COALESCE(EXCLUDED.nome, ml_clientes.nome),
       cpf = COALESCE(EXCLUDED.cpf, ml_clientes.cpf),
       telefone = COALESCE(EXCLUDED.telefone, ml_clientes.telefone),
       endereco_json = COALESCE(EXCLUDED.endereco_json, ml_clientes.endereco_json),
       lead = ml_clientes.lead OR EXCLUDED.lead,
       updated_at = NOW()`,
    [ml_buyer_id, nome, cpf, telefone, endereco ? JSON.stringify(endereco) : null, isBateriaLead]
  );

  // Montar itens do pedido
  const items = (order.order_items ?? []).map((i: any) => ({
    title: i.item?.title,
    quantity: i.quantity,
    unit_price: i.unit_price,
  }));

  // Insert pedido (ignora se já existe — idempotente)
  await db.query(
    `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ml_order_id) DO NOTHING`,
    [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.status, shipment?.id ?? null]
  );
}

// ─── Formatar mensagem WhatsApp ───────────────────────────────────────────────

function formatSaleMessage(order: any, shipment: any, nickname: string): string {
  // Produtos
  const items = order.order_items ?? [];
  const itemLines = items.map((i: any) => `  • ${i.quantity}x ${i.item?.title ?? 'Produto'}`).join('\n');

  // Valores
  const total = order.total_amount ?? 0;
  const orderId = order.id;

  // Comprador
  const buyer = order.buyer ?? {};
  const nome = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || 'Comprador';
  const cpf = buyer.billing_info?.tax_payer_id ?? null;
  const phone = buyer.phone;
  const telefone = phone ? `(${phone.area_code}) ${phone.number}` : null;

  // Envio
  const logisticType = shipment?.logistic_type ?? order.shipping?.logistic_type ?? '';
  const shippingLabel = logisticType === 'fulfillment' ? 'Full' : logisticType === 'self_service' ? 'Clássico' : 'Correios';
  const addr = shipment?.receiver_address;
  const addressLine = addr
    ? `${addr.street_name ?? ''}, ${addr.street_number ?? ''}${addr.comment ? ` (${addr.comment})` : ''}`.trim()
    : null;
  const cityLine = addr ? `${addr.city?.name ?? ''} - ${addr.state?.name ?? ''}, CEP ${addr.zip_code ?? ''}` : null;

  return [
    `🛍️ *Nova Venda — ${nickname}*`,
    ``,
    `📦 *Produto(s):*`,
    itemLines,
    ``,
    `💰 *Total:* R$ ${Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `📋 *Pedido:* #${orderId}`,
    ``,
    `👤 *Comprador:* ${nome}`,
    cpf ? `🪪 *CPF:* ${cpf}` : null,
    telefone ? `📱 *Telefone:* ${telefone}` : null,
    ``,
    `🚚 *Envio:* Mercado Envios ${shippingLabel}`,
    addressLine ? `📍 ${addressLine}` : null,
    cityLine ? `    ${cityLine}` : null,
  ].filter(l => l !== null).join('\n');
}

// ─── POST — ML notification receiver ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { topic, resource, user_id } = body ?? {};

  if (topic !== 'orders_v2' || !resource || !user_id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const accounts = await getTokensAsync();
    const account = accounts.find(a => a.seller_id === Number(user_id));
    if (!account) return NextResponse.json({ ok: true, skipped: true, reason: 'account not found' });

    const orderUrl = resource.startsWith('http') ? resource : `${ML_API}${resource}`;
    const order = await mlGet(orderUrl, account.access_token);

    if (order.status !== 'paid') {
      return NextResponse.json({ ok: true, skipped: true, reason: `status=${order.status}` });
    }

    // Buscar dados do envio (endereço, tipo de frete)
    let shipment: any = null;
    const shipmentId = order.shipping?.id;
    if (shipmentId) {
      try {
        shipment = await mlGet(`${ML_API}/shipments/${shipmentId}`, account.access_token);
      } catch { /* opcional */ }
    }

    // Salvar cliente e pedido no banco (em paralelo com o envio do WhatsApp)
    await Promise.all([
      saveClienteAndPedido(order, shipment, account.nickname).catch(e =>
        console.error('[ML Webhook] Erro ao salvar cliente:', e.message)
      ),
      sendWhatsApp(formatSaleMessage(order, shipment, account.nickname)),
    ]);

    return NextResponse.json({ ok: true, order_id: order.id });
  } catch (e: any) {
    console.error('[ML Webhook] Error:', e.message);
    return NextResponse.json({ ok: true, error: e.message });
  }
}

// ─── GET — health check ───────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/mercado-livre/webhook',
    info: 'ML webhook receiver. Handles: orders_v2 (paid). Saves to ml_clientes + ml_pedidos.',
  });
}
