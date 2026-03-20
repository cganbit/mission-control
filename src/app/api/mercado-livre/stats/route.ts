import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

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
        // Obter vendas do dia para o dashboard
        const dateFrom = new Date();
        dateFrom.setHours(0, 0, 0, 0);

        const ordersUrl = new URL("https://api.mercadolibre.com/orders/search");
        ordersUrl.searchParams.set("seller", String(acc.seller_id));
        ordersUrl.searchParams.set("order.date_created_from", dateFrom.toISOString());
        ordersUrl.searchParams.set("limit", "50");

        const ordersRes = await fetch(ordersUrl.toString(), {
          headers: { Authorization: `Bearer ${acc.access_token}` }
        });
        const ordersData = await ordersRes.json();

        // Obter perguntas pendentes
        const questionsUrl = new URL("https://api.mercadolibre.com/questions/search");
        questionsUrl.searchParams.set("seller_id", String(acc.seller_id));
        questionsUrl.searchParams.set("status", "UNANSWERED");

        const questionsRes = await fetch(questionsUrl.toString(), {
          headers: { Authorization: `Bearer ${acc.access_token}` }
        });
        const questionsData = await questionsRes.json();

        // paging.total = total real de vendas (sem limite de paginação)
        const salesTotal = ordersData.paging?.total ?? ordersData.results?.length ?? 0;
        const totalAmount = ordersData.results?.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0) || 0;
        const pendingQuestions = questionsData.paging?.total ?? questionsData.questions?.length ?? 0;

        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          sales_today: salesTotal,
          total_amount: totalAmount,
          pending_questions: pendingQuestions,
          status: "active"
        });
      } catch (e: any) {
        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          status: "error",
          error: e.message || "Unknown error"
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
