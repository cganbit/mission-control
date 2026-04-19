import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

// Pricing Anthropic Sonnet 4.6 (per 1M tokens)
const PRICING = {
  input: 3.0,
  output: 15.0,
  cache_read: 0.3,
  cache_create: 3.75,
};

function calculateCost(m: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_create_tokens?: number;
}): number {
  return (
    ((m.input_tokens ?? 0) / 1e6) * PRICING.input +
    ((m.output_tokens ?? 0) / 1e6) * PRICING.output +
    ((m.cache_read_tokens ?? 0) / 1e6) * PRICING.cache_read +
    ((m.cache_create_tokens ?? 0) / 1e6) * PRICING.cache_create
  );
}

// PATCH — harness updates step status (worker-key only)
// Body: { step_id, status, started_at?, finished_at?, duration_ms?, input_tokens?, output_tokens?, cache_read_tokens?, cache_create_tokens?, output_summary?, log_tail?, error_message?, run_status? (to close run) }
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: runId } = await ctx.params;
  const body = await req.json();
  const {
    step_id,
    status,
    started_at,
    finished_at,
    duration_ms,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_create_tokens,
    output_summary,
    log_tail,
    error_message,
    run_status, // if set, also closes the parent run
  } = body;

  if (!step_id || !status)
    return NextResponse.json(
      { error: 'step_id and status required' },
      { status: 400 }
    );

  const validStepStatuses = [
    'pending',
    'running',
    'ok',
    'failed',
    'skipped',
    'timeout',
  ];
  if (!validStepStatuses.includes(status))
    return NextResponse.json(
      { error: `status must be one of: ${validStepStatuses.join(', ')}` },
      { status: 400 }
    );

  // Update the step (latest by step_id — tolerates replay via UPSERT-like)
  const step = await queryOne<{ id: string }>(
    `UPDATE pipeline_steps
        SET status              = $1,
            started_at          = COALESCE($2, started_at),
            finished_at         = COALESCE($3, finished_at),
            duration_ms         = COALESCE($4, duration_ms),
            input_tokens        = COALESCE($5, input_tokens),
            output_tokens       = COALESCE($6, output_tokens),
            cache_read_tokens   = COALESCE($7, cache_read_tokens),
            cache_create_tokens = COALESCE($8, cache_create_tokens),
            output_summary      = COALESCE($9, output_summary),
            log_tail            = COALESCE($10, log_tail),
            error_message       = COALESCE($11, error_message)
      WHERE run_id = $12 AND step_id = $13
      RETURNING id`,
    [
      status,
      started_at ?? null,
      finished_at ?? null,
      duration_ms ?? null,
      input_tokens ?? null,
      output_tokens ?? null,
      cache_read_tokens ?? null,
      cache_create_tokens ?? null,
      output_summary ?? null,
      log_tail ?? null,
      error_message ?? null,
      runId,
      step_id,
    ],
    { worker: true }
  );

  if (!step)
    return NextResponse.json(
      { error: `Step ${step_id} not found for run ${runId}` },
      { status: 404 }
    );

  // Update run's heartbeat and aggregated tokens on every PATCH
  await query(
    `UPDATE pipeline_runs
        SET last_heartbeat_at    = NOW(),
            total_input_tokens   = COALESCE((SELECT SUM(input_tokens)        FROM pipeline_steps WHERE run_id = $1), 0),
            total_output_tokens  = COALESCE((SELECT SUM(output_tokens)       FROM pipeline_steps WHERE run_id = $1), 0),
            cache_read_tokens    = COALESCE((SELECT SUM(cache_read_tokens)   FROM pipeline_steps WHERE run_id = $1), 0),
            cache_create_tokens  = COALESCE((SELECT SUM(cache_create_tokens) FROM pipeline_steps WHERE run_id = $1), 0)
      WHERE id = $1`,
    [runId],
    { worker: true }
  );

  // If run_status provided, finalize the run
  if (run_status) {
    const validRunStatuses = ['ok', 'failed', 'cancelled'];
    if (!validRunStatuses.includes(run_status))
      return NextResponse.json(
        { error: `run_status must be one of: ${validRunStatuses.join(', ')}` },
        { status: 400 }
      );

    // Compute cost from aggregated tokens
    const totals = await queryOne<{
      total_input_tokens: number;
      total_output_tokens: number;
      cache_read_tokens: number;
      cache_create_tokens: number;
    }>(
      `SELECT total_input_tokens, total_output_tokens, cache_read_tokens, cache_create_tokens
       FROM pipeline_runs WHERE id = $1`,
      [runId],
      { worker: true }
    );

    const cost = calculateCost({
      input_tokens: totals?.total_input_tokens,
      output_tokens: totals?.total_output_tokens,
      cache_read_tokens: totals?.cache_read_tokens,
      cache_create_tokens: totals?.cache_create_tokens,
    });

    await query(
      `UPDATE pipeline_runs
          SET status             = $1,
              finished_at        = NOW(),
              duration_ms        = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
              estimated_cost_usd = $2,
              error_message      = COALESCE($3, error_message)
        WHERE id = $4`,
      [run_status, cost.toFixed(4), error_message ?? null, runId],
      { worker: true }
    );
  }

  return NextResponse.json({ ok: true, step_id, status });
}
