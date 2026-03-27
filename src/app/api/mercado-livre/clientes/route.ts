import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { safeDecrypt } from '@/lib/crypto';

// GET /api/mercado-livre/clientes?search=nome&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') ?? null;
  const page   = Math.max(1, Number(sp.get('page')  ?? 1));
  const limit  = Math.min(Number(sp.get('limit') ?? 20), 200);
  const offset = (page - 1) * limit;

  try {
    const db = getPool();

    const rows = await db.query(
      `SELECT
        c.id,
        c.ml_buyer_id,
        c.nome,
        c.cpf,
        c.telefone,
        COALESCE(c.notas, '') AS notas,
        c.created_at,
        COUNT(p.id)::int                              AS total_pedidos,
        COALESCE(SUM(p.total_amount), 0)::numeric     AS total_gasto,
        MAX(p.created_at)                             AS ultima_compra,
        STRING_AGG(DISTINCT p.seller_nickname, ', ')  AS lojas
       FROM ml_clientes c
       LEFT JOIN ml_pedidos p ON p.ml_buyer_id = c.ml_buyer_id
       WHERE ($1::text IS NULL OR c.nome ILIKE '%' || $1 || '%')
       GROUP BY c.id, c.ml_buyer_id, c.nome, c.cpf, c.telefone, c.notas, c.created_at
       ORDER BY ultima_compra DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );

    const countRow = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM ml_clientes c
       WHERE ($1::text IS NULL OR c.nome ILIKE '%' || $1 || '%')`,
      [search]
    );

    const clientes = rows.rows.map((c: any) => ({
      ...c,
      cpf: safeDecrypt(c.cpf),
      telefone: safeDecrypt(c.telefone),
    }));

    return NextResponse.json({
      clientes,
      total: countRow.rows[0]?.total ?? 0,
      page,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/mercado-livre/clientes
// Body: { ml_buyer_id: number, notas: string }
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { ml_buyer_id, notas } = await req.json();

    if (!ml_buyer_id) {
      return NextResponse.json({ error: 'ml_buyer_id obrigatório' }, { status: 400 });
    }

    const db = getPool();
    const result = await db.query(
      `UPDATE ml_clientes SET notas = $1 WHERE ml_buyer_id = $2`,
      [notas ?? '', ml_buyer_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
