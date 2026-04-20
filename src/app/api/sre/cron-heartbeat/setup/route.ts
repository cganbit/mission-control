import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query(`
    CREATE TABLE IF NOT EXISTS cron_heartbeats (
      cron_id          VARCHAR(50) PRIMARY KEY,
      label            TEXT NOT NULL,
      schedule_human   TEXT,
      warn_after_min   INT  NOT NULL DEFAULT 300,
      error_after_min  INT  NOT NULL DEFAULT 420,
      last_ping_at     TIMESTAMPTZ,
      last_status      VARCHAR(10),
      last_duration_ms INT,
      last_error       TEXT,
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO cron_heartbeats (cron_id, label, schedule_human, warn_after_min, error_after_min)
    VALUES
      ('ml_token_refresh', 'Token Refresh ML',   'a cada 4h',    300,  420),
      ('sre_check',        'SRE Health Check',   'a cada 5min',  10,   20),
      ('sre_escalate',     'SRE Escalação',      'a cada 30min', 45,   90),
      ('pg_backup',        'Backup PostgreSQL',  'a cada 3h',    240,  360),
      ('n8n_paraguai',     'Catálogo Paraguai',  'on-demand',    1440, 2880)
    ON CONFLICT DO NOTHING
  `);

  return NextResponse.json(
    { ok: true, message: 'cron-heartbeat schema ready' },
    { status: 201 }
  );
}
