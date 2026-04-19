import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

// POST /api/tasks/batch — cria múltiplas tasks de uma vez (Jarvis pipeline)
// Body: { squad_id: string, tasks: { title, description?, priority?, type? }[] }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { squad_id, tasks } = await req.json();
  if (!squad_id || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: 'squad_id and tasks[] required' }, { status: 400 });
  }

  const created = [];
  for (const t of tasks) {
    const [task] = await query(
      `INSERT INTO tasks (squad_id, title, description, priority, status, type, parent_id, created_by)
       VALUES ($1, $2, $3, $4, 'backlog', $5, $6, 'jarvis') RETURNING *`,
      [squad_id, t.title, t.description ?? null, t.priority ?? 'medium', t.type ?? 'task', t.parent_id ?? null],
      { worker: true }
    );
    created.push(task);
  }

  return NextResponse.json(created, { status: 201 });
}
