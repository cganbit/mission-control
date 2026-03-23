import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool, getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

const WORKER_KEY = process.env.WORKER_KEY || 'catalogo-worker-2026';
const ML_API = 'https://api.mercadolibre.com';

async function ensureTable(db: any) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS catalog_refresh_queue (
      id SERIAL PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      product_name TEXT NOT NULL,
      min_price NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
      requested_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      error_detail TEXT,
      UNIQUE(fingerprint)
    )
  `);
  // Add error_detail if table already exists without it
  await db.query(`ALTER TABLE catalog_refresh_queue ADD COLUMN IF NOT EXISTS error_detail TEXT`).catch(() => {});
}

// ─── ML Token helpers (reads from connector_configs or env) ──────────────────

async function getMlTokenFromDb(): Promise<{ seller_id?: number; access_token: string; refresh_token: string; expires_at: number } | null> {
  try {
    const db = getPool();
    const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
    if (!row.rows[0]) return null;
    const arr = JSON.parse(row.rows[0].value);
    const accounts = Array.isArray(arr) ? arr : (arr.accounts ?? []);
    if (!accounts.length) return null;
    return accounts[0];
  } catch {
    return null;
  }
}

async function saveMlTokenToDb(
  updated: { access_token: string; refresh_token: string; expires_at: number },
  sellerId?: number
) {
  try {
    const db = getPool();
    const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
    if (!row.rows[0]) return;
    const arr = JSON.parse(row.rows[0].value);
    const accounts: any[] = Array.isArray(arr) ? arr : (arr.accounts ?? []);
    // Update matching account by seller_id, fallback to index 0
    const idx = sellerId ? accounts.findIndex(a => a.seller_id === sellerId) : 0;
    if (idx >= 0) accounts[idx] = { ...accounts[idx], ...updated };
    const newValue = Array.isArray(arr) ? JSON.stringify(accounts) : JSON.stringify({ ...arr, accounts });
    await db.query(
      `UPDATE connector_configs SET value = $1, updated_at = NOW() WHERE key = 'ml_tokens_json'`,
      [newValue]
    );
  } catch { /* non-critical */ }
}

async function getValidMlToken(): Promise<string> {
  const account = await getMlTokenFromDb();
  if (!account) {
    throw new Error('ML tokens not found in connector_configs (key: ml_tokens_json)');
  }

  // Still valid with 60s margin
  if (account.expires_at && Date.now() < account.expires_at - 60_000) {
    return account.access_token;
  }

  // Refresh
  const appId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!appId || !clientSecret) {
    // Use existing token even if nominally expired
    console.warn('[QUEUE] ML_APP_ID/ML_CLIENT_SECRET not set — using existing token');
    return account.access_token;
  }

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.warn('[QUEUE] Token refresh failed, using existing:', await res.text());
    return account.access_token;
  }

  const token = await res.json();
  const updated = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
  await saveMlTokenToDb(updated, account.seller_id);
  return updated.access_token;
}

// ─── ML catalog search + prices ──────────────────────────────────────────────

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ML ${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

interface CatalogResult {
  catalog_id: string;
  title: string;
  url: string;
  price_premium: number | null;
  price_classic: number | null;
  is_winner: boolean;
  seller_count: number;
  sold_quantity: number;
  available_quantity: number;
  updated_at: string;
}

async function buildCatalogsViaApi(productName: string, token: string, pinnedId: string | null = null): Promise<CatalogResult[]> {
  // Normalize: merge numbers with their units ("16 gb"→"16gb", "256 gb"→"256gb")
  const normalize = (s: string) => s.toLowerCase()
    .replace(/(\d+)\s+(gb|tb|mb|ssd|ram|cpu|gpu|ghz)/gi, '$1$2');

  const normName = normalize(productName);
  const allWords = normName.split(/\s+/).filter((w: string) => w.length > 1);

  // Core words = no digits (brand/model family, e.g. "apple mac mini")
  // Spec words = with digits (generation/capacity, e.g. "m4", "16gb", "256gb")
  const coreWords = allWords.filter((w: string) => !/\d/.test(w));
  const specWords = allWords.filter((w: string) => /\d/.test(w));

  // Two parallel searches:
  // 1. Full product name → high relevance for the exact variant
  // 2. Core words only → broader coverage sorted by most sold
  const coreQuery = coreWords.slice(0, 4).join(' ');
  const [fullData, broadData] = await Promise.all([
    mlGet(`/products/search?site_id=MLB&q=${encodeURIComponent(productName)}&limit=20`, token),
    coreQuery !== normName
      ? mlGet(`/products/search?site_id=MLB&q=${encodeURIComponent(coreQuery)}&limit=30&sort=sold_quantity_desc`, token)
      : Promise.resolve({ results: [] }),
  ]);

  // Merge: full-query results first (higher relevance), then broad results (by sales)
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const item of [...(fullData.results || []), ...(broadData.results || [])]) {
    if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
  }

  const ACESSORIO = /\b(capa|case|capinha|p[eé]l[ií]cula|protetor|suporte|carregador|cabo|adaptador|fone)\b/i;
  const discovered: { catalog_id: string; title: string }[] = [];

  for (const item of merged) {
    if (discovered.length >= 8) break;
    const name = normalize(item.name || '');
    if (ACESSORIO.test(name)) continue;

    // All core words must be present
    if (!coreWords.every((w: string) => name.includes(w))) continue;

    // At least 1 spec word must match (or no specs = accept all core matches)
    if (specWords.length > 0) {
      const specMatched = specWords.filter((w: string) => name.includes(w)).length;
      if (specMatched === 0) continue;
    }

    discovered.push({ catalog_id: item.id, title: item.name });
  }

  // If user pinned a catalog manually and it wasn't found by search, prepend it
  if (pinnedId && !discovered.find(d => d.catalog_id === pinnedId)) {
    discovered.unshift({ catalog_id: pinnedId, title: pinnedId });
  }

  const catalogs = await Promise.all(
    discovered.map(async (cat, idx) => {
      try {
        // Ordem natural do ML (sem sort) — primeiro item de cada tipo = winner daquele tipo
        const itemsData = await mlGet(
          `/products/${cat.catalog_id}/items?limit=50`,
          token
        );
        const items: any[] = itemsData.results || [];

        // gold_special = Premium | gold_pro = Clássico
        // Ignorar CBT (Cross Border Trade) — vendedores internacionais, não representam preço local
        // Ignorar gold_pro + fulfillment — aparecem como Premium na página, não como Clássico
        const isCbt = (i: any) => Array.isArray(i.tags) && i.tags.includes('cbt_item');
        const premiumItems  = items.filter((i: any) => i.listing_type_id === 'gold_special' && !isCbt(i));
        const catalogItems  = items.filter((i: any) =>
          i.listing_type_id === 'gold_pro' &&
          i.shipping?.logistic_type !== 'fulfillment' &&
          !isCbt(i)
        );

        const premiumPrices = premiumItems.map((i: any) => i.price).filter(Boolean);
        const catalogPrices = catalogItems.map((i: any) => i.price).filter(Boolean);

        const hasFull = items.some((i: any) => i.shipping?.logistic_type === 'fulfillment');

        return {
          catalog_id: cat.catalog_id,
          title: cat.title,
          url: `https://www.mercadolivre.com.br/p/${cat.catalog_id}#offers`,
          price_premium: premiumPrices.length ? Math.min(...premiumPrices) : null,
          price_classic: catalogPrices.length  ? Math.min(...catalogPrices)  : null,
          has_full: hasFull,
          is_winner: idx === 0,
          seller_count: itemsData.paging?.total || 0,
          sold_quantity: 0,
          available_quantity: 0,
          updated_at: new Date().toISOString(),
        } as CatalogResult;
      } catch {
        return {
          catalog_id: cat.catalog_id,
          title: cat.title,
          url: `https://www.mercadolivre.com.br/p/${cat.catalog_id}#offers`,
          price_premium: null,
          price_classic: null,
          is_winner: idx === 0,
          seller_count: 0,
          sold_quantity: 0,
          available_quantity: 0,
          updated_at: new Date().toISOString(),
        } as CatalogResult;
      }
    })
  );

  return catalogs;
}

