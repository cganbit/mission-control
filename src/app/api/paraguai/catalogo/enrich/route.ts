import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool, getPool } from '@/lib/db';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape';

async function getFirecrawlKey(): Promise<string> {
  // Try connector_configs first
  try {
    const db = getPool();
    const row = await db.query(
      `SELECT value FROM connector_configs WHERE key IN ('firecrawl_key', 'FIRECRAWL_KEY') ORDER BY key LIMIT 1`
    );
    if (row.rows[0]?.value) return row.rows[0].value.trim();
  } catch { /* fall through */ }

  // Fall back to env var
  const envKey = process.env.FIRECRAWL_KEY;
  if (envKey) return envKey;

  throw new Error('Firecrawl key not configured. Set FIRECRAWL_KEY env var or add to connector_configs (key: firecrawl_key)');
}

async function ensureEnrichedColumn(db: any) {
  await db.query(`
    ALTER TABLE preco_ml_cache ADD COLUMN IF NOT EXISTS ml_enriched_json JSONB
  `).catch(() => { /* column may already exist */ });
}

function parseMarkdownForEnrichment(markdown: string) {
  // sold_quantity: match "+500 vendidos" or "1.234 vendidos"
  const soldMatch = markdown.match(/\+?(\d[\d.]*)\s*vendidos?/i);
  let sold_quantity: number | null = null;
  if (soldMatch) {
    const raw = soldMatch[1].replace(/\./g, '');
    sold_quantity = parseInt(raw, 10) || null;
  }

  // rating: match "4,8 de 5" or "4,8 Avaliação"
  const ratingMatch = markdown.match(/(\d+(?:,\d)?)\s*(?:de\s*5|Avalia[çc][aã]o)/i);
  const rating = ratingMatch ? ratingMatch[1].replace(',', '.') : null;

  // ranking_position and ranking_category: match "1º em Smartphones" or "3o em Celulares"
  const rankMatch = markdown.match(/(\d+)[ºo°]\s+em\s+([^\n\[\(]+)/i);
  const ranking_position = rankMatch ? parseInt(rankMatch[1], 10) : null;
  const ranking_category = rankMatch ? rankMatch[2].trim().replace(/[*_`]+/g, '') : null;

  // best_price_seller: first "Vendido por X"
  const sellerMatches = [...markdown.matchAll(/Vendido\s+(?:e\s+entregue\s+)?por\s+([^\n\[<\|]+)/gi)];
  const best_price_seller = sellerMatches[0]
    ? sellerMatches[0][1].trim().replace(/[*_`]+/g, '').replace(/\s+/g, ' ')
    : null;

  // winner_seller: second "Vendido por X" (could differ from first)
  const winner_seller = sellerMatches[1]
    ? sellerMatches[1][1].trim().replace(/[*_`]+/g, '').replace(/\s+/g, ' ')
    : null;

  return {
    sold_quantity,
    rating,
    ranking_position,
    ranking_category,
    best_price_seller,
    winner_seller,
  };
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let fingerprint: string;
  try {
    ({ fingerprint } = await req.json());
    if (!fingerprint) throw new Error('missing fingerprint');
  } catch {
    return NextResponse.json({ error: 'fingerprint obrigatório' }, { status: 400 });
  }

  const db = getArbitragemPool();

  // Get product info from DB
  const cacheRow = await db.query(
    `SELECT ml_catalog_id, ml_catalogs_json, ml_catalog_url FROM preco_ml_cache WHERE fingerprint = $1`,
    [fingerprint]
  );

  if (!cacheRow.rows[0]) {
    return NextResponse.json({ error: 'Produto não encontrado na preco_ml_cache' }, { status: 404 });
  }

  const { ml_catalog_id, ml_catalogs_json, ml_catalog_url } = cacheRow.rows[0];

  // Determine catalog URL
  let catalogUrl: string | null = ml_catalog_url;
  if (!catalogUrl && ml_catalog_id) {
    catalogUrl = `https://www.mercadolivre.com.br/p/${ml_catalog_id}#offers`;
  }
  if (!catalogUrl && ml_catalogs_json) {
    const catalogs = Array.isArray(ml_catalogs_json) ? ml_catalogs_json : [];
    const first = catalogs.find((c: any) => c.is_winner) ?? catalogs[0];
    if (first?.url) catalogUrl = first.url;
    else if (first?.catalog_id) catalogUrl = `https://www.mercadolivre.com.br/p/${first.catalog_id}#offers`;
  }

  if (!catalogUrl) {
    return NextResponse.json({ error: 'Sem catalog_id para este produto. Execute ⚡ primeiro.' }, { status: 400 });
  }

  // Ensure URL has #offers
  if (!catalogUrl.includes('#')) {
    catalogUrl = catalogUrl + '#offers';
  }

  const firecrawlKey = await getFirecrawlKey();

  // Call Firecrawl API
  let markdown: string;
  try {
    const fcRes = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: catalogUrl,
        formats: ['markdown'],
        proxy: 'stealth',
        waitFor: 4000,
        actions: [],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!fcRes.ok) {
      const errText = await fcRes.text();
      return NextResponse.json({ error: `Firecrawl ${fcRes.status}: ${errText}` }, { status: 502 });
    }

    const fcData = await fcRes.json();
    markdown = fcData.data?.markdown || fcData.markdown || '';
    if (!markdown) {
      return NextResponse.json({ error: 'Firecrawl retornou markdown vazio' }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Firecrawl error: ${e.message}` }, { status: 502 });
  }

  // Parse markdown
  const enriched = parseMarkdownForEnrichment(markdown);

  // Ensure column exists
  await ensureEnrichedColumn(db);

  // Save to DB
  await db.query(
    `UPDATE preco_ml_cache SET ml_enriched_json = $1 WHERE fingerprint = $2`,
    [JSON.stringify(enriched), fingerprint]
  );

  return NextResponse.json({ ok: true, enriched });
}
