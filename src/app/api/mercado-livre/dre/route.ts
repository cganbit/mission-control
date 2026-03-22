import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

function getTokens() {
  const tokensPath =
    process.env.ML_TOKENS_PATH ||
    path.join(process.cwd(), "../../../projects/mercadolivre-mcp/data/tokens.json");
  if (!fs.existsSync(tokensPath)) throw new Error("tokens.json não encontrado");
  const data = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
  return (data.accounts || []) as Array<{
    seller_id: number;
    nickname: string;
    access_token: string;
  }>;
}

async function mlGet(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchDRE(
  sellerId: number,
  token: string,
  from: string,
  to: string
) {
  let offset = 0;
  const limit = 50;
  let allOrders: any[] = [];

  while (true) {
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.date_created_from", from);
    url.searchParams.set("order.date_created_to", to);
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const data = await mlGet(url.toString(), token);
    const results = data.results || [];
    allOrders = allOrders.concat(results);

    if (allOrders.length >= (data.paging?.total ?? 0) || results.length < limit) break;
    offset += limit;
  }

  let faturamento_bruto = 0;
  for (const order of allOrders) faturamento_bruto += order.total_amount || 0;

  const comissao_ml = Math.round(faturamento_bruto * 0.18 * 100) / 100;
  const faturamento_liquido = Math.round((faturamento_bruto - comissao_ml) * 100) / 100;
  const ticket_medio = allOrders.length
    ? Math.round((faturamento_bruto / allOrders.length) * 100) / 100
    : 0;

  return {
    seller_id: sellerId,
    total_orders: allOrders.length,
    faturamento_bruto: Math.round(faturamento_bruto * 100) / 100,
    comissao_ml,
    faturamento_liquido,
    ticket_medio,
  };
}

// GET /api/mercado-livre/dre?seller_id=X&from=2026-03-01T00:00:00.000-03:00&to=2026-03-31T23:59:59.000-03:00
// seller_id é opcional — se omitido, retorna DRE de todas as contas
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sellerIdParam = searchParams.get("seller_id");

  // Período padrão: mês corrente
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;

  try {
    const accounts = getTokens();
    const targets = sellerIdParam
      ? accounts.filter((a) => a.seller_id === Number(sellerIdParam))
      : accounts;

    const results = await Promise.all(
      targets.map(async (acc) => {
        try {
          const dre = await fetchDRE(acc.seller_id, acc.access_token, from, to);
          return { ...dre, nickname: acc.nickname, period: { from, to } };
        } catch (e: any) {
          return {
            seller_id: acc.seller_id,
            nickname: acc.nickname,
            error: e.message,
            period: { from, to },
          };
        }
      })
    );

    // Totais consolidados
    const valid = results.filter((r) => !("error" in r)) as any[];
    const consolidated = {
      total_orders: valid.reduce((s, r) => s + (r.total_orders ?? 0), 0),
      faturamento_bruto: Math.round(valid.reduce((s, r) => s + (r.faturamento_bruto ?? 0), 0) * 100) / 100,
      comissao_ml: Math.round(valid.reduce((s, r) => s + (r.comissao_ml ?? 0), 0) * 100) / 100,
      faturamento_liquido: Math.round(valid.reduce((s, r) => s + (r.faturamento_liquido ?? 0), 0) * 100) / 100,
    };

    return NextResponse.json({ period: { from, to }, accounts: results, consolidated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
