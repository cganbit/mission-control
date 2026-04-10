import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await query(
    `SELECT sprint_number, sprint_date, pipeline_pct, enforcement_pct,
            architecture_pct, sre_security_pct, alerts, conclusion
     FROM harness_health_scores
     ORDER BY sprint_number ASC`
  );

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { sprint_number, sprint_date, pipeline_pct, enforcement_pct,
          architecture_pct, sre_security_pct, alerts, conclusion } = body;

  if (!sprint_number || !sprint_date)
    return NextResponse.json({ error: 'sprint_number and sprint_date required' }, { status: 400 });

  await query(
    `INSERT INTO harness_health_scores
       (sprint_number, sprint_date, pipeline_pct, enforcement_pct,
        architecture_pct, sre_security_pct, alerts, conclusion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (sprint_number) DO UPDATE SET
       sprint_date      = EXCLUDED.sprint_date,
       pipeline_pct     = EXCLUDED.pipeline_pct,
       enforcement_pct  = EXCLUDED.enforcement_pct,
       architecture_pct = EXCLUDED.architecture_pct,
       sre_security_pct = EXCLUDED.sre_security_pct,
       alerts           = EXCLUDED.alerts,
       conclusion       = EXCLUDED.conclusion`,
    [sprint_number, sprint_date, pipeline_pct ?? null, enforcement_pct ?? null,
     architecture_pct ?? null, sre_security_pct ?? null, alerts ?? null, conclusion ?? null]
  );

  return NextResponse.json({ ok: true, sprint_number }, { status: 201 });
}
