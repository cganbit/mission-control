import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool, getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape';

async function getFirecrawlKey(): Promise<string> {
  try {
    const db = getPool();
    const row = await db.query(
      `SELECT value FROM connector_configs WHERE key IN ('firecrawl_key', 'FIRECRAWL_KEY') ORDER BY key LIMIT 1`
    );
    if (row.rows[0]?.value) return row.rows[0].value.trim();
  } catch { /* fall through */ }

  const envKey = process.env.FIRECRAWL_KEY;
  if (envKey) return envKey;

  throw new Error('Firecrawl key not configured. Set FIRECRAWL_KEY env var or add to connector_configs (key: firecrawl_key)');
}

async function ensureEnrichedColumn(db: any) {
  await db.query(`
    ALTER TABLE preco_ml_cache ADD COLUMN IF NOT EXISTS ml_enriched_json JSONB
  `).catch(() => {});
}

function parseMarkdownForEnrichment(markdown: string) {
  // sold_quantity: "+1000 vendidos" or "1.234 vendidos"
  const soldMatch = markdown.match(/\+?(\d[\d.]*)\s*vendidos?/i);
  let sold_quantity: number | null = null;
  if (soldMatch) {
    sold_quantity = parseInt(soldMatch[1].replace(/\./g, ''), 10) || null;
  }

  // rating: decimal before "de 5" — avoids matching plain integers like "180 de 5"
  const ratingMatch = markdown.match(/(\d+[,.]\d+)\s*de\s*5/i);
  let rating: string | null = null;
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1].replace(',', '.'));
    if (r >= 1 && r <= 5) rating = r.toFixed(1);
  }

  // review_count: "180 opiniões" or "1.234 avaliações" — \S+ avoids unicode class issues
  const reviewMatch = markdown.match(/(\d[\d.]*)\s+(?:opini\S+|avalia\S+)/i);
  let review_count: number | null = null;
  if (reviewMatch) {
    review_count = parseInt(reviewMatch[1].replace(/\./g, ''), 10) || null;
  }

  // seller_count_fc: "38 produtos novos"
  const sellerCountMatch = markdown.match(/(\d+)\s+produtos?\s+novos?/i);
  const seller_count_fc = sellerCountMatch ? parseInt(sellerCountMatch[1], 10) : null;

  // min_price_brl: "a partir de R$4.290,29" → 4290.29
  const minPriceMatch = markdown.match(/a\s+partir\s+de\s+R\$\s*([\d.,]+)/i);
  let min_price_brl: number | null = null;
  if (minPriceMatch) {
    const raw = minPriceMatch[1].replace(/\.(?=\d{3})/g, '').replace(',', '.');
    min_price_brl = parseFloat(raw) || null;
  }

  // ranking: "1º em Smartphones" — strip ] artifact from category name
  const rankMatch = markdown.match(/(\d+)[ºo°]\s+em\s+([^\n\[\(\]]+)/i);
  const ranking_position = rankMatch ? parseInt(rankMatch[1], 10) : null;
  const ranking_category = rankMatch ? rankMatch[2].trim().replace(/[*_`\[\]]+/g, '') : null;

  // Seller name helper: handles plain text, [Name](url), [**Name**](url), Name**](url
  function extractSellerName(raw: string): string | null {
    if (!raw) return null;
    const linkMatch = raw.match(/\[([^\]]+)\]/);
    if (linkMatch) return linkMatch[1].replace(/[*_`]+/g, '').trim() || null;
    const clean = raw.split(/\]\(|\s*\||\s*\(<|\[/)[0].trim().replace(/[*_`\]]+/g, '');
    // Strip trailing seller ID codes like " · SL20241009111309"
    const withoutId = clean.replace(/\s*[·•]\s*[A-Z0-9]{8,}$/i, '').trim();
    return withoutId || null;
  }

  // Helper: parse BRL string → number ("1.989" → 1989, "2.049" → 2049)
  function parseBRL(s: string): number | null {
    // "1.989" = thousand sep → 1989; "204,90" = decimal → 204.90
    // Detect: if has comma → decimal format (204,90), else thousand sep (1.989)
    const hasComma = s.includes(',');
    const dotCount = (s.match(/\./g) ?? []).length;
    if (hasComma) {
      // "1.234,56" or "204,90"
      const clean = s.replace(/\./g, '').replace(',', '.');
      return parseFloat(clean) || null;
    } else if (dotCount === 1) {
      const afterDot = s.split('.')[1] || '';
      if (afterDot.length === 3) {
        // "1.989", "2.049" — pt-BR thousand separator → 1989, 2049
        return parseInt(s.replace(/\./g, ''), 10) || null;
      } else {
        // "204.90", "1.5" — decimal dot
        return parseFloat(s) || null;
      }
    } else {
      // "1989", "20490" — no dots, no comma
      return parseInt(s.replace(/\./g, ''), 10) || null;
    }
  }

  // Sellers: capture ALL "Vendido [e entregue] por X", deduplicate, preserve order
  // For each seller, find the last standalone price (\nR$X\n) in 1200 chars before — reliable for first 2
  const sellerMatches = [...markdown.matchAll(/Vendido\s+(?:e\s+entregue\s+)?por\s*([^\n]+)/gi)];
  const allSellers: { name: string; price: number | null }[] = [];
  const seenNames = new Set<string>();

  for (const m of sellerMatches) {
    const name = extractSellerName(m[1] as string);
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);

    // Look for standalone price (\nR$X\n) in preceding 1200 chars
    const ctxBefore = markdown.slice(Math.max(0, m.index! - 1200), m.index);
    const standalonePrices = [...ctxBefore.matchAll(/\nR\$([\d][\d.,]+)\n/g)];
    const lastStandalone = standalonePrices.length > 0
      ? standalonePrices[standalonePrices.length - 1][1]
      : null;
    const price = lastStandalone ? parseBRL(lastStandalone) : null;

    allSellers.push({ name, price });
  }

  // [0] = cheapest (Melhor preço context), [1] = buybox winner (Adicionar ao carrinho context)
  const best_price_seller = allSellers[0]?.name ?? null;
  const winner_seller = (allSellers[1]?.name && allSellers[1].name !== allSellers[0]?.name)
    ? allSellers[1].name : null;

  // Classic/Premium price detection via seções do modal "meios de pagamento":
  // - Seção "Parcelamento sem juros" → R$PRICE logo abaixo = Premium
  // - Seção "Melhor preço" → R$PRICE logo abaixo = Clássico (mais barato)
  // Fallback: instalamento 12x sem "sem juros" = Clássico, ≤10x com "sem juros" = Premium
  let price_classic_fc: number | null = null;
  let price_premium_fc: number | null = null;

  // Método primário: seções com label explícito
  const premiumSectionMatch = markdown.match(/Parcelamento\s+sem\s+juros[\s\S]{0,400}?R\$([\d.,]+)/);
  if (premiumSectionMatch) {
    const p = parseBRL(premiumSectionMatch[1]);
    if (p && p > 1) price_premium_fc = p;
  }

  const classicSectionMatch = markdown.match(/Melhor\s+pre[cç]o[\s\S]{0,400}?R\$([\d.,]+)/);
  if (classicSectionMatch) {
    const p = parseBRL(classicSectionMatch[1]);
    if (p && p > 1) price_classic_fc = p;
  }

  // Computar todos os blocos de preço standalone uma vez (reutilizado abaixo)
  const standalonePriceBlocks = [...markdown.matchAll(/\nR\$([\d][\d.,]+)\n([\s\S]{0,300})/g)];

  // Winner price: primeiro bloco standalone = buybox (preço em destaque no topo)
  let price_winner: number | null = null;
  let price_winner_type: 'classic' | 'premium' | null = null;
  if (standalonePriceBlocks.length > 0) {
    const [, priceStr, content] = standalonePriceBlocks[0];
    const price = parseBRL(priceStr);
    if (price && price > 1) {
      price_winner = price;
      const instMatch = content.match(/(\d+)x\s*R\$[\d.,]+/);
      if (instMatch) {
        const nParcelas = parseInt(instMatch[1], 10);
        const semJuros = /sem\s+juros/i.test(content.slice(0, (instMatch.index ?? 0) + 60));
        if (nParcelas === 12 && !semJuros) price_winner_type = 'classic';
        else if (semJuros) price_winner_type = 'premium';
      }
    }
  }

  // Fallback: scanner de blocos de preço + parcelas (usa array já computado)
  if (!price_premium_fc || !price_classic_fc) {
    for (const [, priceStr, content] of standalonePriceBlocks) {
      const instMatch = content.match(/(\d+)x\s*R\$[\d.,]+/);
      if (!instMatch) continue;
      const nParcelas = parseInt(instMatch[1], 10);
      const semJuros = /sem\s+juros/i.test(content.slice(0, (instMatch.index ?? 0) + 60));
      const price = parseBRL(priceStr);
      if (!price) continue;
      if (nParcelas === 12 && !semJuros && price_classic_fc === null) price_classic_fc = price;
      if (nParcelas <= 10 && semJuros && price_premium_fc === null) price_premium_fc = price;
    }
  }

  return {
    sold_quantity,
    rating,
    review_count,
    seller_count_fc,
    min_price_brl,
    ranking_position,
    ranking_category,
    best_price_seller,
    winner_seller,
    sellers: allSellers,   // { name, price } — price só confiável para os 2 primeiros
    price_winner,          // preço buybox (primeiro destaque da página)
    price_winner_type,     // 'classic' | 'premium' | null
    price_classic_fc,      // preço Clássico detectado (Melhor preço / 12x)
    price_premium_fc,      // preço Premium detectado (Parcelamento sem juros / ≤10x)
  };
}

function buildSlugUrl(catalogId: string, title?: string): string {
  if (title) {
    const slug = title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    if (slug) return `https://www.mercadolivre.com.br/${slug}/p/${catalogId}`;
  }
  return `https://www.mercadolivre.com.br/p/${catalogId}`;
}

async function scrapeCatalog(catalogId: string, firecrawlKey: string, title?: string) {
  const url = buildSlugUrl(catalogId, title);
  const fcRes = await fetch(FIRECRAWL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ url, formats: ['markdown'], proxy: 'stealth', waitFor: 7000 }),
    signal: AbortSignal.timeout(50000),
  });
  if (!fcRes.ok) throw new Error(`Firecrawl ${fcRes.status}`);
  const fcData = await fcRes.json();
  const markdown = fcData.data?.markdown || fcData.markdown || '';
  if (!markdown) throw new Error('markdown vazio');
  return parseMarkdownForEnrichment(markdown);
}

