import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool, getPool } from '@/lib/db';

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
      UNIQUE(fingerprint)
    )
  `);
}

// ─── ML Token helpers (reads from connector_configs or env) ──────────────────

async function getMlTokenFromDb(): Promise<{ access_token: string; refresh_token: string; expires_at: number } | null> {
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

async function saveMlTokenToDb(account: { access_token: string; refresh_token: string; expires_at: number }) {
  try {
    const db = getPool();
    // Read current value, update first account
    const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
    if (!row.rows[0]) return;
    const arr = JSON.parse(row.rows[0].value);
    const accounts = Array.isArray(arr) ? arr : (arr.accounts ?? []);
    if (accounts.length) {
      accounts[0] = { ...accounts[0], ...account };
    }
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
  await saveMlTokenToDb(updated);
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

async function buildCatalogsViaApi(productName: string, token: string): Promise<CatalogResult[]> {
  const searchData = await mlGet(
    `/products/search?site_id=MLB&q=${encodeURIComponent(productName)}&limit=15`,
    token
  );

  const queryWords = productName.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
  const ACESSORIO = /\b(capa|case|capinha|p[eé]l[ií]cula|protetor|suporte|carregador|cabo|adaptador|fone)\b/i;
  const discovered: { catalog_id: string; title: string }[] = [];

  for (const item of (searchData.results || [])) {
    if (discovered.length >= 5) break;
    const name = (item.name || '').toLowerCase();
    if (ACESSORIO.test(name)) continue;
    const matchCount = queryWords.filter((w: string) => name.includes(w)).length;
    if (matchCount >= Math.ceil(queryWords.length * 0.6)) {
      discovered.push({ catalog_id: item.id, title: item.name });
    }
  }

  const catalogs = await Promise.all(
    discovered.map(async (cat, idx) => {
      try {
        const itemsData = await mlGet(
          `/products/${cat.catalog_id}/items?limit=50&sort=price_asc`,
          token
        );
        const items: any[] = itemsData.results || [];
        const fullItems = items.filter((i: any) => i.shipping?.logistic_type === 'fulfillment');
        const classicItems = items.filter((i: any) => i.shipping?.logistic_type !== 'fulfillment');

        return {
          catalog_id: cat.catalog_id,
          title: cat.title,
          url: `https://www.mercadolivre.com.br/p/${cat.catalog_id}#offers`,
          price_premium: fullItems.length ? fullItems[0].price : null,
          price_classic: classicItems.length ? classicItems[0].price : null,
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
    const catalogs = await buildCatalogsViaApi(job.product_name, token);

    if (!catalogs.length) {
      await db.query(
        `UPDATE catalog_refresh_queue SET status = 'error', processed_at = NOW() WHERE id = $1`,
        [job.id]
      );
      return;
    }

    // Save to preco_ml_cache
    const primary = catalogs.find(c => c.is_winner) ?? catalogs[0];
    const premium = primary.price_premium ?? null;
    const classic = primary.price_classic ?? null;

    await db.query(
      `UPDATE preco_ml_cache
       SET ml_catalog_id   = $1,
           catalog_ids     = $2,
           ml_catalogs_json = $3,
           has_catalog     = TRUE,
           ml_price_premium = $4,
           ml_price_classic = $5,
           preco_ml_real   = $6,
           ml_shipping_type = $7,
           updated_at      = NOW(),
           expires_at      = NOW() + INTERVAL '12 hours'
       WHERE fingerprint = $8`,
      [
        primary.catalog_id,
        catalogs.map(c => c.catalog_id),
        JSON.stringify(catalogs),
        premium,
        classic,
        classic ?? premium,
        premium !== null ? 'FULL' : 'NORMAL',
        job.fingerprint,
      ]
    );

    await db.query(
      `UPDATE catalog_refresh_queue SET status = 'done', processed_at = NOW() WHERE id = $1`,
      [job.id]
    );

    console.log(`[QUEUE] Inline done: ${job.fingerprint} — ${catalogs.length} catálogos`);
  } catch (e: any) {
    console.error(`[QUEUE] Inline error for ${job.fingerprint}:`, e.message);
    await db.query(
      `UPDATE catalog_refresh_queue SET status = 'error', processed_at = NOW() WHERE id = $1`,
      [job.id]
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
      'SELECT id, status, product_name, processed_at FROM catalog_refresh_queue WHERE fingerprint = $1',
      [fingerprint]
    );

    const record = row.rows[0];
    if (!record) {
      return NextResponse.json({ fingerprint, status: 'not_found' });
    }

    const status: string = record.status;

    // If pending → process inline (VPS has ML token access)
    if (status === 'pending') {
      // Fire-and-forget with a 25s timeout budget
      const job = { id: record.id, fingerprint, product_name: record.product_name };

      // Run inline processing — we await it so the browser gets 'done' immediately
      // Use AbortSignal timeout to cap at 25s
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        await processJobInline(job);
        clearTimeout(timeout);
        return NextResponse.json({ fingerprint, status: 'done' });
      } catch {
        clearTimeout(timeout);
        return NextResponse.json({ fingerprint, status: 'error' });
      }
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
