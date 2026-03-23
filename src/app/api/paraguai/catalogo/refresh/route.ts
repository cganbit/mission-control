import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';

const WORKER_KEY = process.env.WORKER_KEY || 'catalogo-worker-2026';

interface CatalogEntry {
  catalog_id: string;
  title?: string;
  url: string;
  price_premium: number | null;
  price_classic: number | null;
  is_winner?: boolean;
  seller_count?: number;
  sold_quantity?: number;
  available_quantity?: number;
  updated_at?: string;
}

export async function POST(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let job_id: number | undefined;
  let fingerprint: string | undefined;

  try {
    const body = await req.json();
    fingerprint = body.fingerprint;
    const catalogs: CatalogEntry[] = body.catalogs;
    job_id = body.job_id;

    if (!fingerprint) return NextResponse.json({ error: 'Fingerprint required' }, { status: 400 });
    if (!Array.isArray(catalogs) || catalogs.length === 0) {
      return NextResponse.json({ error: 'catalogs[] obrigatório' }, { status: 400 });
    }

    const db = getArbitragemPool();

    const primary: CatalogEntry = catalogs.find((c: CatalogEntry) => c.is_winner) ?? catalogs[0];
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
        catalogs.map((c: CatalogEntry) => c.catalog_id),
        JSON.stringify(catalogs),
        premium,
        classic,
        classic ?? premium,
        premium !== null ? 'FULL' : 'NORMAL',
        fingerprint,
      ]
    );

    if (job_id) {
      await db.query(
        `UPDATE catalog_refresh_queue SET status = 'done', processed_at = NOW() WHERE id = $1`,
        [job_id]
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      primary_catalog_id: primary.catalog_id,
      catalogs_count: catalogs.length,
      premium,
      classic,
    });
  } catch (e: any) {
    console.error('Refresh catalog error:', e);
    if (job_id) {
      try {
        const db = getArbitragemPool();
        await db.query(
          `UPDATE catalog_refresh_queue SET status = 'error', processed_at = NOW() WHERE id = $1`,
          [job_id]
        );
      } catch {}
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
