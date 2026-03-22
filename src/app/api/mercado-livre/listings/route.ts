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

async function mlPut(url: string, token: string, body: object) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
  return res.json();
}

// GET /api/mercado-livre/listings?seller_id=X&status=active&offset=0&limit=50
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sellerId = Number(searchParams.get("seller_id"));
  const status = searchParams.get("status") || "active";
  const offset = Number(searchParams.get("offset") || 0);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 50);

  if (!sellerId) return NextResponse.json({ error: "seller_id obrigatório" }, { status: 400 });

  try {
    const accounts = getTokens();
    const account = accounts.find((a) => a.seller_id === sellerId);
    if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

    const searchUrl = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=${status}&offset=${offset}&limit=${limit}`;
    const searchRes = await mlGet(searchUrl, account.access_token);
    const itemIds: string[] = searchRes.results || [];
    const total = searchRes.paging?.total ?? 0;

    if (!itemIds.length) return NextResponse.json({ total, items: [] });

    // Buscar detalhes em batch (até 20 por chamada)
    const items: any[] = [];
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20).join(",");
      const detailRes = await mlGet(`https://api.mercadolibre.com/items?ids=${batch}`, account.access_token);
      for (const entry of detailRes) {
        if (entry.code === 200) {
          const it = entry.body;
          items.push({
            id: it.id,
            title: it.title,
            price: it.price,
            available_quantity: it.available_quantity,
            sold_quantity: it.sold_quantity,
            status: it.status,
            permalink: it.permalink,
            thumbnail: it.thumbnail,
          });
        }
      }
    }

    return NextResponse.json({ total, items, seller_id: sellerId, nickname: account.nickname });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/mercado-livre/listings
// Body: { seller_id, item_id, price?, available_quantity?, title? }
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { seller_id, item_id, price, available_quantity, title } = body;
    if (!seller_id || !item_id) {
      return NextResponse.json({ error: "seller_id e item_id obrigatórios" }, { status: 400 });
    }

    const accounts = getTokens();
    const account = accounts.find((a) => a.seller_id === seller_id);
    if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

    const update: Record<string, any> = {};
    if (price !== undefined) update.price = price;
    if (available_quantity !== undefined) update.available_quantity = available_quantity;
    if (title !== undefined) update.title = title;

    const result = await mlPut(`https://api.mercadolibre.com/items/${item_id}`, account.access_token, update);
    return NextResponse.json({ ok: true, item: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
