import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

// POST /api/mercado-livre/pedidos/backfill-billing-info
// PRD-036 F7 Fase 4 — Bug-1 + Bug-3 retrospective recovery.
//
// Idempotent: only updates rows where data is still missing.
//   - ml_pedidos: populate date_created/date_closed where NULL
//   - ml_clientes: populate cpf/telefone where encrypted length = 0 (empty)
//
// Protected by x-worker-key (MC_WORKER_KEY env).
//
// Rate limit: 500ms between calls to avoid ML 429. ~80s for 79 orders.
export async function POST(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const expectedKey = process.env.MC_WORKER_KEY;
  if (!expectedKey || workerKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ML_API = 'https://api.mercadolibre.com';
  const db = getPool();

  type Account = { seller_id: number; nickname: string; access_token: string };

  async function getAccounts(): Promise<Account[]> {
    const r = await db.query<{ value: string }>(
      `SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`
    );
    if (!r.rows[0]) return [];
    const parsed = JSON.parse(r.rows[0].value);
    return Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  }

  async function mlGet(url: string, token: string): Promise<any> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ML ${res.status}: ${await res.text()}`);
    return res.json();
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    // Find orders needing backfill
    const targets = await db.query<{
      ml_order_id: string;
      ml_buyer_id: number | null;
      seller_nickname: string | null;
      needs_date: boolean;
      needs_lead: boolean;
    }>(
      `SELECT p.ml_order_id, p.ml_buyer_id, p.seller_nickname,
              (p.date_created IS NULL) AS needs_date,
              COALESCE(
                (c.telefone IS NULL OR LENGTH(c.telefone) = 0
                 OR c.cpf IS NULL OR LENGTH(c.cpf) = 0),
                TRUE
              ) AS needs_lead
       FROM ml_pedidos p
       LEFT JOIN ml_clientes c ON c.ml_buyer_id = p.ml_buyer_id
       WHERE p.date_created IS NULL
          OR c.telefone IS NULL OR LENGTH(c.telefone) = 0
          OR c.cpf IS NULL OR LENGTH(c.cpf) = 0`
    );

    const accounts = await getAccounts();
    const accountByNickname = new Map(accounts.map((a) => [a.nickname, a]));

    const stats = {
      total_candidates: targets.rows.length,
      date_populated: 0,
      phone_populated: 0,
      cpf_populated: 0,
      skipped_no_token: 0,
      errors: [] as Array<{ ml_order_id: string; reason: string }>,
    };

    for (const row of targets.rows) {
      const account = row.seller_nickname ? accountByNickname.get(row.seller_nickname) : null;
      if (!account) {
        stats.skipped_no_token++;
        continue;
      }

      try {
        // 1) Fetch order for date_created/date_closed
        if (row.needs_date) {
          const order = await mlGet(`${ML_API}/orders/${row.ml_order_id}`, account.access_token);
          const dc = order?.date_created ?? null;
          const dcl = order?.date_closed ?? null;
          if (dc || dcl) {
            await db.query(
              `UPDATE ml_pedidos
                 SET date_created = COALESCE(date_created, $1),
                     date_closed  = COALESCE(date_closed,  $2)
               WHERE ml_order_id = $3`,
              [dc, dcl, row.ml_order_id]
            );
            if (dc) stats.date_populated++;
          }
          await sleep(500);
        }

        // 2) Fetch billing_info for cpf/phone
        if (row.needs_lead && row.ml_buyer_id) {
          let cpf: string | null = null;
          let phone: string | null = null;
          try {
            const billing = await mlGet(
              `${ML_API}/orders/${row.ml_order_id}/billing_info`,
              account.access_token
            );
            cpf =
              billing?.billing_info?.doc_number ??
              billing?.buyer?.billing_info?.doc_number ??
              billing?.buyer?.billing_info?.tax_payer_id ??
              null;
            const phoneObj = billing?.buyer?.phone ?? null;
            phone = phoneObj
              ? `+55${phoneObj.area_code ?? ''}${phoneObj.number ?? ''}`.replace(/\s/g, '')
              : null;
          } catch (e: any) {
            stats.errors.push({ ml_order_id: row.ml_order_id, reason: `billing_info: ${e?.message ?? 'unknown'}` });
          }

          if (cpf || phone) {
            await db.query(
              `UPDATE ml_clientes
                 SET cpf      = CASE WHEN cpf IS NULL OR LENGTH(cpf) = 0 THEN $1 ELSE cpf END,
                     telefone = CASE WHEN telefone IS NULL OR LENGTH(telefone) = 0 THEN $2 ELSE telefone END,
                     updated_at = NOW()
               WHERE ml_buyer_id = $3`,
              [cpf ? encrypt(cpf) : null, phone ? encrypt(phone) : null, row.ml_buyer_id]
            );
            if (phone) stats.phone_populated++;
            if (cpf) stats.cpf_populated++;
          }
          await sleep(500);
        }
      } catch (e: any) {
        stats.errors.push({ ml_order_id: row.ml_order_id, reason: e?.message ?? 'unknown' });
      }
    }

    return NextResponse.json({ ok: true, stats });
  } catch (err: any) {
    console.error('[api/mercado-livre/pedidos/backfill-billing-info]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
