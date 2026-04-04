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

  const rows = await query(
    `SELECT sam.agent_name,
            sam.model,
            COUNT(*)::int                              AS sessions,
            ROUND(AVG(sam.tool_calls)::numeric, 0)::int AS avg_tool_calls,
            ROUND(AVG(sam.context_pct)::numeric, 1)     AS avg_context_pct,
            ROUND(AVG(sam.rating)::numeric, 1)          AS avg_rating,
            ROUND(SUM(ss.cost_usd)::numeric, 4)         AS total_cost
     FROM sprint_agent_metrics sam
     JOIN sprint_sessions ss ON ss.id = sam.session_id
     ${filter}
     GROUP BY sam.agent_name, sam.model
     ORDER BY SUM(ss.cost_usd) DESC NULLS LAST`,
    params
  );

  return NextResponse.json(rows);
}
