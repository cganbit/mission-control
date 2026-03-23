import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  await query('DELETE FROM agent_memories WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
