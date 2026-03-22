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

async function mlPost(url: string, token: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
  return res.json();
}

// GET /api/mercado-livre/questions?seller_id=X
// Lista perguntas não respondidas com contexto do produto
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sellerIdParam = searchParams.get("seller_id");

  try {
    const accounts = getTokens();
    const targets = sellerIdParam
      ? accounts.filter((a) => a.seller_id === Number(sellerIdParam))
      : accounts;

    const all: any[] = [];

    for (const account of targets) {
      try {
        const res = await mlGet(
          `https://api.mercadolibre.com/questions/search?seller_id=${account.seller_id}&status=UNANSWERED&limit=50`,
          account.access_token
        );
        const questions = res.questions || [];
        const withContext = await Promise.all(
          questions.map(async (q: any) => {
            let item_title = "";
            let item_description = "";
            try {
              const item = await mlGet(`https://api.mercadolibre.com/items/${q.item_id}`, account.access_token);
              item_title = item.title || "";
              const desc = await mlGet(`https://api.mercadolibre.com/items/${q.item_id}/description`, account.access_token);
              item_description = (desc.plain_text || "").slice(0, 500);
            } catch { /* ignore */ }
            return {
              question_id: q.id,
              question_text: q.text,
              item_id: q.item_id,
              item_title,
              item_description,
              date_created: q.date_created,
              seller_id: account.seller_id,
              nickname: account.nickname,
            };
          })
        );
        all.push(...withContext);
      } catch (e: any) {
        all.push({ error: e.message, seller_id: account.seller_id, nickname: account.nickname });
      }
    }

    return NextResponse.json(all);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/mercado-livre/questions
// Body: { seller_id, question_id, text }
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { seller_id, question_id, text } = body;
    if (!seller_id || !question_id || !text) {
      return NextResponse.json({ error: "seller_id, question_id e text obrigatórios" }, { status: 400 });
    }

    const accounts = getTokens();
    const account = accounts.find((a) => a.seller_id === seller_id);
    if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

    const result = await mlPost("https://api.mercadolibre.com/answers", account.access_token, {
      question_id,
      text,
    });
    return NextResponse.json({ ok: true, answer: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
