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
    CREATE TABLE IF NOT EXISTS sprint_sessions (
      id                    SERIAL PRIMARY KEY,
      sprint_number         INT NOT NULL,
      session_date          DATE NOT NULL,
      project               TEXT NOT NULL DEFAULT 'paraguai',
      duration_hours        FLOAT,
      total_input_tokens    INT,
      total_output_tokens   INT,
      cache_creation_tokens INT,
      cache_read_tokens     INT,
      total_tokens          INT GENERATED ALWAYS AS (
        COALESCE(total_input_tokens, 0) + COALESCE(total_output_tokens, 0) + COALESCE(cache_creation_tokens, 0)
      ) STORED,
      tool_calls_total      INT,
      agent_spawns          INT,
      cache_hit_ratio       FLOAT,
      cost_usd              FLOAT,
      quality_band          TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sprint_agent_metrics (
      id              SERIAL PRIMARY KEY,
      session_id      INT REFERENCES sprint_sessions(id) ON DELETE CASCADE,
      agent_name      TEXT NOT NULL,
      task_desc       TEXT,
      model           TEXT,
      tool_calls      INT,
      context_pct     FLOAT,
      rating          INT,
      note            TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS llm_recommendations (
      id              SERIAL PRIMARY KEY,
      session_id      INT REFERENCES sprint_sessions(id) ON DELETE CASCADE,
      agent_name      TEXT NOT NULL,
      current_model   TEXT,
      recommended     TEXT,
      reason          TEXT,
      applied         BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_sprint  ON sprint_sessions(sprint_number)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sprint_sessions(project)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_date    ON sprint_sessions(session_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agent_session    ON sprint_agent_metrics(session_id)`);

  return NextResponse.json({ ok: true, message: 'Analytics tables created' }, { status: 201 });
}
