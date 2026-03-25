import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMlAccounts } from "@/lib/ml-tokens";

const ML_API = "https://api.mercadolibre.com";

async function mlFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ML ${res.status}`);
  return res.json();
}

// Data de início do "hoje" em horário de Brasília (UTC-3) no formato aceito pelo ML
function brasiliaToday(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const date = brt.toISOString().split('T')[0]; // "2026-03-24"
  return `${date}T00:00:00.000-03:00`;
}

function parsePeriod(period: string, customFrom?: string, customTo?: string): { from: string; to?: string; label: string } {
  if (period === 'custom' && customFrom) {
    return {
      from: `${customFrom}T00:00:00.000-03:00`,
      to: customTo ? `${customTo}T23:59:59.000-03:00` : undefined,
      label: `${customFrom} → ${customTo ?? 'hoje'}`,
    };
  }
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.toISOString().split('T')[0]}T00:00:00.000-03:00`;
  };
  switch (period) {
    case '7d':  return { from: daysAgo(7),  label: '7 dias' };
    case '30d': return { from: daysAgo(30), label: '30 dias' };
    case '90d': return { from: daysAgo(90), label: '90 dias' };
    default:    return { from: brasiliaToday(), label: 'Hoje' };
  }
}

// Busca count + revenue paginando até o total real (máx 1000 pedidos por período)
const HARD_CAP = 20; // 20 páginas × 50 = 1000 pedidos max

async function getStats(sellerId: number, token: string, from: string, to?: string) {
  let revenue = 0;
  let count = 0;
  let totalPages = 1;

  for (let page = 0; page < totalPages && page < HARD_CAP; page++) {
    const url = new URL(`${ML_API}/orders/search`);
    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.status", "paid");
    url.searchParams.set("order.date_created.from", from);
    if (to) url.searchParams.set("order.date_created.to", to);
    url.searchParams.set("limit", "50");
    url.searchParams.set("offset", String(page * 50));

    const data = await mlFetch(url.toString(), token);
    const results: any[] = data.results ?? [];

    if (page === 0) {
      count = data.paging?.total ?? results.length;
      totalPages = Math.ceil(count / 50);
    }

    for (const o of results) revenue += o.total_amount || 0;
    if (results.length < 50) break;
  }

  return { count, revenue };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const period = sp.get('period') ?? 'today';
  const { from, to, label } = parsePeriod(period, sp.get('from') ?? undefined, sp.get('to') ?? undefined);

  try {
    const accounts = await getMlAccounts();
    if (!accounts.length) return NextResponse.json({ error: "Nenhuma conta ML configurada." }, { status: 404 });

    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const questionsUrl = new URL(`${ML_API}/questions/search`);
        questionsUrl.searchParams.set("seller_id", String(acc.seller_id));
        questionsUrl.searchParams.set("status", "UNANSWERED");

        const [{ count, revenue }, questionsData] = await Promise.all([
          getStats(acc.seller_id, acc.access_token, from, to),
          mlFetch(questionsUrl.toString(), acc.access_token),
        ]);

        return {
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          status: "active",
          sales_count: count,
          revenue,
          pending_questions: questionsData.paging?.total ?? questionsData.questions?.length ?? 0,
        };
      } catch (e: any) {
        return { nickname: acc.nickname, seller_id: acc.seller_id, status: "error", error: e.message };
      }
    }));

    return NextResponse.json({ period: label, from, to, accounts: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
