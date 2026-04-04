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

  const project = req.nextUrl.searchParams.get('project');
  const filter = project ? 'WHERE ss.project = $1' : '';
  const params = project ? [project] : [];

  const [tokensBySprint, cacheHitBySprint, costVsHours, recommendations] = await Promise.all([
    query(
      `SELECT ss.sprint_number,
              SUM(ss.total_input_tokens)::int    AS total_input,
              SUM(ss.total_output_tokens)::int   AS total_output,
              SUM(ss.cache_creation_tokens)::int AS cache_creation,
              SUM(ss.cache_read_tokens)::int     AS cache_read,
              SUM(ss.total_tokens)::int          AS total
       FROM sprint_sessions ss ${filter}
       GROUP BY ss.sprint_number ORDER BY ss.sprint_number`,
      params
    ),
    query(
      `SELECT ss.sprint_number,
              ROUND(AVG(ss.cache_hit_ratio)::numeric, 1) AS avg_cache_hit
       FROM sprint_sessions ss ${filter}
       GROUP BY ss.sprint_number ORDER BY ss.sprint_number`,
      params
    ),
    query(
      `SELECT ss.sprint_number,
              ROUND(SUM(ss.cost_usd)::numeric, 4)       AS cost_usd,
              ROUND(SUM(ss.duration_hours)::numeric, 1)  AS duration_hours
       FROM sprint_sessions ss ${filter}
       GROUP BY ss.sprint_number ORDER BY ss.sprint_number`,
      params
    ),
    query(
      `SELECT lr.id, lr.agent_name, lr.current_model, lr.recommended, lr.reason,
              ss.sprint_number
       FROM llm_recommendations lr
       JOIN sprint_sessions ss ON ss.id = lr.session_id
       WHERE lr.applied = false ${project ? 'AND ss.project = $1' : ''}
       ORDER BY lr.created_at DESC LIMIT 20`,
      params
    ),
  ]);

  // Summary stats
  const summaryParams = project ? [project] : [];
  const summaryFilter = project ? 'WHERE project = $1' : '';
  const summary = await query(
    `SELECT COUNT(*)::int                          AS total_sessions,
            COALESCE(SUM(cost_usd), 0)::float      AS total_cost,
            ROUND(AVG(cache_hit_ratio)::numeric, 1) AS avg_cache_hit,
            COALESCE(SUM(total_tokens), 0)::bigint  AS total_tokens
     FROM sprint_sessions ${summaryFilter}`,
    summaryParams
  );

  return NextResponse.json({
    summary: summary[0] ?? {},
    tokensBySprint,
    cacheHitBySprint,
    costVsHours,
    recommendations,
  });
}
