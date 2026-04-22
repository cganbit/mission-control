import { NextRequest, NextResponse } from 'next/server';
import { updateAccount, deleteAccount } from '@wingx-app/api-ml';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { getPool } from '@/lib/db';

// PATCH /api/mercado-livre/accounts/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const db = getPool();

    const account = await updateAccount(db, {
      id,
      isAdmin:              hasRole(session, 'admin'),
      callerUserId:         session.sub,
      notification_group:   body.notification_group,
      print_queue_enabled:  body.print_queue_enabled,
      test_mode:            body.test_mode,
    });

    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ account });
  } catch (err: any) {
    console.error('[api/mercado-livre/accounts/[id] PATCH]', err);
    const status = err?.status ?? 500;
    if (status === 403) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (status === 400) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/mercado-livre/accounts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const db = getPool();

    const found = await deleteAccount(db, {
      id,
      isAdmin:      hasRole(session, 'admin'),
      callerUserId: session.sub,
    });

    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[api/mercado-livre/accounts/[id] DELETE]', err);
    const status = err?.status ?? 500;
    if (status === 403) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
