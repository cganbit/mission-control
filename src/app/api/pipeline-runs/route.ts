import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromRequest } from '@/lib/session-scope';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

// POST — harness creates a new pipeline run (worker-key only, uses DEFAULT project)
export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    run_type,
    title,
    sprint_number,
    prd_id,
    epic_id,
    task_id,
    triggered_by,
    metadata,
    steps, // optional: pre-populate steps in 'pending' state
  } = body;

  if (!run_type)
    return NextResponse.json({ error: 'run_type required' }, { status: 400 });

  const validTypes = ['close-sprint', 'task', 'fix', 'bug', 'spike', 'review'];
  if (!validTypes.includes(run_type))
    return NextResponse.json(
      { error: `run_type must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    );

  const run = await queryOne<{ id: string; started_at: string }>(
    `INSERT INTO pipeline_runs
       (run_type, status, title, sprint_number, prd_id, epic_id, task_id, triggered_by, metadata, last_heartbeat_at)
     VALUES ($1, 'running', $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING id, started_at`,
    [
      run_type,
      title ?? null,
      sprint_number ?? null,
      prd_id ?? null,
      epic_id ?? null,
      task_id ?? null,
      triggered_by ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ],
    { worker: true }
  );

  const runId = run!.id;

  // Pre-populate steps if harness sent them
  if (Array.isArray(steps)) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await query(
        `INSERT INTO pipeline_steps
           (run_id, step_index, step_id, agent, status, parallel_group)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [runId, i, s.step_id, s.agent ?? null, s.parallel_group ?? null],
        { worker: true }
      );
    }
  }

  return NextResponse.json({ id: runId, started_at: run!.started_at }, { status: 201 });
}

// GET — list runs with filters + facets (dual auth: UI session or worker-key)
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const isWorker = isAuthorized(req);
  if (!session && !isWorker)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = isWorker ? { worker: true } : await getProjectScopeFromRequest(req);

  const url = req.nextUrl;
  const prd = url.searchParams.get('prd');
  const sprintNum = url.searchParams.get('sprint_number');
  const runType = url.searchParams.get('run_type');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const fromDate = url.searchParams.get('from_date');
  const toDate = url.searchParams.get('to_date');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (prd) { conditions.push(`prd_id = $${idx++}`); params.push(prd); }
  if (sprintNum) { conditions.push(`sprint_number = $${idx++}`); params.push(parseInt(sprintNum, 10)); }
  if (runType) { conditions.push(`run_type = $${idx++}`); params.push(runType); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
  if (search) {
    conditions.push(`(title ILIKE $${idx} OR prd_id ILIKE $${idx} OR epic_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (fromDate) { conditions.push(`started_at >= $${idx++}`); params.push(fromDate); }
  if (toDate) { conditions.push(`started_at <= $${idx++}`); params.push(toDate); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Main query — runs with step count summary
  const listParams = [...params, limit, offset];
  const rows = await query(
    `SELECT
       pr.id,
       pr.run_type,
       pr.status,
       pr.title,
       pr.sprint_number,
       pr.prd_id,
       pr.epic_id,
       pr.started_at,
       pr.finished_at,
       pr.duration_ms,
       pr.total_tokens,
       pr.estimated_cost_usd,
       pr.triggered_by,
       pr.last_heartbeat_at,
       (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.run_id = pr.id) AS step_count,
       (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.run_id = pr.id AND ps.status = 'ok') AS steps_done,
       (SELECT step_id FROM pipeline_steps ps WHERE ps.run_id = pr.id AND ps.status = 'running' LIMIT 1) AS current_step
     FROM pipeline_runs pr
     ${where}
     ORDER BY pr.started_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    listParams,
    scope
  );

  // Total count (same filters, no pagination)
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM pipeline_runs ${where}`,
    params,
    scope
  );
  const total = parseInt(totalRow?.count ?? '0', 10);

  // Facets — populate filter dropdowns (cheap queries, no where clause)
  const [prdFacets, typeFacets, statusFacets, sprintFacets] = await Promise.all([
    query<{ prd_id: string; count: string }>(
      `SELECT prd_id, COUNT(*)::TEXT AS count FROM pipeline_runs WHERE prd_id IS NOT NULL GROUP BY prd_id ORDER BY prd_id`,
      [], scope
    ),
    query<{ run_type: string; count: string }>(
      `SELECT run_type, COUNT(*)::TEXT AS count FROM pipeline_runs GROUP BY run_type ORDER BY run_type`,
      [], scope
    ),
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::TEXT AS count FROM pipeline_runs GROUP BY status ORDER BY status`,
      [], scope
    ),
    query<{ sprint_number: number; count: string }>(
      `SELECT sprint_number, COUNT(*)::TEXT AS count FROM pipeline_runs WHERE sprint_number IS NOT NULL GROUP BY sprint_number ORDER BY sprint_number DESC LIMIT 30`,
      [], scope
    ),
  ]);

  return NextResponse.json({
    runs: rows,
    total,
    limit,
    offset,
    facets: {
      prd_ids: prdFacets,
      run_types: typeFacets,
      statuses: statusFacets,
      sprints: sprintFacets,
    },
  });
}