// POST { fingerprint } — enriquecer TODOS os catálogos do produto via Firecrawl (paralelo)
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
  await ensureEnrichedColumn(db);

  const cacheRow = await db.query(
    `SELECT ml_catalog_id, ml_catalogs_json, ml_catalog_url FROM preco_ml_cache WHERE fingerprint = $1`,
    [fingerprint]
  );
  if (!cacheRow.rows[0]) {
    return NextResponse.json({ error: 'Produto não encontrado. Execute ⚡ primeiro.' }, { status: 404 });
  }

  const { ml_catalog_id, ml_catalogs_json, ml_catalog_url } = cacheRow.rows[0];

  // Build catalog list to enrich
  let catalogs: any[] = Array.isArray(ml_catalogs_json) ? ml_catalogs_json : [];

  // Fallback: if no catalogs array but has primary ID, synthetic entry
  if (catalogs.length === 0 && ml_catalog_id) {
    catalogs = [{
      catalog_id: ml_catalog_id,
      url: ml_catalog_url ?? `https://www.mercadolivre.com.br/p/${ml_catalog_id}#offers`,
    }];
  }

  if (catalogs.length === 0) {
    return NextResponse.json({ error: 'Nenhum catálogo encontrado. Execute ⚡ primeiro.' }, { status: 400 });
  }

  const firecrawlKey = await getFirecrawlKey();

  // Enrich all catalogs in parallel — usa URL com slug para renderizar página correta
  const enriched = await Promise.all(
    catalogs.map(async (cat: any) => {
      try {
        const data = await scrapeCatalog(cat.catalog_id, firecrawlKey, cat.title);
        return {
          ...cat,
          // Propagar preços detectados pelo Firecrawl direto nos campos do catálogo
          price_classic: data.price_classic_fc ?? cat.price_classic ?? null,
          price_premium: data.price_premium_fc ?? cat.price_premium ?? null,
          price_winner: data.price_winner ?? null,
          price_winner_type: data.price_winner_type ?? null,
          enriched: { ...data, enriched_at: new Date().toISOString() },
        };
      } catch {
        return cat;
      }
    })
  );

  // Save updated catalogs_json (enriched data is now per-catalog inside the array)
  await db.query(
    `UPDATE preco_ml_cache SET ml_catalogs_json = $1, updated_at = NOW() WHERE fingerprint = $2`,
    [JSON.stringify(enriched), fingerprint]
  );

  // If the primary catalog was enriched, update ml_price_classic / ml_price_premium
  // with the Firecrawl-detected prices (more accurate than API-based listing_type filter)
  const primaryEnriched = enriched.find((c: any) => c.catalog_id === ml_catalog_id);
  if (primaryEnriched?.enriched) {
    const { price_classic_fc, price_premium_fc } = primaryEnriched.enriched;
    if (price_classic_fc !== undefined || price_premium_fc !== undefined) {
      const updates: string[] = [];
      const vals: any[] = [];
      if (price_classic_fc !== undefined && price_classic_fc !== null) {
        vals.push(price_classic_fc);
        updates.push(`ml_price_classic = $${vals.length}`);
      }
      if (price_premium_fc !== undefined && price_premium_fc !== null) {
        vals.push(price_premium_fc);
        updates.push(`ml_price_premium = $${vals.length}`);
      }
      if (updates.length > 0) {
        vals.push(fingerprint);
        await db.query(
          `UPDATE preco_ml_cache SET ${updates.join(', ')}, updated_at = NOW() WHERE fingerprint = $${vals.length}`,
          vals
        );
      }
    }
  }

  const enriched_count = enriched.filter((c: any) => c.enriched?.enriched_at).length;
  await logAudit(session.username, 'catalogo_enriquecido', fingerprint, { enriched_count, total: enriched.length });
  return NextResponse.json({ ok: true, enriched_count, total: enriched.length });
}
