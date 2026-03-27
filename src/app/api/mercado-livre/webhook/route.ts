import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp, sendWhatsAppMedia } from '@/lib/whatsapp';
import crypto from 'crypto';

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

  // Upsert pedido — se já existia como payment_required, promove para paid
  await db.query(
    `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ml_order_id) DO UPDATE SET status = 'paid'`,
    [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.status, shipment?.id ?? null]
  );
}

// ─── Formatar mensagem WhatsApp ───────────────────────────────────────────────

function formatAddr(addr: any): { line1: string; line2: string } | null {
  if (!addr) return null;
  const line1 = `${addr.street_name ?? ''}, ${addr.street_number ?? ''}${addr.comment ? ` (${addr.comment})` : ''}`.trim();
  const line2 = `${addr.city?.name ?? ''} - ${addr.state?.name ?? ''}, CEP ${addr.zip_code ?? ''}`;
  return { line1, line2 };
}

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
  const cpf = buyer.billing_info?.tax_payer_id ?? order.billing_info?.cpf ?? null;
  const phone = buyer.phone;
  const telefone = phone ? `(${phone.area_code}) ${phone.number}` : null;

  // Endereços
  const entrega = formatAddr(shipment?.receiver_address);
  const fiscal = formatAddr(order.billing_info?.billing_address ?? buyer.billing_info?.address);
  const enderecosDiferentes = entrega && fiscal && entrega.line1 !== fiscal.line1;

  // Envio
  const logisticType = shipment?.logistic_type ?? order.shipping?.logistic_type ?? '';
  const shippingLabel = logisticType === 'fulfillment' ? 'Full' : logisticType === 'self_service' ? 'Clássico' : 'Correios';

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
    entrega ? `📍 *Entrega:* ${entrega.line1}` : null,
    entrega ? `    ${entrega.line2}` : null,
    enderecosDiferentes && fiscal ? `🧾 *Nota Fiscal:* ${fiscal.line1}` : null,
    enderecosDiferentes && fiscal ? `    ${fiscal.line2}` : null,
  ].filter(l => l !== null).join('\n');
}

function getThumbnail(order: any): string | null {
  return order.order_items?.[0]?.item?.thumbnail ?? null;
}

// ─── Criar job de impressão na fila ──────────────────────────────────────────

