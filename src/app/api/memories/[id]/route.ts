import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const scope = await getProjectScopeFromRequest(req);
  await query('DELETE FROM agent_memories WHERE id = $1', [id], scope);
  return NextResponse.json({ ok: true });
}
