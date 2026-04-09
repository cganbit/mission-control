import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

// ─── Schema + Seed ────────────────────────────────────────────────────────────

async function ensureTable(db: ReturnType<typeof getPool>): Promise<void> {
  await db.query(`
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

  await db.query(`
    INSERT INTO cron_heartbeats (cron_id, label, schedule_human, warn_after_min, error_after_min)
    VALUES
      ('ml_token_refresh', 'Token Refresh ML',   'a cada 4h',    300,  420),
      ('sre_check',        'SRE Health Check',   'a cada 5min',  10,   20),
      ('sre_escalate',     'SRE Escalação',      'a cada 30min', 45,   90),
      ('pg_backup',        'Backup PostgreSQL',  'a cada 3h',    240,  360),
      ('n8n_paraguai',     'Catálogo Paraguai',  'on-demand',    1440, 2880)
    ON CONFLICT DO NOTHING
  `);
}

// ─── Status color logic ───────────────────────────────────────────────────────

function computeStatusColor(
  lastPingAt: Date | null,
  lastStatus: string | null,
  warnAfterMin: number,
  errorAfterMin: number
): { status_color: 'green' | 'yellow' | 'red'; age_min: number | null } {
  if (!lastPingAt) {
    return { status_color: 'red', age_min: null };
  }

  const ageMin = Math.round((Date.now() - lastPingAt.getTime()) / 60000);

  if (ageMin > errorAfterMin) {
    return { status_color: 'red', age_min: ageMin };
  }

  if (ageMin >= warnAfterMin || lastStatus === 'error') {
    return { status_color: 'yellow', age_min: ageMin };
  }

  return { status_color: 'green', age_min: ageMin };
}

// ─── POST /api/sre/cron-heartbeat ─────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const workerKey = req.headers.get('x-worker-key');
  if (!WORKER_KEY || workerKey !== WORKER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { cron_id?: string; status?: string; duration_ms?: number; error?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cron_id, status, duration_ms, error } = body;

  if (!cron_id || !status) {
    return NextResponse.json({ error: 'cron_id and status are required' }, { status: 400 });
  }

  if (!['ok', 'error'].includes(status)) {
    return NextResponse.json({ error: 'status must be ok or error' }, { status: 400 });
  }

  const db = getPool();
  await ensureTable(db);

  // Validate cron_id exists
  const existing = await db.query(
    `SELECT cron_id FROM cron_heartbeats WHERE cron_id = $1`,
    [cron_id]
  );
  if (!existing.rows[0]) {
    return NextResponse.json({ error: `cron_id '${cron_id}' not found` }, { status: 400 });
  }

  const result = await db.query(
    `UPDATE cron_heartbeats
     SET last_ping_at     = NOW(),
         last_status      = $1,
         last_duration_ms = $2,
         last_error       = $3,
         updated_at       = NOW()
     WHERE cron_id = $4
     RETURNING last_ping_at`,
    [status, duration_ms ?? null, error ?? null, cron_id]
  );

  return NextResponse.json({
    ok: true,
    cron_id,
    last_ping_at: result.rows[0].last_ping_at,
  });
}

// ─── GET /api/sre/cron-heartbeat ──────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = WORKER_KEY && workerKey === WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getPool();
  await ensureTable(db);

  const result = await db.query(
    `SELECT cron_id, label, schedule_human, warn_after_min, error_after_min,
            last_ping_at, last_status, last_duration_ms, last_error, updated_at
     FROM cron_heartbeats
     ORDER BY cron_id`
  );

  const crons = result.rows.map((row) => {
    const { status_color, age_min } = computeStatusColor(
      row.last_ping_at ? new Date(row.last_ping_at) : null,
      row.last_status,
      row.warn_after_min,
      row.error_after_min
    );
    return {
      cron_id: row.cron_id,
      label: row.label,
      schedule_human: row.schedule_human,
      warn_after_min: row.warn_after_min,
      error_after_min: row.error_after_min,
      last_ping_at: row.last_ping_at,
      last_status: row.last_status,
      last_duration_ms: row.last_duration_ms,
      last_error: row.last_error,
      updated_at: row.updated_at,
      age_min,
      status_color,
    };
  });

  return NextResponse.json({ crons });
}
