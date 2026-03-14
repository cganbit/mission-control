import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem'),
  max: 5,
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, qty } = body;

  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let pi = 1;

  if (status) { sets.push(`status = $${pi++}`); vals.push(status); }
  if (qty !== undefined) { sets.push(`qty = $${pi++}`); vals.push(qty); }

  vals.push(id);
  const result = await pool.query(
    `UPDATE lista_compras SET ${sets.join(', ')} WHERE id = $${pi} RETURNING *`,
    vals
  );
  return NextResponse.json(result.rows[0] ?? { error: 'not found' });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await pool.query('DELETE FROM lista_compras WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