async function createPrintJob(
  orderId: number,
  shipmentId: number | null,
  sellerNickname: string,
  order: any,
  shipment: any,
): Promise<string | null> {
  try {
    const token = crypto.randomBytes(20).toString('hex');

    const items = (order.order_items ?? []) as Array<{ item?: { title?: string }; quantity?: number }>;
    const itemsSummary = items
      .map(i => `${i.item?.title ?? 'Produto'} × ${i.quantity ?? 1}`)
      .join(', ');

    const logisticType = (() => {
      const lt = shipment?.logistic_type ?? order.shipping?.logistic_type ?? '';
      if (lt === 'fulfillment') return 'Full';
      if (lt === 'self_service') return 'Clássico';
      if (lt === 'xd_drop_off') return 'Flex';
      return 'Correios';
    })();

    const buyer = order.buyer ?? {};
    const buyerName = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || null;

    const db = getPool();
    await db.query(
      `INSERT INTO print_queue (ml_order_id, ml_shipment_id, seller_nickname, token, status, items_summary, logistic_type, buyer_name)
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [orderId, shipmentId, sellerNickname, token, itemsSummary || null, logisticType, buyerName]
    );
    // Se já existia um job para esse pedido, pega o token existente
    const row = await db.query(
      `SELECT token FROM print_queue WHERE ml_order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    return row.rows[0]?.token ?? null;
  } catch (e: any) {
    console.error('[ML Webhook] Erro ao criar print job:', e.message);
    return null;
  }
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

    // ── Mudança 1 & 2: capturar payment_required ────────────────────────────
    if (order.status === 'payment_required') {
      const buyer = order.buyer ?? {};
      const ml_buyer_id = buyer.id ?? null;
      const items = (order.order_items ?? []).map((i: any) => ({
        title: i.item?.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));
      const sellerNickname = account.nickname;

      // Salvar/atualizar em ml_pedidos com status payment_required
      try {
        const db = getPool();
        await db.query(
          `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id)
           VALUES ($1, $2, $3, $4, $5, 'payment_required', $6)
           ON CONFLICT (ml_order_id) DO UPDATE SET status = 'payment_required'`,
          [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.shipping?.id ?? null]
        );
      } catch (e: any) {
        console.error('[ML Webhook] Erro ao salvar payment_required:', e.message);
      }

      // Notificação WhatsApp para payment_required
      const buyerName = buyer.nickname || buyer.first_name || 'Comprador';
      const firstItem = order.order_items?.[0];
      const itemTitle = firstItem?.item?.title ?? 'Produto';
      const itemQty = firstItem?.quantity ?? 1;
      const totalFormatted = Number(order.total_amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      const prMsg = [
        `⏳ *Nova venda aguardando pagamento*`,
        ``,
        `🛒 *Pedido:* #ML-${order.id}`,
        `👤 *Comprador:* ${buyerName}`,
        `📦 *Item:* ${itemTitle} (x${itemQty})`,
        `💰 *Valor:* R$ ${totalFormatted}`,
        `🏷️ *Conta:* ${sellerNickname}`,
        ``,
        `⚠️ Pagamento ainda não confirmado.`,
        `Etiqueta será gerada após a confirmação.`,
      ].join('\n');

      try {
        // Buscar notifGroup da conta
        const db = getPool();
        const cfgRowPr = await db.query(
          `SELECT notification_group FROM ml_account_configs WHERE seller_id = $1`,
          [account.seller_id]
        );
        const notifGroupPr: string | undefined = cfgRowPr.rows[0]?.notification_group || undefined;
        await sendWhatsApp(prMsg, notifGroupPr);
      } catch (e: any) {
        console.error('[ML Webhook] Erro ao enviar WhatsApp payment_required:', e.message);
      }

      return NextResponse.json({ ok: true, saved: 'payment_required' });
    }
    // ────────────────────────────────────────────────────────────────────────

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

    const thumbnail = getThumbnail(order);

    // Buscar config por conta (notification_group, print_queue_enabled)
    const db = getPool();
    const cfgRow = await db.query(
      `SELECT print_queue_enabled, notification_group FROM ml_account_configs WHERE seller_id = $1`,
      [account.seller_id]
    );
    const accountCfg = cfgRow.rows[0] ?? null;
    const printEnabled = accountCfg ? accountCfg.print_queue_enabled : true;
    const notifGroup: string | undefined = accountCfg?.notification_group || undefined;

    // Criar job de impressão (se habilitado) + salvar cliente/pedido em paralelo
    const [printToken] = await Promise.all([
      printEnabled
        ? createPrintJob(order.id, shipmentId, account.nickname, order, shipment)
        : Promise.resolve(null),
      saveClienteAndPedido(order, shipment, account.nickname).catch(e =>
        console.error('[ML Webhook] Erro ao salvar cliente:', e.message)
      ),
    ]);

    // Montar link de impressão e incluir na mesma mensagem
    const baseUrl = process.env.MC_URL ?? 'https://mc.wingx.app.br';
    const queueKey = process.env.QUEUE_KEY ?? '';
    const queueLine = queueKey ? `\n📋 *Ver fila:* ${baseUrl}/fila?key=${queueKey}` : '';
    const printLine = (printToken && shipmentId)
      ? `\n🖨️ *Imprimir etiqueta:* ${baseUrl}/api/print-queue/trigger?token=${printToken}${queueLine}`
      : queueLine;

    const message = formatSaleMessage(order, shipment, account.nickname) + printLine;

    // Enviar notificação para o grupo configurado por conta (ou padrão)
    await (thumbnail ? sendWhatsAppMedia(thumbnail, message, notifGroup) : sendWhatsApp(message, notifGroup));

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
