import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";
import axios from "axios";

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
        
        const response = await axios.get(`https://api.mercadolibre.com/orders/search`, {
          params: { 
            seller: acc.seller_id,
            "order.date_created_from": dateFrom.toISOString(),
            limit: 5
          },
          headers: { Authorization: `Bearer ${acc.access_token}` }
        });

        // Obter perguntas pendentes
        const questionsResponse = await axios.get(`https://api.mercadolibre.com/questions/search`, {
          params: { seller_id: acc.seller_id, status: "UNANSWERED" },
          headers: { Authorization: `Bearer ${acc.access_token}` }
        });

        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          sales_today: response.data.results.length,
          total_amount: response.data.results.reduce((acc: number, o: any) => acc + o.total_amount, 0),
          pending_questions: questionsResponse.data.questions.length,
          status: "active"
        });
      } catch (e: any) {
        results.push({
          nickname: acc.nickname,
          seller_id: acc.seller_id,
          status: "error",
          error: e.response?.data?.message || e.message
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
