import { NextRequest, NextResponse } from 'next/server';
import { authorizeOAuth } from '@wingx-app/api-ml';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

async function getAppId(): Promise<string> {
  const db = getPool();
  const row = await db.query(
    `SELECT value FROM connector_configs WHERE key IN ('ml_app_id','ML_APP_ID') LIMIT 1`
  );
  const appId = row.rows[0]?.value?.trim() || process.env.ML_APP_ID || '';
  if (!appId) throw new Error('ML_APP_ID não configurado em connector_configs');
  return appId;
}

// GET /api/mercado-livre/oauth/authorize
// Redireciona para a tela de autorização do ML
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const appId = await getAppId();
    const redirectUri = `${process.env.MC_URL ?? 'https://mc.wingx.app.br'}/api/mercado-livre/oauth/callback`;

    const { redirectUrl } = await authorizeOAuth({ appId, redirectUri });
    return NextResponse.redirect(redirectUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
