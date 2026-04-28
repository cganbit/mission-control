import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
// MIGRATED 2026-04-28: WhatsApp dispatch agora é responsabilidade
// do ml-saas/mcp-server alert-agent (PRD-047 Phase 1).
// MC webhook agora APENAS persiste em ml_pedidos.
// Refs: PRD-047 D47.3
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

  // Lead capture (CPF + telefone): fonte canônica é /orders/{id}/billing_info
  // per skill api-mercado-livre §8. Payload webhook omite buyer.phone silenciosamente
  // (skill §128 gotcha 2026-04-03) e tax_payer_id inline só existe em casos específicos.
  // Sempre tentamos API se falta qualquer um dos dois; log estruturado em miss.
  let cpf: string | null = buyer.billing_info?.tax_payer_id ?? null;
  let phoneObj: any = buyer.phone ?? null;

  if (order.id && token && (!cpf || !phoneObj)) {
    try {
      const billing = await mlGet(`${ML_API}/orders/${order.id}/billing_info`, token);
      cpf = billing?.billing_info?.doc_number
         ?? billing?.buyer?.billing_info?.doc_number
         ?? billing?.buyer?.billing_info?.tax_payer_id
         ?? cpf;
      phoneObj = billing?.buyer?.phone ?? phoneObj;
    } catch (e: any) {
      console.warn('[billing_info_miss]', {
        order_id: order.id,
        buyer_id: ml_buyer_id,
        reason: e?.message ?? 'unknown',
        had_cpf: !!cpf,
        had_phone: !!phoneObj,
      });
    }
  } else if (!token && (!cpf || !phoneObj)) {
    console.warn('[billing_info_skip_no_token]', { order_id: order.id, buyer_id: ml_buyer_id });
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
  // date_created/date_closed vêm do ML order shape (fonte canônica da data real da venda,
  // não confundir com ml_pedidos.created_at que é DEFAULT NOW() do INSERT no DB).
  // COALESCE preserva date_created já gravado em re-replays (idempotência).
  await db.query(
    `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id, logistic_type, listing_type, shipping_status, date_created, date_closed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (ml_order_id) DO UPDATE SET
       status = 'paid',
       logistic_type = COALESCE(EXCLUDED.logistic_type, ml_pedidos.logistic_type),
       listing_type = COALESCE(EXCLUDED.listing_type, ml_pedidos.listing_type),
       shipping_status = COALESCE(EXCLUDED.shipping_status, ml_pedidos.shipping_status),
       date_created = COALESCE(ml_pedidos.date_created, EXCLUDED.date_created),
       date_closed = COALESCE(EXCLUDED.date_closed, ml_pedidos.date_closed)`,
    [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.status, shipment?.id ?? null, logisticType, listingType, shippingStatus, order.date_created ?? null, order.date_closed ?? null]
  );

  // Retry: se logistic_type ficou null, tentar buscar do shipment com retries
  if (!logisticType && token) {
    const shipId = shipment?.id ?? order.shipping?.id;
    const orderId = order.id;
    const retryDelays = [5000, 15000, 30000];
    for (const delay of retryDelays) {
      setTimeout(async () => {
        try {
          // Verificar se já foi preenchido por um retry anterior
          const check = await db.query('SELECT logistic_type FROM ml_pedidos WHERE ml_order_id = $1', [orderId]);
          if (check.rows[0]?.logistic_type) return;

          // Tentar buscar do shipment
          if (shipId) {
            const ship = await mlGet(`${ML_API}/shipments/${shipId}`, token);
            if (ship?.logistic_type) {
              await db.query(
                'UPDATE ml_pedidos SET logistic_type = $1, updated_at = NOW() WHERE ml_order_id = $2 AND logistic_type IS NULL',
                [ship.logistic_type, orderId]
              );
              return;
            }
          }
          // Fallback: buscar do order diretamente
          const freshOrder = await mlGet(`${ML_API}/orders/${orderId}`, token);
          if (freshOrder?.shipping?.logistic_type) {
            await db.query(
              'UPDATE ml_pedidos SET logistic_type = $1, updated_at = NOW() WHERE ml_order_id = $2 AND logistic_type IS NULL',
              [freshOrder.shipping.logistic_type, orderId]
            );
          }
        } catch { /* best-effort */ }
      }, delay);
    }
  }
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

    // Salvar valor raw na print_queue — tradução só na UI
    const logisticType = shipment?.logistic_type ?? order.shipping?.logistic_type ?? null;

    const buyer = order.buyer ?? {};
    const buyerName = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.nickname || null;

    const db = getPool();
    await db.query(
      `INSERT INTO print_queue (ml_order_id, ml_shipment_id, seller_nickname, token, status, items_summary, logistic_type, buyer_name, origin)
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, 'mercadolivre')
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
          `INSERT INTO ml_pedidos (ml_order_id, ml_buyer_id, seller_nickname, items_json, total, status, shipment_id, logistic_type, listing_type, date_created, date_closed)
           VALUES ($1, $2, $3, $4, $5, 'payment_required', $6, $7, $8, $9, $10)
           ON CONFLICT (ml_order_id) DO UPDATE SET
             status = 'payment_required',
             logistic_type = COALESCE(EXCLUDED.logistic_type, ml_pedidos.logistic_type),
             listing_type = COALESCE(EXCLUDED.listing_type, ml_pedidos.listing_type),
             date_created = COALESCE(ml_pedidos.date_created, EXCLUDED.date_created),
             date_closed = COALESCE(EXCLUDED.date_closed, ml_pedidos.date_closed)`,
          [order.id, ml_buyer_id, sellerNickname, JSON.stringify(items), order.total_amount ?? 0, order.shipping?.id ?? null, prLogisticType, prListingType, order.date_created ?? null, order.date_closed ?? null]
        );
      } catch (e: any) {
        console.error('[ML Webhook] Erro ao salvar payment_required:', e.message);
      }

      // MIGRATED 2026-04-28: WhatsApp dispatch removido — ml-saas alert-agent
      // faz claim-then-dispatch atômico via UPDATE...RETURNING (PRD-047 D47.3).
      // wa_notified_pr flag agora é setado exclusivamente pelo ml-saas.

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

    // Buscar config por conta (print_queue_enabled)
    const db = getPool();
    const cfgRow = await db.query(
      `SELECT print_queue_enabled FROM ml_account_configs WHERE seller_id = $1`,
      [account.seller_id]
    );
    const accountCfg = cfgRow.rows[0] ?? null;
    const printEnabled = accountCfg ? accountCfg.print_queue_enabled : true;

    // Criar job de impressão (se habilitado) + salvar cliente/pedido em paralelo
    const [printToken] = await Promise.all([
      printEnabled
        ? createPrintJob(order.id, shipmentId, account.nickname, order, shipment)
        : Promise.resolve(null),
      saveClienteAndPedido(order, shipment, account.nickname, account.access_token).catch(e =>
        console.error('[ML Webhook] Erro ao salvar cliente:', e.message)
      ),
    ]);

    // MIGRATED 2026-04-28: WhatsApp dispatch removido — ml-saas alert-agent
    // faz claim-then-dispatch atômico via UPDATE...RETURNING (PRD-047 D47.3).
    // wa_notified_paid flag agora é setado exclusivamente pelo ml-saas.

    return NextResponse.json({ ok: true, order_id: order.id, print_token: printToken ?? undefined });
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
