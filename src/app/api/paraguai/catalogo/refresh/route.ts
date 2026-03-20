import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem'),
  max: 5,
});

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? '';

function generateSlug(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]+/g, '-')    // Substitui caracteres especiais por hífens
    .replace(/^-+|-+$/g, '');        // Remove hífens no início e fim
}

async function discoverCatalogsViaML(productName: string) {
  const slug = generateSlug(productName);
  const url = `https://lista.mercadolivre.com.br/${slug}`;
  
  console.log(`Discovering catalogs via ML Surface: ${url}`);
  
  const payload = {
    url: url,
    formats: ["markdown"],
    onlyMainContent: true,
    proxy: "stealth",
    waitFor: 3000
  };

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    const md = data.data?.markdown || "";
    
    if (!md || md.includes("Para continuar, acesse sua conta")) {
        console.error("ML block or empty response during discovery.");
        return null;
    }

    // Identificar blocos de produtos para evitar pegar recomendados do final
    // No markdown do Firecrawl, produtos geralmente começam com n. ![
    const blocks = md.split(/\n\d+\. !\[/).slice(1, 20); // Pegar top 20
    const catalogs: any[] = [];
    const seenIds = new Set<string>();

    for (const block of blocks) {
        const lower = block.toLowerCase();
        // Filtro de novo
        const isUsed = ['recondicionado','usado','excelente','caixa aberta','remanufaturado','semi novo','seminovo'].some(k => lower.includes(k));
        if (isUsed) continue;

        const catalogMatch = block.match(/\/p\/(MLB\d+)/);
        if (catalogMatch) {
            const cid = catalogMatch[1];
            if (!seenIds.has(cid)) {
                seenIds.add(cid);
                
                // Extração básica de preço do bloco para o JSONB
                let price = null;
                const priceMatch = block.match(/R\$\s*([\d\.]+(?:,\d{2})?)/);
                if (priceMatch) {
                    price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
                }

                catalogs.push({
                    catalog_id: cid,
                    url: `https://www.mercadolivre.com.br/p/${cid}#offers`,
                    shipping_badge: lower.includes('full') ? 'FULL' : 'NORMAL',
                    price_premium: null, // Será preenchido se for o vencedor
                    price_classic: price // Preço aproximado da busca
                });
            }
        }
    }

    return catalogs;
  } catch (e) {
    console.error('Discovery error:', e);
    return null;
  }
}

function extractPriceFromMarkdown(md: string, minPrice: number = 0) {
  if (!md || md.length < 500) return null;

  const prices: number[] = [];
  const regex = /R\$\s*([\d\.]+(?:,\d{2})?)/g;
  let match;

  // Prioritize first 5000 characters for the main BuyBox
  const topMd = md.slice(0, 5000);
  while ((match = regex.exec(topMd)) !== null) {
    let valStr = match[1].replace(/\./g, '').replace(',', '.');
    let val = parseFloat(valStr);
    if (!isNaN(val) && val > minPrice) { 
      prices.push(val);
    }
  }

  if (prices.length === 0) return null;

  return Math.min(...prices.slice(0, 5));
}

