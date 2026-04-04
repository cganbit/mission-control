import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

// Pricing Anthropic (Sonnet 4.6)
function calculateCost(metrics: {
  total_input_tokens?: number;
  total_output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
}): number {
  const input = (metrics.total_input_tokens ?? 0) / 1e6;
  const output = (metrics.total_output_tokens ?? 0) / 1e6;
  const cacheRead = (metrics.cache_read_tokens ?? 0) / 1e6;
  const cacheCreation = (metrics.cache_creation_tokens ?? 0) / 1e6;
  return input * 3 + output * 15 + cacheRead * 0.30 + cacheCreation * 3.75;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { sprint_number, session_date, project, duration_hours, metrics, agents, llm_recommendations } = body;

  if (!sprint_number || !session_date || !metrics)
    return NextResponse.json({ error: 'sprint_number, session_date and metrics required' }, { status: 400 });

  const cost_usd = calculateCost(metrics);

  const session = await queryOne<{ id: number }>(
    `INSERT INTO sprint_sessions
      (sprint_number, session_date, project, duration_hours,
       total_input_tokens, total_output_tokens, cache_creation_tokens, cache_read_tokens,
       tool_calls_total, agent_spawns, cache_hit_ratio, cost_usd, quality_band)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      sprint_number,
      session_date,
      project ?? 'paraguai',
      duration_hours ?? null,
      metrics.total_input_tokens ?? null,
      metrics.total_output_tokens ?? null,
      metrics.cache_creation_tokens ?? null,
      metrics.cache_read_tokens ?? null,
      metrics.tool_calls_total ?? null,
      metrics.agent_spawns ?? null,
      metrics.cache_hit_ratio ?? null,
      cost_usd,
      metrics.quality_band ?? null,
    ]
  );

  const sessionId = session!.id;

  if (Array.isArray(agents)) {
    for (const a of agents) {
      await query(
        `INSERT INTO sprint_agent_metrics
          (session_id, agent_name, task_desc, model, tool_calls, context_pct, rating, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sessionId, a.agent_name, a.task_desc ?? null, a.model ?? null,
         a.tool_calls ?? null, a.context_pct ?? null, a.rating ?? null, a.note ?? null]
      );
    }
  }

  if (Array.isArray(llm_recommendations)) {
    for (const r of llm_recommendations) {
      await query(
        `INSERT INTO llm_recommendations
          (session_id, agent_name, current_model, recommended, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [sessionId, r.agent_name, r.current_model ?? null, r.recommended ?? null, r.reason ?? null]
      );
    }
  }

  return NextResponse.json({ id: sessionId, cost_usd }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = req.nextUrl;
  const project = url.searchParams.get('project');
  const sprintNum = url.searchParams.get('sprint_number');
  const fromDate = url.searchParams.get('from_date');
  const toDate = url.searchParams.get('to_date');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (project) { conditions.push(`project = $${idx++}`); params.push(project); }
  if (sprintNum) { conditions.push(`sprint_number = $${idx++}`); params.push(parseInt(sprintNum, 10)); }
  if (fromDate) { conditions.push(`session_date >= $${idx++}`); params.push(fromDate); }
  if (toDate) { conditions.push(`session_date <= $${idx++}`); params.push(toDate); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = await query(
    `SELECT * FROM sprint_sessions ${where} ORDER BY session_date DESC LIMIT $${idx}`,
    params
  );

  return NextResponse.json(rows);
}
