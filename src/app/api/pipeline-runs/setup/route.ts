import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_type            TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending',
      title               TEXT,
      sprint_number       INT,
      prd_id              TEXT,
      epic_id             TEXT,
      task_id             UUID,
      started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at         TIMESTAMPTZ,
      duration_ms         INT,
      total_input_tokens  INT DEFAULT 0,
      total_output_tokens INT DEFAULT 0,
      cache_read_tokens   INT DEFAULT 0,
      cache_create_tokens INT DEFAULT 0,
      total_tokens        INT GENERATED ALWAYS AS (
        COALESCE(total_input_tokens, 0) + COALESCE(total_output_tokens, 0) + COALESCE(cache_create_tokens, 0)
      ) STORED,
      estimated_cost_usd  NUMERIC(10,4),
      triggered_by        TEXT,
      error_message       TEXT,
      last_heartbeat_at   TIMESTAMPTZ,
      metadata            JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id              UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      step_index          INT NOT NULL,
      step_id             TEXT NOT NULL,
      agent               TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      parallel_group      INT,
      started_at          TIMESTAMPTZ,
      finished_at         TIMESTAMPTZ,
      duration_ms         INT,
      input_tokens        INT,
      output_tokens       INT,
      cache_read_tokens   INT,
      cache_create_tokens INT,
      output_summary      TEXT,
      log_tail            TEXT,
      error_message       TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_log_events (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id              UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      step_id             TEXT,
      event_type          TEXT NOT NULL,
      level               TEXT NOT NULL,
      message             TEXT NOT NULL,
      payload             JSONB,
      occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      line_number_in_file INT
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_prd      ON pipeline_runs(prd_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_sprint   ON pipeline_runs(sprint_number)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status   ON pipeline_runs(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started  ON pipeline_runs(started_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type     ON pipeline_runs(run_type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run     ON pipeline_steps(run_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status  ON pipeline_steps(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_log_events_run         ON pipeline_log_events(run_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_log_events_step        ON pipeline_log_events(run_id, step_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_log_events_level_err   ON pipeline_log_events(level) WHERE level IN ('warn', 'error')`);

  // Extend existing harness_health_scores with new dimension from llm-optimizer consolidation
  await query(`ALTER TABLE harness_health_scores ADD COLUMN IF NOT EXISTS llm_efficiency_pct INT`);
  await query(`ALTER TABLE harness_health_scores ADD COLUMN IF NOT EXISTS full_report JSONB`);

  return NextResponse.json(
    { ok: true, message: 'Pipeline Runs tables created' },
    { status: 201 }
  );
}
