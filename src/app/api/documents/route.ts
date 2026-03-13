import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search  = req.nextUrl.searchParams.get('q') ?? '';
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const squadId = req.nextUrl.searchParams.get('squad_id') ?? '';
  const docType = req.nextUrl.searchParams.get('doc_type') ?? '';

  const conditions = ['1=1'];
  const params: unknown[] = [];

  if (search)  { params.push(`%${search}%`);  conditions.push(`(d.title ILIKE $${params.length} OR d.content ILIKE $${params.length} OR d.tags ILIKE $${params.length})`); }
  if (agentId) { params.push(agentId);  conditions.push(`d.agent_id = $${params.length}`); }
  if (squadId) { params.push(squadId);  conditions.push(`d.squad_id = $${params.length}`); }
  if (docType) { params.push(docType);  conditions.push(`d.doc_type = $${params.length}`); }

  const rows = await query(`
    SELECT d.id, d.title, d.doc_type, d.format, d.tags, d.source, d.created_at,
           LEFT(d.content, 300) AS excerpt,
           a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
    FROM agent_documents d
    LEFT JOIN agents a ON a.id = d.agent_id
    LEFT JOIN squads s ON s.id = d.squad_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY d.created_at DESC
    LIMIT 100
  `, params);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent_id, squad_id, title, content, doc_type = 'report', format = 'markdown', tags, source } = await req.json();
  if (!title || !content || !squad_id) return NextResponse.json({ error: 'title, content and squad_id required' }, { status: 400 });

  const [row] = await query(
    `INSERT INTO agent_documents (agent_id, squad_id, title, content, doc_type, format, tags, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title, doc_type, created_at`,
    [agent_id || null, squad_id, title, content, doc_type, format, tags || null, source || null]
  );
  return NextResponse.json(row, { status: 201 });
}
