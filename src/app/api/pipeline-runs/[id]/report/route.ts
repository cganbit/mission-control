import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

// POST — report-builder mecânico publishes the final consolidated report
// Body: { report: { pipeline, enforcement, arquitetura, sre, llm_efficiency, comparativos }, harness_health? }
export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: runId } = await ctx.params;
  const body = await req.json();
  const { report, harness_health } = body;

  if (!report || typeof report !== 'object')
    return NextResponse.json(
      { error: 'report object required' },
      { status: 400 }
    );

  const run = await queryOne<{ id: string; sprint_number: number }>(
    `SELECT id, sprint_number FROM pipeline_runs WHERE id = $1`,
    [runId]
  );
  if (!run)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  // Merge report into metadata.report (preserves other metadata keys)
  await query(
    `UPDATE pipeline_runs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('report', $1::jsonb)
      WHERE id = $2`,
    [JSON.stringify(report), runId]
  );

  // If harness_health snapshot was sent (close-sprint runs), upsert into harness_health_scores
  if (harness_health && run.sprint_number) {
    const {
      sprint_date,
      pipeline_pct,
      enforcement_pct,
      architecture_pct,
      sre_security_pct,
      llm_efficiency_pct,
      alerts,
      conclusion,
    } = harness_health;

    if (sprint_date) {
      await query(
        `INSERT INTO harness_health_scores
           (sprint_number, sprint_date, pipeline_pct, enforcement_pct, architecture_pct, sre_security_pct, llm_efficiency_pct, alerts, conclusion, full_report)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (sprint_number) DO UPDATE SET
           sprint_date        = EXCLUDED.sprint_date,
           pipeline_pct       = EXCLUDED.pipeline_pct,
           enforcement_pct    = EXCLUDED.enforcement_pct,
           architecture_pct   = EXCLUDED.architecture_pct,
           sre_security_pct   = EXCLUDED.sre_security_pct,
           llm_efficiency_pct = EXCLUDED.llm_efficiency_pct,
           alerts             = EXCLUDED.alerts,
           conclusion         = EXCLUDED.conclusion,
           full_report        = EXCLUDED.full_report`,
        [
          run.sprint_number,
          sprint_date,
          pipeline_pct ?? null,
          enforcement_pct ?? null,
          architecture_pct ?? null,
          sre_security_pct ?? null,
          llm_efficiency_pct ?? null,
          alerts ?? null,
          conclusion ?? null,
          JSON.stringify(report),
        ]
      );
    }
  }

  return NextResponse.json({ ok: true, run_id: runId });
}

// GET — fetch the stored report (UI usage — "Ver Report" button)
export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: runId } = await ctx.params;

  const row = await queryOne<{ metadata: { report?: unknown } | null }>(
    `SELECT metadata FROM pipeline_runs WHERE id = $1`,
    [runId]
  );

  if (!row)
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const report = row.metadata?.report ?? null;
  if (!report)
    return NextResponse.json(
      { error: 'Report not yet published' },
      { status: 404 }
    );

  return NextResponse.json({ report });
}
