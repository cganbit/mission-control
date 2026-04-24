import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { handleOAuthCallback, type OAuthCallbackResult } from '@wingx-app/api-ml';

interface MlAccount {
  seller_id: number;
  nickname: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function getAppCredentials(): Promise<{ appId: string; clientSecret: string }> {
  const db = getPool();
  const rows = await db.query(
    `SELECT key, value FROM connector_configs WHERE key IN ('ml_app_id','ml_client_secret','ML_APP_ID','ML_CLIENT_SECRET')`
  );
  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key.toLowerCase()] = r.value.trim();

  const appId = map['ml_app_id'] || process.env.ML_APP_ID || '';
  const clientSecret = map['ml_client_secret'] || process.env.ML_CLIENT_SECRET || '';
  if (!appId || !clientSecret) throw new Error('ML_APP_ID e ML_CLIENT_SECRET não configurados');
  return { appId, clientSecret };
}

async function saveAccount(account: MlAccount): Promise<void> {
  const db = getPool();

  // Lê accounts existentes
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  let accounts: MlAccount[] = [];
  if (row.rows[0]) {
    const parsed = JSON.parse(row.rows[0].value);
    accounts = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  }

  // Upsert
  const idx = accounts.findIndex(a => a.seller_id === account.seller_id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);

  const newPayload = JSON.stringify({ accounts });

  await db.query(
    `INSERT INTO connector_configs (key, value, updated_at) VALUES ('ml_tokens_json', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [newPayload]
  );

  // tokens.json removido — tudo lê do DB (connector_configs)
}

function htmlPage(success: boolean, nickname?: string, error?: string): NextResponse {
  const mcUrl = process.env.MC_URL ?? 'https://mc.wingx.app.br';
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Conta conectada' : 'Erro na conexão'} — Mission Control</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #1e293b; border: 1px solid ${success ? '#22c55e33' : '#ef444433'};
            border-radius: 16px; padding: 40px 48px; text-align: center; max-width: 420px; width: 100%; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px;
         color: ${success ? '#4ade80' : '#f87171'}; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .nickname { font-weight: 700; color: #e2e8f0; }
    a { display: inline-block; background: #6366f1; color: white; text-decoration: none;
        padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;
        transition: background 0.2s; }
    a:hover { background: #4f46e5; }
  </style>
  ${success ? `<meta http-equiv="refresh" content="3;url=${mcUrl}/mercado-livre">` : ''}
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${success ? 'Conta conectada!' : 'Erro na conexão'}</h1>
    ${success
      ? `<p>A conta <span class="nickname">${nickname}</span> foi autorizada com sucesso.<br>Redirecionando para o painel...</p>`
      : `<p>${error ?? 'Ocorreu um erro ao conectar a conta. Tente novamente.'}</p>`
    }
    <a href="${mcUrl}/mercado-livre">Ir para o painel</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: success ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// GET /api/mercado-livre/oauth/callback?code=TG-xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return htmlPage(false, undefined, `Autorização negada: ${errorParam}`);
  }
  if (!code) {
    return htmlPage(false, undefined, 'Código de autorização não recebido.');
  }

  try {
    const { appId, clientSecret } = await getAppCredentials();
    const redirectUri = `${process.env.MC_URL ?? 'https://mc.wingx.app.br'}/api/mercado-livre/oauth/callback`;

    let result: OAuthCallbackResult;
    try {
      result = await handleOAuthCallback({ code, appId, clientSecret, redirectUri });
    } catch (e: any) {
      const codeErr = e?.code;
      if (codeErr === 'ML_TOKEN_EXCHANGE_FAILED') {
        console.error('[ML OAuth] Token exchange failed:', e?.message);
        return htmlPage(false, undefined, `Falha ao obter token (${e?.status ?? ''}).`);
      }
      if (codeErr === 'ML_USER_FETCH_FAILED') {
        return htmlPage(false, undefined, 'Falha ao buscar dados do usuário.');
      }
      if (codeErr === 'TIMEOUT') {
        return htmlPage(false, undefined, 'Timeout ao conectar com Mercado Livre.');
      }
      throw e;
    }

    const account: MlAccount = {
      seller_id: result.seller_id,
      nickname: result.nickname,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: Date.now() + (result.expires_in ?? 21600) * 1000,
    };

    await saveAccount(account);
    console.log(`[ML OAuth] Conta conectada: ${account.nickname} (${account.seller_id})`);

    return htmlPage(true, account.nickname);
  } catch (e: any) {
    console.error('[ML OAuth] Erro:', e.message);
    return htmlPage(false, undefined, e.message);
  }
}
