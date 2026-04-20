import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

// Schema moved to /api/paraguai/assets/setup (invoked by deploy.yml).

// GET — lista assets (?fingerprint=X&status=em_estoque)
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fingerprint = searchParams.get('fingerprint');
  const status = searchParams.get('status');

  const db = getArbitragemPool();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (fingerprint) { conditions.push(`a.fingerprint = $${pi++}`); params.push(fingerprint); }
  if (status)      { conditions.push(`a.status = $${pi++}`);      params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(`
    SELECT
      a.*,
      COALESCE(pm.titulo_amigavel, a.titulo) AS titulo_amigavel,
      (a.qty * a.preco_usd) AS custo_total_usd,
      CASE WHEN a.preco_venda_brl IS NOT NULL
        THEN a.preco_venda_brl - (a.qty * a.preco_usd * 5.80)
        ELSE NULL
      END AS lucro_estimado_brl
    FROM paraguai_assets a
    LEFT JOIN produtos_mestre pm ON pm.fingerprint = a.fingerprint
    ${where}
    ORDER BY a.data_compra DESC, a.created_at DESC
  `, params);

  return NextResponse.json(result.rows);
}

// POST — registrar compra de asset
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
    if (!body.fingerprint || !body.titulo || !body.preco_usd) {
      throw new Error('fingerprint, titulo e preco_usd são obrigatórios');
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const db = getArbitragemPool();

  const { fingerprint, titulo, qty = 1, preco_usd, fornecedor, data_compra, status = 'comprado', observacoes } = body;

  const result = await db.query(`
    INSERT INTO paraguai_assets
      (fingerprint, titulo, qty, preco_usd, fornecedor, data_compra, status, observacoes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id
  `, [fingerprint, titulo, qty, preco_usd, fornecedor ?? null, data_compra ?? new Date().toISOString().slice(0,10), status, observacoes ?? null, session.username]);

  const id = result.rows[0].id;
  await logAudit(session.username, 'asset_registrado', fingerprint, { id, titulo, qty, preco_usd, fornecedor, status });
  return NextResponse.json({ ok: true, id });
}

// PATCH — atualizar status / venda / observações
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
    if (!body.id) throw new Error('id obrigatório');
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const db = getArbitragemPool();

  const { id, status, qty, preco_usd, preco_venda_brl, data_venda, observacoes, fornecedor } = body;

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [id];
  let pi = 2;

  if (status !== undefined)          { sets.push(`status = $${pi++}`);           params.push(status); }
  if (qty !== undefined)             { sets.push(`qty = $${pi++}`);              params.push(qty); }
  if (preco_usd !== undefined)       { sets.push(`preco_usd = $${pi++}`);        params.push(preco_usd); }
  if (preco_venda_brl !== undefined) { sets.push(`preco_venda_brl = $${pi++}`);  params.push(preco_venda_brl); }
  if (data_venda !== undefined)      { sets.push(`data_venda = $${pi++}`);       params.push(data_venda); }
  if (observacoes !== undefined)     { sets.push(`observacoes = $${pi++}`);      params.push(observacoes); }
  if (fornecedor !== undefined)      { sets.push(`fornecedor = $${pi++}`);       params.push(fornecedor); }

  await db.query(`UPDATE paraguai_assets SET ${sets.join(', ')} WHERE id = $1`, params);

  // Fetch fingerprint for audit
  const row = await db.query(`SELECT fingerprint, titulo FROM paraguai_assets WHERE id = $1`, [id]);
  const fp = row.rows[0]?.fingerprint;
  await logAudit(session.username, 'asset_atualizado', fp, { id, ...body });

  return NextResponse.json({ ok: true });
}

// DELETE — remover asset
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const db = getArbitragemPool();
  const row = await db.query(`SELECT fingerprint, titulo FROM paraguai_assets WHERE id = $1`, [id]);
  const fp = row.rows[0]?.fingerprint;

  await db.query(`DELETE FROM paraguai_assets WHERE id = $1`, [id]);
  await logAudit(session.username, 'asset_removido', fp, { id });

  return NextResponse.json({ ok: true });
}
