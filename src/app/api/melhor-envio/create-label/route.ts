import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { meAddToCart, meCheckout, meGenerate, mePrint } from '@/lib/melhor-envio';
import { decrypt } from '@/lib/crypto';
import crypto from 'crypto';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';
const FROM_ZIP = '09051380'; // CEP origem padrão (Santo André)
const FROM_NAME = 'WingX Baterias';
const FROM_PHONE = '11999999999';

// Service IDs Melhor Envio
const SERVICES: Record<string, number> = { pac: 1, sedex: 2 };

export async function POST(req: NextRequest) {
  // Dual auth: worker-key ou session
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY && WORKER_KEY !== '';
  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();
  let ml_order_id: string | undefined;

  try {
    const body = await req.json();
    ml_order_id = body.ml_order_id;
    const carrier = body.carrier ?? 'pac';

    if (!ml_order_id) {
      return NextResponse.json({ error: 'ml_order_id obrigatório' }, { status: 400 });
    }

    const serviceId = SERVICES[carrier];
    if (!serviceId) {
      return NextResponse.json({ error: 'carrier deve ser pac ou sedex' }, { status: 400 });
    }

    // Buscar pedido + CPF do comprador
    const pedido = await db.query(
      `SELECT p.ml_order_id, p.me_status, p.me_delivery_address, p.me_order_id, p.items_json, p.total,
              c.cpf AS buyer_cpf
       FROM ml_pedidos p
       LEFT JOIN ml_clientes c ON c.ml_buyer_id = p.ml_buyer_id
       WHERE p.ml_order_id = $1 LIMIT 1`,
      [ml_order_id]
    );

    if (pedido.rowCount === 0) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const row = pedido.rows[0];

    // Não gerar etiqueta se já foi gerada
    if (row.me_order_id && ['label_generated', 'posted', 'in_transit', 'delivered'].includes(row.me_status)) {
      return NextResponse.json({
        error: `Etiqueta já existe (status: ${row.me_status})`,
        me_order_id: row.me_order_id,
      }, { status: 409 });
    }

    // Endereço de entrega (JSONB confirmado pelo vendedor)
    const addr = row.me_delivery_address;
    if (!addr || !addr.cep) {
      return NextResponse.json({ error: 'Endereço de entrega não confirmado' }, { status: 400 });
    }

    // CPF remetente: env var obrigatória (seu CPF/CNPJ)
    const fromDoc = process.env.ME_SENDER_DOCUMENT ?? '';
    if (!fromDoc) {
      return NextResponse.json({ error: 'ME_SENDER_DOCUMENT não configurado no .env' }, { status: 500 });
    }

    // CPF destinatário: DB criptografado → ML billing_info → erro
    let buyerCpf = '';
    if (row.buyer_cpf) {
      try { buyerCpf = decrypt(row.buyer_cpf).replace(/\D/g, ''); } catch { /* ignore */ }
    }
    if (!buyerCpf) {
      // Buscar CPF via ML API billing_info
      try {
        const tokenRow = await db.query(
          `SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`
        );
        const accounts = JSON.parse(tokenRow.rows[0]?.value ?? '[]');
        const accs = Array.isArray(accounts) ? accounts : (accounts.accounts ?? []);
        // Buscar seller_id do pedido para pegar token correto
        const sellerRow = await db.query('SELECT seller_nickname FROM ml_pedidos WHERE ml_order_id = $1', [ml_order_id]);
        const nickname = sellerRow.rows[0]?.seller_nickname;
        const account = accs.find((a: any) => a.nickname === nickname) ?? accs[0];
        if (account?.access_token) {
          const billing = await fetch(`https://api.mercadolibre.com/orders/${ml_order_id}/billing_info`, {
            headers: { Authorization: `Bearer ${account.access_token}` },
            signal: AbortSignal.timeout(10000),
          });
          if (billing.ok) {
            const bData = await billing.json();
            const addInfo = bData?.billing_info?.additional_info ?? [];
            const docEntry = addInfo.find((i: any) => i.type === 'DOC_NUMBER');
            buyerCpf = String(docEntry?.value ?? '').replace(/\D/g, '');
          }
        }
      } catch { /* best-effort */ }
    }
    if (!buyerCpf) {
      return NextResponse.json({ error: 'CPF do comprador não encontrado. Verifique dados do pedido.' }, { status: 400 });
    }

    // Montar endereços ME
    const fromAddr = {
      name: FROM_NAME,
      phone: FROM_PHONE,
      document: fromDoc,
      postal_code: FROM_ZIP,
      address: 'Rua das Figueiras',
      number: '100',
      district: 'Centro',
      city: 'Santo André',
      state_abbr: 'SP',
    };

    const toAddr = {
      name: addr.nome || 'Comprador',
      phone: addr.telefone || '',
      document: buyerCpf,
      postal_code: addr.cep,
      address: addr.rua || addr.logradouro || '',
      number: addr.numero || '',
      complement: addr.complemento || '',
      district: addr.bairro || '',
      city: addr.cidade || '',
      state_abbr: addr.estado || '',
    };

    const pkg = {
      weight: body.weight ?? 0.5,
      width: body.width ?? 20,
      height: body.height ?? 10,
      length: body.length ?? 20,
    };

    // Montar lista de produtos para declaração de conteúdo
    const items = row.items_json ?? [];
    const products = items.map((item: any) => ({
      name: (item.title ?? 'Produto').substring(0, 100),
      quantity: item.quantity ?? 1,
      unitary_value: item.unit_price ?? (row.total ? Number(row.total) / items.length : 100),
    }));

    // 1. Adicionar ao carrinho
    const cartResult = await meAddToCart(serviceId, fromAddr, toAddr, pkg, body.insurance_value ?? Number(row.total ?? 0), products);
    const cartId = cartResult.id;
    if (!cartId) {
      return NextResponse.json({ error: 'Falha ao adicionar ao carrinho', detail: cartResult }, { status: 502 });
    }

    // 2. Checkout (comprar etiqueta)
    const checkoutResult = await meCheckout([cartId]);
    const order = checkoutResult?.[cartId] ?? checkoutResult;
    const meOrderId = order?.id ?? cartId;
    const meTrackingCode = order?.tracking ?? null;
    const meCost = order?.price ? parseFloat(order.price) : null;
    const meProtocol = order?.protocol ?? null;

    // 3. Gerar etiqueta
    await meGenerate([meOrderId]);

    // 4. Obter URL do PDF
    const printResult = await mePrint([meOrderId]);
    const labelUrl = printResult?.url ?? null;

    // Salvar no DB
    await db.query(
      `UPDATE ml_pedidos SET
        me_order_id = $1,
        me_tracking_code = $2,
        me_label_url = $3,
        me_cost = $4,
        me_carrier = $5,
        me_status = 'label_generated'
       WHERE ml_order_id = $6`,
      [meOrderId, meTrackingCode, labelUrl, meCost, carrier, ml_order_id]
    );

    // T7: Inserir na fila de impressão
    const token = crypto.randomBytes(20).toString('hex');
    await db.query(
      `INSERT INTO print_queue (ml_order_id, seller_nickname, token, status, logistic_type)
       VALUES ($1, $2, $3, 'queued', 'melhor_envio')
       ON CONFLICT DO NOTHING`,
      [ml_order_id, FROM_NAME, token]
    );

    return NextResponse.json({
      ok: true,
      me_order_id: meOrderId,
      me_tracking_code: meTrackingCode,
      me_label_url: labelUrl,
      me_cost: meCost,
      me_protocol: meProtocol,
      carrier,
      print_queue: true,
    });
  } catch (e: any) {
    console.error('[create-label] Error:', e.message);
    if (ml_order_id) {
      await db.query(
        `UPDATE ml_pedidos SET me_status = 'error' WHERE ml_order_id = $1`,
        [ml_order_id]
      ).catch(() => {});
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
