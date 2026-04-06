import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp, sendWhatsAppMedia } from '@/lib/whatsapp';
import crypto from 'crypto';
import { encrypt } from '@/lib/crypto';

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

async function saveClienteAndPedido(order: any, shipment: any, sellerNickname: string, token?: string) {
  const db = getPool();
  const buyer = order.buyer ?? {};

  // Montar dados do cliente
  const ml_buyer_id = buyer.id;
  if (!ml_buyer_id) return;

  const nome = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || null;
  const cpf = buyer.billing_info?.tax_payer_id ?? null;

  // Telefone: tenta payload do webhook; fallback GET /orders/{id}/billing_info
  // Fonte: .skills/lib/mercado-livre/SKILL.md §8
  let phoneObj = buyer.phone;
  if (!phoneObj && order.id && token) {
    try {
      const billing = await mlGet(`${ML_API}/orders/${order.id}/billing_info`, token);
      phoneObj = billing?.buyer?.phone ?? null;
    } catch { /* não bloqueia o fluxo */ }
  }
  const telefone = phoneObj
    ? `+55${phoneObj.area_code ?? ''}${phoneObj.number ?? ''}`.replace(/\s/g, '')
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
    [ml_buyer_id, nome, encrypt(cpf ?? ''), encrypt(telefone ?? ''), endereco ? JSON.stringify(endereco) : null, isBateriaLead]
  );

  // Montar itens do pedido
  const items = (order.order_items ?? []).map((i: any) => ({
    title: i.item?.title,
    quantity: i.quantity,
    unit_price: i.unit_price,
  }));

  // Extrair campos adicionais do pedido
  const logisticType = shipment?.logistic_type ?? order.shipping?.logistic_type ?? null;
  const listingType = order.order_items?.[0]?.listing_type_id ?? null;
  const shippingStatus = shipment?.status ?? null;

  // Upsert pedido — se já existia como payment_required, promove para paid
  await db.query(
    `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id, logistic_type, listing_type, shipping_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (ml_order_id) DO UPDATE SET
       status = 'paid',
       logistic_type = COALESCE(EXCLUDED.logistic_type, ml_pedidos.logistic_type),
       listing_type = COALESCE(EXCLUDED.listing_type, ml_pedidos.listing_type),
       shipping_status = COALESCE(EXCLUDED.shipping_status, ml_pedidos.shipping_status)`,
    [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.status, shipment?.id ?? null, logisticType, listingType, shippingStatus]
  );

  // Retry: se logistic_type ficou null e tem shipment, tentar novamente após 5s
  if (!logisticType && order.shipping?.id && token) {
    setTimeout(async () => {
      try {
        const ship = await mlGet(`${ML_API}/shipments/${order.shipping.id}`, token);
        if (ship?.logistic_type) {
          await db.query(
            'UPDATE ml_pedidos SET logistic_type = $1, updated_at = NOW() WHERE ml_order_id = $2 AND logistic_type IS NULL',
            [ship.logistic_type, order.id]
          );
        }
      } catch { /* best-effort */ }
    }, 5000);
  }
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

    // ── payment_required: registrar pedido + notificar uma única vez ─────────
    if (order.status === 'payment_required') {
      const buyer = order.buyer ?? {};
      const ml_buyer_id = buyer.id ?? null;
      const items = (order.order_items ?? []).map((i: any) => ({
        title: i.item?.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));
      const sellerNickname = account.nickname;

      // Extrair campos adicionais
      const prLogisticType = order.shipping?.logistic_type ?? null;
      const prListingType = order.order_items?.[0]?.listing_type_id ?? null;

      // Salvar/atualizar em ml_pedidos
      const db = getPool();
      try {
        await db.query(
          `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id, logistic_type, listing_type)
           VALUES ($1, $2, $3, $4, $5, 'payment_required', $6, $7, $8)
           ON CONFLICT (ml_order_id) DO UPDATE SET
             status = 'payment_required',
             logistic_type = COALESCE(EXCLUDED.logistic_type, ml_pedidos.logistic_type),
             listing_type = COALESCE(EXCLUDED.listing_type, ml_pedidos.listing_type)`,
          [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.shipping?.id ?? null, prLogisticType, prListingType]
        );
      } catch (e: any) {
        console.error('[ML Webhook] Erro ao salvar payment_required:', e.message);
      }

      // Dedup: só notifica uma vez por pedido neste status
      try {
        const dupRow = await db.query(
          `SELECT wa_notified_pr FROM ml_pedidos WHERE ml_order_id = $1`,
          [order.id]
        );
        if (dupRow.rows[0]?.wa_notified_pr) {
          return NextResponse.json({ ok: true, skipped: true, reason: 'already_notified_pr' });
        }
      } catch { /* não bloqueia */ }

      // Mensagem padronizada — mesmo layout da venda paga, sem links de impressão
      const basePr = formatSaleMessage(order, null, sellerNickname);
      const linesPr = basePr.split('\n');
      linesPr.splice(1, 0, '⏳ *Aguardando Pagamento*');
      const prMsg = linesPr.join('\n');

      try {
        const cfgRowPr = await db.query(
          `SELECT notification_group FROM ml_account_configs WHERE seller_id = $1`,
          [account.seller_id]
        );
        const notifGroupPr: string | undefined = cfgRowPr.rows[0]?.notification_group || undefined;
        await sendWhatsApp(prMsg, notifGroupPr);
        // Marcar como notificado para evitar reenvio em retries do ML
        await db.query(
          `UPDATE ml_pedidos SET wa_notified_pr = true WHERE ml_order_id = $1`,
          [order.id]
        );
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
      saveClienteAndPedido(order, shipment, account.nickname, account.access_token).catch(e =>
        console.error('[ML Webhook] Erro ao salvar cliente:', e.message)
      ),
    ]);

    // Dedup: só notifica uma vez por pedido no status paid
    try {
      const paidDupRow = await db.query(
        `SELECT wa_notified_paid FROM ml_pedidos WHERE ml_order_id = $1`,
        [order.id]
      );
      if (paidDupRow.rows[0]?.wa_notified_paid) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'already_notified_paid' });
      }
    } catch { /* não bloqueia */ }

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

    // Marcar como notificado para evitar reenvio em retries do ML
    await db.query(
      `UPDATE ml_pedidos SET wa_notified_paid = true WHERE ml_order_id = $1`,
      [order.id]
    ).catch((e: any) => console.error('[ML Webhook] Erro ao marcar wa_notified_paid:', e.message));

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
