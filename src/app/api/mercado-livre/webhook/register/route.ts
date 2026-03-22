import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const ML_API = 'https://api.mercadolibre.com';

async function getAppId(): Promise<string> {
  const db = getPool();
  const rows = await db.query(
    `SELECT key, value FROM connector_configs WHERE key IN ('ml_app_id','ML_APP_ID')`
  );
  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key.toLowerCase()] = r.value.trim();
  const appId = map['ml_app_id'] || process.env.ML_APP_ID || '';
  if (!appId) throw new Error('ml_app_id não configurado em connector_configs');
  return appId;
}

async function getAnyToken(): Promise<string> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) throw new Error('ml_tokens_json não encontrado');
  const parsed = JSON.parse(row.rows[0].value);
  const accounts = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  if (!accounts.length) throw new Error('Nenhuma conta ML autenticada');
  return accounts[0].access_token;
}

// ─── GET — lista webhooks registrados na ML API ───────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [appId, token] = await Promise.all([getAppId(), getAnyToken()]);
    const res = await fetch(`${ML_API}/applications/${appId}/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ML API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── POST — registra webhook para orders_v2 ───────────────────────────────────
// Body: { callback_url: "https://your-domain/api/mercado-livre/webhook" }
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let callbackUrl: string;
  try {
    const body = await req.json();
    callbackUrl = body.callback_url;
    if (!callbackUrl) return NextResponse.json({ error: 'callback_url obrigatório' }, { status: 400 });
    if (!callbackUrl.startsWith('https://')) {
      return NextResponse.json({
        error: 'ML exige HTTPS na callback_url. Use um domínio com SSL ou tunnel HTTPS.',
        hint: 'Ex: https://meudominio.com/api/mercado-livre/webhook',
      }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const [appId, token] = await Promise.all([getAppId(), getAnyToken()]);

    const res = await fetch(`${ML_API}/applications/${appId}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic: 'orders_v2', callback_url: callbackUrl, active: true }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    return NextResponse.json({ ok: true, subscription: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── DELETE — remove webhook ──────────────────────────────────────────────────
// Body: { subscription_id: "123" }
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let subscriptionId: string;
  try {
    const body = await req.json();
    subscriptionId = body.subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'subscription_id obrigatório' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const [appId, token] = await Promise.all([getAppId(), getAnyToken()]);
    const res = await fetch(`${ML_API}/applications/${appId}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`ML API ${res.status}: ${await res.text()}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
