import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

async function mlFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function getMonthRevenue(sellerId: number, token: string): Promise<number> {
  const firstDay = new Date();
  firstDay.setDate(1);
  firstDay.setHours(0, 0, 0, 0);

  let total = 0;
  let offset = 0;

  while (true) {
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.searchParams.set("seller", String(sellerId));
    url.searchParams.set("order.date_created_from", firstDay.toISOString());
    url.searchParams.set("limit", "50");
    url.searchParams.set("offset", String(offset));

    const data = await mlFetch(url.toString(), token);
    const results = data.results ?? [];

    for (const o of results) total += o.total_amount || 0;

    if (results.length < 50) break;
    offset += 50;
  }

  return total;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tokensPath = process.env.ML_TOKENS_PATH ||
      path.join(process.cwd(), "../../../projects/mercadolivre-mcp/data/tokens.json");

    if (!fs.existsSync(tokensPath)) {
      return NextResponse.json({ error: "Configuração multi-contas não encontrada." }, { status: 404 });
    }

    const data = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
    const accounts = data.accounts || [];
    const results = [];

    for (const acc of accounts) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayUrl = new URL("https://api.mercadolibre.com/orders/search");
        todayUrl.searchParams.set("seller", String(acc.seller_id));
        todayUrl.searchParams.set("order.date_created_from", today.toISOString());
        todayUrl.searchParams.set("limit", "1");

        const totalUrl = new URL("https://api.mercadolibre.com/orders/search");
        totalUrl.searchParams.set("seller", String(acc.seller_id));
        totalUrl.searchParams.set("limit", "1");

        const questionsUrl = new URL("https://api.mercadolibre.com/questions/search");
        questionsUrl.searchParams.set("seller_id", String(acc.seller_id));
        questionsUrl.searchParams.set("status", "UNANSWERED");

        const [todayData, totalData, questionsData, monthRevenue] = await Promise.all([
          mlFetch(todayUrl.toString(), acc.access_token),
          mlFetch(totalUrl.toString(), acc.access_token),
          mlFetch(questionsUrl.toString(), acc.access_token),
          getMonthRevenue(acc.seller_id, acc.access_token),
        ]);

        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          status: "active",
          sales_today: todayData.paging?.total ?? 0,
          sales_total: totalData.paging?.total ?? 0,
          month_revenue: monthRevenue,
          pending_questions: questionsData.paging?.total ?? questionsData.questions?.length ?? 0,
        });
      } catch (e: any) {
        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          status: "error",
          error: e.message || "Unknown error",
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
