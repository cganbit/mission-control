import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

// GET — run detail with steps and log event counts (dual auth)
export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const run = await queryOne(
    `SELECT * FROM pipeline_runs WHERE id = $1`,
    [id]
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const steps = await query(
    `SELECT * FROM pipeline_steps WHERE run_id = $1 ORDER BY step_index ASC`,
    [id]
  );

  const logCounts = await queryOne<{
    total: string;
    warns: string;
    errors: string;
  }>(
    `SELECT
       COUNT(*)::TEXT AS total,
       COUNT(*) FILTER (WHERE level = 'warn')::TEXT AS warns,
       COUNT(*) FILTER (WHERE level = 'error')::TEXT AS errors
     FROM pipeline_log_events
     WHERE run_id = $1`,
    [id]
  );

  return NextResponse.json({
    run,
    steps,
    log_summary: {
      total: parseInt(logCounts?.total ?? '0', 10),
      warns: parseInt(logCounts?.warns ?? '0', 10),
      errors: parseInt(logCounts?.errors ?? '0', 10),
    },
  });
}

// DELETE — cascades to steps and log events (UI-only via session; cannot delete running runs)
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const run = await queryOne<{ status: string }>(
    `SELECT status FROM pipeline_runs WHERE id = $1`,
    [id]
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  if (run.status === 'running')
    return NextResponse.json(
      { error: 'Cannot delete a running pipeline. Stop it first.' },
      { status: 409 }
    );

  await query(`DELETE FROM pipeline_runs WHERE id = $1`, [id]);

  return NextResponse.json({ ok: true, id });
}