async function scrapeWithFirecrawl(url: string) {
  const payload = {
    url: url,
    formats: ["markdown"],
    onlyMainContent: true,
    mobile: true,
    proxy: "stealth",
    waitFor: 2000
  };

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    // Firecrawl v1 returns { success: true, data: { ... } } or { error: "..." }
    if (data.data?.markdown) {
        return { success: true, data: data.data };
    }
    return { success: false, error: data.error || data.message || "Unknown Firecrawl error" };
  } catch (e) {
    console.error('Firecrawl error:', e);
    return { success: false, error: String(e) };
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!FIRECRAWL_API_KEY) return NextResponse.json({ error: 'FIRECRAWL_API_KEY não configurada' }, { status: 503 });

  try {
    const { fingerprint } = await req.json();
    if (!fingerprint) return NextResponse.json({ error: 'Fingerprint required' }, { status: 400 });

    // 1. Check if product has a catalog ID
    const dbRes = await pool.query(
      `SELECT ml_catalog_id, ml_catalog_url FROM preco_ml_cache WHERE fingerprint = $1 LIMIT 1`,
      [fingerprint]
    );

    let catalogId = dbRes.rows[0]?.ml_catalog_id;
    let catalogUrl = dbRes.rows[0]?.ml_catalog_url;
    let markdownContent: string | null = null;

    // Fallback search if no catalog ID exists in cache
    let mlCatalogsJson: any[] = [];
    
    if (!catalogId) {
      console.log(`Catalog ID missing for fingerprint: ${fingerprint}. Searching via Native ML Discovery...`);

      const productRes = await pool.query(
        `SELECT titulo_amigavel, ultimo_preco_usd FROM produtos_mestre WHERE fingerprint = $1`,
        [fingerprint]
      );
      const productName = productRes.rows[0]?.titulo_amigavel;
      const ultimoPrecoUsd = productRes.rows[0]?.ultimo_preco_usd || 0;

      if (!productName) {
        return NextResponse.json({ error: 'Product name not found for searching catalog.' }, { status: 404 });
      }

      const foundCatalogs = await discoverCatalogsViaML(productName);
      if (foundCatalogs && foundCatalogs.length > 0) {
          mlCatalogsJson = foundCatalogs;
          catalogId = foundCatalogs[0].catalog_id;
          catalogUrl = foundCatalogs[0].url;
          
          console.log(`Found ${foundCatalogs.length} catalogs. Winner: ${catalogId}`);

          // Update cache with found catalog IDs
          const allIds = foundCatalogs.map(c => c.catalog_id);
          await pool.query(
            `UPDATE preco_ml_cache SET ml_catalog_id = $1, catalog_ids = $2, ml_catalogs_json = $3, has_catalog = TRUE, updated_at = NOW() WHERE fingerprint = $4`,
            [catalogId, allIds, JSON.stringify(foundCatalogs), fingerprint]
          );
      } else {
        return NextResponse.json({
          error: 'Catalog ID not found via Native ML Discovery.',
          searched_term: productName
        }, { status: 404 });
      }
    }

    const targetUrl = catalogUrl || `https://www.mercadolivre.com.br/p/${catalogId}#offers`;
    console.log(`Refreshing catalog for ${fingerprint} using URL: ${targetUrl}`);

    const scrapeRes = await scrapeWithFirecrawl(targetUrl);
    if (!scrapeRes.success) {
      return NextResponse.json({ error: 'Firecrawl failed', detail: scrapeRes.error }, { status: 500 });
    }

    const md = scrapeRes.data?.markdown || "";

    // 1. Get current supplier price to establish a minPrice safety floor
    const prodInfo = await pool.query(`SELECT ultimo_preco_usd FROM produtos_mestre WHERE fingerprint = $1`, [fingerprint]);
    const usdPrice = prodInfo.rows[0]?.ultimo_preco_usd || 0;
    const minPriceFloor = usdPrice * 4.0; // Security threshold (BRL must be > 4x USD)

    // Extract prices prioritizing main content and high-value matches
    let lowestPremium = Infinity;
    let lowestClassic = Infinity;

    // We only look at the first 7000 characters to avoid accessories at the bottom
    const mainMd = md.slice(0, 7000);
    
    // Improved Regex logic: Match R$ PRICE followed by installment pattern
    const priceBlocks = mainMd.matchAll(/R\$([\d\.]+(?:,\d{2})?)\n\n(\d+x[^\n]+)/g);
    for (const match of priceBlocks) {
      const priceStr = match[1];
      const inst = match[2];
      const pVal = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));

      // Audit Rule: Skip prices below reasonable floor
      if (pVal < minPriceFloor) continue;

      if (inst.toLowerCase().includes("sem juros")) {
        if (pVal < lowestPremium) lowestPremium = pVal;
      } else {
        if (pVal < lowestClassic) lowestClassic = pVal;
      }
    }

    // Fallback: Use simple extraction if block-based fails
    if (lowestPremium === Infinity && lowestClassic === Infinity) {
        const fallbackPrice = extractPriceFromMarkdown(md, minPriceFloor);
        if (fallbackPrice) {
            lowestClassic = fallbackPrice;
        } else {
            return NextResponse.json({ error: 'No valid prices found in catalog page (Audit failure or no matches)' }, { status: 404 });
        }
    }

    // 2. Update the cache
    await pool.query(
      `UPDATE preco_ml_cache 
       SET ml_price_premium = $1, 
           ml_price_classic = $2, 
           preco_ml_real = $3,
           ml_shipping_type = $4,
           updated_at = NOW(),
           expires_at = NOW() + INTERVAL '12 hours'
       WHERE fingerprint = $5`,
      [
        lowestPremium === Infinity ? null : lowestPremium,
        lowestClassic === Infinity ? null : lowestClassic,
        lowestClassic === Infinity ? (lowestPremium === Infinity ? null : lowestPremium) : lowestClassic,
        md.toLowerCase().includes('full') ? 'FULL' : 'NORMAL',
        fingerprint
      ]
    );

    return NextResponse.json({
      success: true,
      premium: lowestPremium === Infinity ? null : lowestPremium,
      classic: lowestClassic === Infinity ? null : lowestClassic,
      catalog_id: catalogId
    });

  } catch (e: any) {
    console.error('Refresh catalog error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
