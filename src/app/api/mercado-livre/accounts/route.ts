import { NextRequest, NextResponse } from 'next/server';
import { listAccounts, createAccount } from '@wingx-app/api-ml';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { getPool } from '@/lib/db';

// GET /api/mercado-livre/accounts
// Admin: todas as contas | Member: apenas as suas
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getPool();
    const result = await listAccounts(db, {
      isAdmin: hasRole(session, 'admin'),
      userId:  session.sub,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/accounts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/mercado-livre/accounts
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { seller_id, nickname, notification_group, print_queue_enabled } = await req.json();
    if (!seller_id || !nickname || !notification_group) {
      return NextResponse.json(
        { error: 'seller_id, nickname e notification_group são obrigatórios' },
        { status: 400 }
      );
    }

    const db = getPool();
    const account = await createAccount(db, {
      seller_id,
      nickname,
      owner_user_id:       session.sub,
      notification_group,
      print_queue_enabled: print_queue_enabled ?? true,
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error('[api/mercado-livre/accounts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
