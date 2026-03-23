import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape';
const SOURCE_URL = 'https://atacadoconnect.com/';

// In-memory cache: refreshed every 30min
let cachedRate: number | null = null;
let cachedAt = 0;
const CACHE_TTL = 30 * 60 * 1000;

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
  throw new Error('Firecrawl key não configurada');
}

async function fetchRate(): Promise<number> {
  const firecrawlKey = await getFirecrawlKey();

  const res = await fetch(FIRECRAWL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ url: SOURCE_URL, formats: ['rawHtml'], proxy: 'stealth', waitFor: 3000 }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
  const data = await res.json();
  const html: string = data.data?.rawHtml || data.rawHtml || '';
  if (!html) throw new Error('HTML vazio');

  // <span class="ui-outputlabel-label">R$&nbsp;5,44</span>
  // Try specific element first, then fallback to any R$&nbsp; pattern
  const patterns = [
    /ui-outputlabel-label[^>]*>R\$(?:&nbsp;|\s)([\d]+[,.][\d]{2})/,
    /header-extra-label-currency[^"]*"[^>]*>(?:[^<]*<[^>]+>)*R\$(?:&nbsp;|\s)([\d]+[,.][\d]{2})/,
    /R\$(?:&nbsp;|\s)([\d]+[,.][\d]{2})/,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const rate = parseFloat(m[1].replace(',', '.'));
      if (rate > 3 && rate < 15) return rate;
    }
  }

  throw new Error('Taxa não encontrada no HTML');
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const bust = req.nextUrl.searchParams.has('bust');
  if (!bust && cachedRate && now - cachedAt < CACHE_TTL) {
    return NextResponse.json({ rate: cachedRate, source: 'atacadoconnect.com', cached: true });
  }

  try {
    const rate = await fetchRate();
    cachedRate = rate;
    cachedAt = now;
    return NextResponse.json({ rate, source: 'atacadoconnect.com', cached: false });
  } catch (err: any) {
    if (cachedRate) {
      return NextResponse.json({ rate: cachedRate, source: 'atacadoconnect.com', cached: true, stale: true });
    }
    return NextResponse.json({ rate: 5.80, source: 'fallback', error: err.message }, { status: 200 });
  }
}
