import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

const VALID_LEVELS = ['debug', 'info', 'warn', 'error'];

// POST — harness emits a batch of structured log events (worker-key only)
// Body: { events: [{ step_id?, event_type, level, message, payload?, occurred_at?, line_number_in_file? }, ...] }
export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: runId } = await ctx.params;
  const body = await req.json();
  const { events } = body;

  if (!Array.isArray(events))
    return NextResponse.json(
      { error: 'events array required' },
      { status: 400 }
    );
  if (events.length === 0)
    return NextResponse.json({ ok: true, inserted: 0 });
  if (events.length > 500)
    return NextResponse.json(
      { error: 'Max 500 events per batch' },
      { status: 400 }
    );

  // Verify run exists before inserting (avoid orphan events)
  const run = await queryOne<{ id: string }>(
    `SELECT id FROM pipeline_runs WHERE id = $1`,
    [runId]
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  let inserted = 0;
  for (const ev of events) {
    if (!ev.event_type || !ev.level || !ev.message) continue;
    if (!VALID_LEVELS.includes(ev.level)) continue;

    await query(
      `INSERT INTO pipeline_log_events
         (run_id, step_id, event_type, level, message, payload, occurred_at, line_number_in_file)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8)`,
      [
        runId,
        ev.step_id ?? null,
        ev.event_type,
        ev.level,
        ev.message,
        ev.payload ? JSON.stringify(ev.payload) : null,
        ev.occurred_at ?? null,
        ev.line_number_in_file ?? null,
      ]
    );
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}

// GET — fetch log events with filters (UI log viewer)
// Query: ?step_id=X&level=warn&limit=200&offset=0
export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: runId } = await ctx.params;
  const url = req.nextUrl;
  const stepId = url.searchParams.get('step_id');
  const level = url.searchParams.get('level');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 1000);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const conditions: string[] = [`run_id = $1`];
  const params: unknown[] = [runId];
  let idx = 2;

  if (stepId) { conditions.push(`step_id = $${idx++}`); params.push(stepId); }
  if (level) { conditions.push(`level = $${idx++}`); params.push(level); }

  params.push(limit, offset);

  const rows = await query(
    `SELECT id, step_id, event_type, level, message, payload, occurred_at, line_number_in_file
       FROM pipeline_log_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at ASC
      LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  return NextResponse.json({ events: rows });
}
