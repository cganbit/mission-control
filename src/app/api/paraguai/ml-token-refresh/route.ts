import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { sendWhatsApp } from '@/lib/whatsapp';

const ML_API = 'https://api.mercadolibre.com';
const WORKER_KEY = process.env.WORKER_KEY;

interface MlAccount {
  seller_id: number;
  nickname: string;
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms timestamp
}

async function getAppCredentials(): Promise<{ appId: string; clientSecret: string }> {
  const db = getPool();

  // Try DB first (connector_configs), fallback to env vars
  const rows = await db.query(
    `SELECT key, value FROM connector_configs WHERE key IN ('ml_app_id','ml_client_secret','ML_APP_ID','ML_CLIENT_SECRET')`
  ).catch(() => ({ rows: [] as any[] }));

  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key.toLowerCase()] = r.value.trim();

  const appId = map['ml_app_id'] || map['ml_app_id'] || process.env.ML_APP_ID || '';
  const clientSecret = map['ml_client_secret'] || process.env.ML_CLIENT_SECRET || '';

  if (!appId || !clientSecret) {
    throw new Error('ML_APP_ID e ML_CLIENT_SECRET não configurados (env vars ou connector_configs)');
  }
  return { appId, clientSecret };
}

async function getAllAccounts(): Promise<MlAccount[]> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) throw new Error('ml_tokens_json não encontrado em connector_configs');
  const parsed = JSON.parse(row.rows[0].value);
  const accounts: MlAccount[] = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  if (!accounts.length) throw new Error('Nenhuma conta ML no ml_tokens_json');
  return accounts;
}

async function saveAllAccounts(accounts: MlAccount[]): Promise<void> {
  const db = getPool();
  const newPayload = { accounts };
  const newValue = JSON.stringify(newPayload);
  await db.query(
    `UPDATE connector_configs SET value = $1, updated_at = NOW() WHERE key = 'ml_tokens_json'`,
    [newValue]
  );

  // Sync to file (diagnóstico — label endpoint lê do DB, não do arquivo)
  const ML_TOKENS_FILE = process.env.ML_TOKENS_PATH || '/opt/ml-data/tokens.json';
  try {
    const { writeFileSync } = await import('fs');
    writeFileSync(ML_TOKENS_FILE, JSON.stringify(newPayload, null, 2));
  } catch (e: any) {
    // Falha silenciosa não impacta o fluxo principal (label lê do DB)
    // mas deve ser investigada se tokens.json for usado por outros processos
    console.error('[ml-token-refresh] SYNC FAIL — tokens.json não atualizado:', ML_TOKENS_FILE, e.message);
  }
}

const REFRESH_MARGIN_MS = 2 * 60 * 60 * 1000; // refresh se expira em < 2h
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000, 8000]; // backoff: 2s, 4s, 8s
const STAGGER_MS = 600; // delay entre contas para evitar rate limit

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function refreshAccount(
  account: MlAccount,
  appId: string,
  clientSecret: string,
  force = false,
): Promise<{ account: MlAccount; refreshed: boolean; error?: string }> {
  if (!force && account.expires_at && Date.now() < account.expires_at - REFRESH_MARGIN_MS) {
    return { account, refreshed: false }; // still valid
  }

  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 8000);
    }

    try {
      const res = await fetch(`${ML_API}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: appId,
          client_secret: clientSecret,
          refresh_token: account.refresh_token,
        }).toString(),
        signal: AbortSignal.timeout(15000),
      });

      // Rate limit / upstream error → retry
      if (res.status === 429 || res.status === 503) {
        lastError = `HTTP ${res.status} (tentativa ${attempt + 1}/${MAX_RETRIES + 1})`;
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        return { account, refreshed: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }

      const token = await res.json();
      const updated: MlAccount = {
        ...account,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? account.refresh_token,
        expires_at: Date.now() + (token.expires_in ?? 21600) * 1000,
      };
      return { account: updated, refreshed: true };
    } catch (e: any) {
      lastError = e.message;
    }
  }

  return { account, refreshed: false, error: `Falhou após ${MAX_RETRIES + 1} tentativas: ${lastError}` };
}

// Refresh sequencial com stagger para evitar rate limit do ML
async function refreshAllSequential(
  accounts: MlAccount[],
  appId: string,
  clientSecret: string,
  force = false,
) {
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    if (i > 0) await sleep(STAGGER_MS);
    results.push(await refreshAccount(accounts[i], appId, clientSecret, force));
  }
  return results;
}


// ─── POST — refresh all ML tokens ────────────────────────────────────────────
// Auth: JWT session (dashboard) OR x-worker-key header (cron)

export async function POST(req: NextRequest) {
  // Accept both session auth (dashboard) and worker key (cron)
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { appId, clientSecret } = await getAppCredentials();
    const accounts = await getAllAccounts();

    const force = req.nextUrl.searchParams.get('force') === '1';
    const results = await refreshAllSequential(accounts, appId, clientSecret, force);

    // Save all updated accounts back
    const updatedAccounts = results.map(r => r.account);
    await saveAllAccounts(updatedAccounts);

    // Report
    const summary = results.map(r => ({
      seller_id: r.account.seller_id,
      nickname: r.account.nickname,
      refreshed: r.refreshed,
      expires_at: new Date(r.account.expires_at).toISOString(),
      error: r.error ?? null,
    }));

    const failed = results.filter(r => r.error);
    if (failed.length > 0) {
      const msg = `⚠️ ML Token Refresh — ${failed.length} conta(s) com erro:\n`
        + failed.map(r => `• ${r.account.nickname}: ${r.error}`).join('\n');
      await sendWhatsApp(msg);
      await logAudit('worker', 'ml_token_refresh_parcial', null, { summary, failed: failed.length });
    } else {
      const refreshed = results.filter(r => r.refreshed).length;
      if (refreshed > 0) {
        await logAudit('worker', 'ml_token_refresh_ok', null, { summary, refreshed });
      }
    }

    return NextResponse.json({
      ok: true,
      total: results.length,
      refreshed: results.filter(r => r.refreshed).length,
      errors: failed.length,
      accounts: summary,
    });

  } catch (e: any) {
    const msg = `🚨 ML Token Refresh — erro crítico: ${e.message}`;
    await sendWhatsApp(msg);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ─── GET — status dos tokens (sem refresh) ───────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const accounts = await getAllAccounts();
    const now = Date.now();
    return NextResponse.json(accounts.map(a => ({
      seller_id: a.seller_id,
      nickname: a.nickname,
      expires_at: new Date(a.expires_at).toISOString(),
      expires_in_min: Math.round((a.expires_at - now) / 60000),
      valid: a.expires_at > now,
      expires_soon: a.expires_at < now + 60 * 60 * 1000, // < 1h
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
