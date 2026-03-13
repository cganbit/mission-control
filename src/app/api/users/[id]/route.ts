import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole, hashPassword } from '@/lib/auth';
import { query } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { name?: string; email?: string; role?: string; active?: boolean; password?: string };

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (body.name    !== undefined) { updates.push(`name = $${i++}`);          values.push(body.name); }
  if (body.email   !== undefined) { updates.push(`email = $${i++}`);         values.push(body.email || null); }
  if (body.role    !== undefined) { updates.push(`role = $${i++}`);          values.push(body.role); }
  if (body.active  !== undefined) { updates.push(`active = $${i++}`);        values.push(body.active); }
  if (body.password)              { updates.push(`password_hash = $${i++}`); values.push(hashPassword(body.password)); }

  if (updates.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });

  values.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Prevent deleting yourself
  if (session?.sub === id) {
    return NextResponse.json({ error: 'Não é possível deletar o próprio usuário' }, { status: 400 });
  }

  await query('DELETE FROM users WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
