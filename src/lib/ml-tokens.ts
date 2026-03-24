import { getPool } from '@/lib/db';

export interface MlAccount {
  seller_id: number;
  nickname: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getMlAccounts(): Promise<MlAccount[]> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return [];
  const parsed = JSON.parse(row.rows[0].value);
  return Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
}