// ─── Inline job processor ─────────────────────────────────────────────────────

async function processJobInline(job: { id: number; fingerprint: string; product_name: string }) {
  const db = getArbitragemPool();

  try {
    // Mark as processing
    await db.query(
      `UPDATE catalog_refresh_queue SET status = 'processing' WHERE id = $1`,
      [job.id]
    );

    const token = await getValidMlToken();

    // Check if there's a pinned catalog_id the user set manually
    const pinnedRow = await db.query(
      `SELECT ml_catalog_id FROM preco_ml_cache WHERE fingerprint = $1`,
      [job.fingerprint]
    );
    const pinnedId: string | null = pinnedRow.rows[0]?.ml_catalog_id ?? null;

    const allCatalogs = await buildCatalogsViaApi(job.product_name, token, pinnedId);

    // Remove catalogs with no sellers AND no prices — noise from broad ML search
    const catalogs = allCatalogs.filter(c =>
      c.seller_count > 0 || c.price_premium !== null || c.price_classic !== null
    );

    if (!catalogs.length) {
      await db.query(
        `UPDATE catalog_refresh_queue SET status = 'error', processed_at = NOW() WHERE id = $1`,
        [job.id]
      );
      return;
    }

    // Save to preco_ml_cache
    // Pick primary = catalog with prices (most sellers), fallback to first
    // Pick primary = catalog with prices (most sellers), fallback to first
    const withPrices = catalogs.filter(c => c.price_premium !== null || c.price_classic !== null);
    const primary = withPrices.sort((a, b) => (b.seller_count ?? 0) - (a.seller_count ?? 0))[0]
      ?? catalogs[0];
    // Mark is_winner correctly in the array
    catalogs.forEach(c => { c.is_winner = c.catalog_id === primary.catalog_id; });
    const premium = primary.price_premium ?? null;
    const classic = primary.price_classic ?? null;

    // Ensure extra columns exist (idempotent — safe to run repeatedly)
    await db.query(`
      ALTER TABLE preco_ml_cache
        ADD COLUMN IF NOT EXISTS ml_catalog_id    TEXT,
        ADD COLUMN IF NOT EXISTS ml_catalog_url   TEXT,
        ADD COLUMN IF NOT EXISTS ml_catalogs_json JSONB,
        ADD COLUMN IF NOT EXISTS ml_price_premium NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS ml_price_classic NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS ml_shipping_type TEXT
    `).catch(() => {}); // ignore if ALTER is not supported (no perms) — columns probably already exist

    await db.query(
      `INSERT INTO preco_ml_cache
         (fingerprint, ml_catalog_id, ml_catalog_url, catalog_ids, ml_catalogs_json,
          has_catalog, ml_price_premium, ml_price_classic, preco_ml_real, ml_shipping_type,
          updated_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '12 hours')
       ON CONFLICT (fingerprint) DO UPDATE
         SET ml_catalog_id    = EXCLUDED.ml_catalog_id,
             ml_catalog_url   = EXCLUDED.ml_catalog_url,
             catalog_ids      = EXCLUDED.catalog_ids,
             ml_catalogs_json = EXCLUDED.ml_catalogs_json,
             has_catalog      = TRUE,
             ml_price_premium = EXCLUDED.ml_price_premium,
             ml_price_classic = EXCLUDED.ml_price_classic,
             preco_ml_real    = EXCLUDED.preco_ml_real,
             ml_shipping_type = EXCLUDED.ml_shipping_type,
             updated_at       = NOW(),
             expires_at       = NOW() + INTERVAL '12 hours'`,
      [
        job.fingerprint,
        primary.catalog_id,
        `https://www.mercadolivre.com.br/p/${primary.catalog_id}#offers`,
        catalogs.map(c => c.catalog_id),
        JSON.stringify(catalogs),
        premium,
        classic,
        classic ?? premium,
        premium !== null ? 'FULL' : 'NORMAL',
      ]
    );

    await db.query(
      `UPDATE catalog_refresh_queue SET status = 'done', processed_at = NOW() WHERE id = $1`,
      [job.id]
    );

    console.log(`[QUEUE] Inline done: ${job.fingerprint} — ${catalogs.length} catálogos`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(`[QUEUE] Inline error for ${job.fingerprint}:`, msg);
    await db.query(
      `UPDATE catalog_refresh_queue SET status = 'error', processed_at = NOW(), error_detail = $2 WHERE id = $1`,
      [job.id, msg.slice(0, 500)]
    ).catch(() => {});
  }
}

// ─── POST — enqueue a refresh job (JWT required) ─────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fingerprint, product_name, min_price = 0 } = await req.json();
  if (!fingerprint || !product_name) {
    return NextResponse.json({ error: 'fingerprint e product_name obrigatórios' }, { status: 400 });
  }

  const db = getArbitragemPool();
  await ensureTable(db);

  await db.query(
    `INSERT INTO catalog_refresh_queue (fingerprint, product_name, min_price, status, requested_at)
     VALUES ($1, $2, $3, 'pending', NOW())
     ON CONFLICT (fingerprint) DO UPDATE
       SET status = 'pending', product_name = $2, min_price = $3, requested_at = NOW(), processed_at = NULL`,
    [fingerprint, product_name, min_price]
  );

  await logAudit(session.username, 'catalogo_refresh_solicitado', fingerprint, { product_name, min_price });
  return NextResponse.json({ ok: true, fingerprint });
}

