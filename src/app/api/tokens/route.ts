import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

// Model pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':          { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':        { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001':{ input: 0.80,  output: 4.00  },
  'claude-haiku-4-5':         { input: 0.80,  output: 4.00  },
};

function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4-6'];
  return (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output;
}

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  const squadId = req.nextUrl.searchParams.get('squad_id');
  const days    = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30'), 90);

  const conditions = [`tu.date >= CURRENT_DATE - INTERVAL '${days} days'`];
  const params: unknown[] = [];
  if (agentId) { params.push(agentId); conditions.push(`tu.agent_id = $${params.length}`); }
  if (squadId) { params.push(squadId); conditions.push(`tu.squad_id = $${params.length}`); }
  const where = conditions.join(' AND ');

  const [byAgent, byDay, totals] = await Promise.all([
    // Usage per agent (total)
    query(`
      SELECT a.name AS agent_name, a.id AS agent_id, s.name AS squad_name, s.color AS squad_color,
             SUM(tu.tokens_in) AS tokens_in, SUM(tu.tokens_out) AS tokens_out,
             SUM(tu.tokens_in + tu.tokens_out) AS tokens_total,
             SUM(tu.cost_usd) AS cost_usd
      FROM token_usage tu
      LEFT JOIN agents a ON a.id = tu.agent_id
      LEFT JOIN squads s ON s.id = tu.squad_id
      WHERE ${where}
      GROUP BY a.id, a.name, s.name, s.color
      ORDER BY SUM(tu.tokens_in + tu.tokens_out) DESC
    `, params),

    // Usage per day (last N days)
    query(`
      SELECT tu.date::text,
             SUM(tu.tokens_in) AS tokens_in, SUM(tu.tokens_out) AS tokens_out,
             SUM(tu.tokens_in + tu.tokens_out) AS tokens_total,
             SUM(tu.cost_usd) AS cost_usd
      FROM token_usage tu
      WHERE ${where}
      GROUP BY tu.date
      ORDER BY tu.date ASC
    `, params),

    // Grand totals
    query(`
      SELECT SUM(tu.tokens_in) AS tokens_in, SUM(tu.tokens_out) AS tokens_out,
             SUM(tu.tokens_in + tu.tokens_out) AS tokens_total,
             SUM(tu.cost_usd) AS cost_usd,
             COUNT(DISTINCT tu.agent_id) AS agents_count
      FROM token_usage tu
      WHERE ${where}
    `, params),
  ]);

  return NextResponse.json({ byAgent, byDay, totals: totals[0] ?? {} });
}

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent_id, squad_id, model = 'claude-sonnet-4-6', tokens_in = 0, tokens_out = 0, session_id } = await req.json();
  if (!squad_id) return NextResponse.json({ error: 'squad_id required' }, { status: 400 });

  const cost_usd = calcCost(model, tokens_in, tokens_out);

  const [row] = await query(
    `INSERT INTO token_usage (agent_id, squad_id, model, tokens_in, tokens_out, cost_usd, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [agent_id || null, squad_id, model, tokens_in, tokens_out, cost_usd, session_id || null]
  );

  return NextResponse.json(row, { status: 201 });
}
