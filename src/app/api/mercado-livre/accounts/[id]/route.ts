import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';

// ─── PATCH /api/mercado-livre/accounts/[id] ───────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const db = getPool();

  // Verificar ownership (admin pode editar qualquer um)
  const existing = await db.query(`SELECT * FROM ml_account_configs WHERE id = $1`, [id]);
  if (!existing.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!hasRole(session, 'admin') && existing.rows[0].owner_user_id !== session.sub) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (body.notification_group !== undefined) { fields.push(`notification_group = $${i++}`); values.push(body.notification_group); }
  if (body.print_queue_enabled !== undefined) { fields.push(`print_queue_enabled = $${i++}`); values.push(body.print_queue_enabled); }

  if (!fields.length) return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });

  values.push(id);
  const result = await db.query(
    `UPDATE ml_account_configs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );

  return NextResponse.json({ account: result.rows[0] });
}

// ─── DELETE /api/mercado-livre/accounts/[id] ──────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasRole(session, 'member')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getPool();

  const existing = await db.query(`SELECT * FROM ml_account_configs WHERE id = $1`, [id]);
  if (!existing.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!hasRole(session, 'admin') && existing.rows[0].owner_user_id !== session.sub) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.query(`DELETE FROM ml_account_configs WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
