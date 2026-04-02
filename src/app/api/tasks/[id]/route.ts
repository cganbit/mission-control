import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const task = await queryOne<{ squad_id: string; title: string }>(
    'SELECT squad_id, title FROM tasks WHERE id = $1', [id]
  );
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const autoTimestamps: string[] = [];
  if (body.status === 'in_progress') autoTimestamps.push(`started_at = COALESCE(started_at, NOW())`);
  if (body.status === 'review' || body.status === 'done') autoTimestamps.push(`completed_at = NOW()`);
  const extraSQL = autoTimestamps.length ? ', ' + autoTimestamps.join(', ') : '';

  const [updated] = await query(
    `UPDATE tasks SET
      title       = COALESCE($1, title),
      description = COALESCE($2, description),
      status      = COALESCE($3, status),
      agent_id    = COALESCE($4, agent_id),
      priority    = COALESCE($5, priority),
      due_date    = COALESCE($6, due_date),
      updated_at  = NOW()${extraSQL}
     WHERE id = $7 RETURNING *`,
    [body.title, body.description, body.status, body.agent_id, body.priority, body.due_date, id]
  );

  if (body.status) {
    await query(
      `INSERT INTO activity_log (squad_id, action, detail) VALUES ($1, 'task_moved', $2)`,
      [task.squad_id, `"${task.title}" → ${body.status}`]
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!hasRole(session, 'member')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  await query('DELETE FROM tasks WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