// ─── GET — browser checks status (also processes inline if pending) ───────────

export async function GET(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const url = new URL(req.url);
  const fingerprint = url.searchParams.get('fingerprint');

  const db = getArbitragemPool();
  await ensureTable(db);

  // Browser checking status of a specific fingerprint
  if (fingerprint) {
    const session = await getSessionFromRequest(req);
    if (!session && workerKey !== WORKER_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const row = await db.query(
      'SELECT id, status, product_name, processed_at, error_detail FROM catalog_refresh_queue WHERE fingerprint = $1',
      [fingerprint]
    );

    const record = row.rows[0];
    if (!record) {
      return NextResponse.json({ fingerprint, status: 'not_found' });
    }

    const status: string = record.status;

    // If pending → process inline (VPS has ML token access)
    if (status === 'pending') {
      const job = { id: record.id, fingerprint, product_name: record.product_name };
      await processJobInline(job);

      // Re-read actual status — processJobInline catches its own errors internally
      const updated = await db.query(
        'SELECT status, processed_at FROM catalog_refresh_queue WHERE id = $1',
        [record.id]
      );
      const finalRow = updated.rows[0];
      const finalStatus = finalRow?.status ?? 'error';
      const errorDetail = finalRow?.error_detail ?? null;
      return NextResponse.json({ fingerprint, status: finalStatus, error: errorDetail });
    }

    return NextResponse.json({ fingerprint, status });
  }

  // Worker fetching pending jobs (local fallback worker)
  if (workerKey !== WORKER_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch pending jobs and mark as processing (atomic-ish)
  const result = await db.query(
    `UPDATE catalog_refresh_queue
     SET status = 'processing'
     WHERE fingerprint IN (
       SELECT fingerprint FROM catalog_refresh_queue
       WHERE status = 'pending'
       ORDER BY requested_at ASC
       LIMIT 3
     )
     RETURNING id, fingerprint, product_name, min_price`
  );

  return NextResponse.json({ jobs: result.rows });
}
