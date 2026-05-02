import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

// GET — run detail with steps and log event counts (dual auth)
export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  const isWorker = isAuthorized(req);
  if (!session && !isWorker)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = isWorker ? { worker: true } : await getProjectScopeFromRequest(req);
  const { id } = await ctx.params;

  const run = await queryOne(
    `SELECT * FROM pipeline_runs WHERE id = $1`,
    [id],
    scope
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const steps = await query(
    `SELECT * FROM pipeline_steps WHERE run_id = $1 ORDER BY step_index ASC`,
    [id],
    scope
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
    [id],
    scope
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

// PATCH — observability payload update (PRD-042 Phase 3 §16 MC-B).
//
// Worker-only auth (called by wingx-platform tel.updateRun() pre-finalize).
// Accepts run_health + sprint_work + metadata (all optional). Idempotent —
// safe to call multiple times per run; latest payload wins.
//
// Used by close-sprint step 7 emit_telemetry consolidator. Other run types
// (fix/task/epic) MAY also call to update run_health, but sprint_work is
// close-sprint-specific.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  let body: { run_health?: unknown; sprint_work?: unknown; metadata?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const runHealth = body.run_health ?? null;
  const sprintWork = body.sprint_work ?? null;
  const metadata = body.metadata ?? null;

  // Skip update if all payload fields absent (defensive — caller should not
  // emit empty PATCH but updateRun client guards against it).
  if (runHealth === null && sprintWork === null && metadata === null) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'empty payload' });
  }

  // COALESCE preserves existing values when caller omits a field.
  const updated = await queryOne<{ id: string }>(
    `UPDATE pipeline_runs
       SET run_health  = COALESCE($1::jsonb, run_health),
           sprint_work = COALESCE($2::jsonb, sprint_work),
           metadata    = COALESCE($3::jsonb, metadata)
     WHERE id = $4
     RETURNING id`,
    [
      runHealth === null ? null : JSON.stringify(runHealth),
      sprintWork === null ? null : JSON.stringify(sprintWork),
      metadata === null ? null : JSON.stringify(metadata),
      id,
    ],
    { worker: true }
  );

  if (!updated)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  return NextResponse.json({ ok: true, id: updated.id });
}

// DELETE — cascades to steps and log events (UI-only via session; cannot delete running runs)
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getProjectScopeFromRequest(req);
  const { id } = await ctx.params;

  const run = await queryOne<{ status: string }>(
    `SELECT status FROM pipeline_runs WHERE id = $1`,
    [id],
    scope
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  if (run.status === 'running')
    return NextResponse.json(
      { error: 'Cannot delete a running pipeline. Stop it first.' },
      { status: 409 }
    );

  await query(`DELETE FROM pipeline_runs WHERE id = $1`, [id], scope);

  return NextResponse.json({ ok: true, id });
}
