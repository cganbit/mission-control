import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

// ─── GET /api/mercado-livre/accounts ─────────────────────────────────────────
// Admin: todas as contas | Member: apenas as suas

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getPool();
  let rows;

  if (hasRole(session, 'admin')) {
    const result = await db.query(
      `SELECT a.*, u.username AS owner_username
       FROM ml_account_configs a
       LEFT JOIN users u ON u.id = a.owner_user_id
       ORDER BY a.created_at DESC`
    );
    rows = result.rows;
  } else {
    const result = await db.query(
      `SELECT a.*, u.username AS owner_username
       FROM ml_account_configs a
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.owner_user_id = $1
       ORDER BY a.created_at DESC`,
      [session.sub]
    );
    rows = result.rows;
  }

  // Retornar também a lista de contas disponíveis no ml_tokens_json (para o form de adição)
  const tokenRow = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  let availableTokens: Array<{ seller_id: number; nickname: string }> = [];
  if (tokenRow.rows[0]) {
    const parsed = JSON.parse(tokenRow.rows[0].value);
    const all: Array<{ seller_id: number; nickname: string }> = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
    const configuredIds = new Set(rows.map((r: any) => Number(r.seller_id)));
    availableTokens = all.filter(a => !configuredIds.has(a.seller_id));
  }

  return NextResponse.json({ accounts: rows, availableTokens });
}

// ─── POST /api/mercado-livre/accounts ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { seller_id, nickname, notification_group, print_queue_enabled } = await req.json();
  if (!seller_id || !nickname || !notification_group) {
    return NextResponse.json({ error: 'seller_id, nickname e notification_group são obrigatórios' }, { status: 400 });
  }

  const db = getPool();
  const result = await db.query(
    `INSERT INTO ml_account_configs (seller_id, nickname, owner_user_id, print_queue_enabled, notification_group)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (seller_id) DO UPDATE SET
       nickname = EXCLUDED.nickname,
       notification_group = EXCLUDED.notification_group,
       print_queue_enabled = EXCLUDED.print_queue_enabled
     RETURNING *`,
    [seller_id, nickname, session.sub, print_queue_enabled ?? true, notification_group]
  );

  return NextResponse.json({ account: result.rows[0] }, { status: 201 });
}
