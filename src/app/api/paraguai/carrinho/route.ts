import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem'),
  max: 5,
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await pool.query(
    `SELECT * FROM lista_compras WHERE status = 'pendente' ORDER BY added_at DESC`
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { fingerprint, titulo_amigavel, categoria, fornecedor_nome, preco_usd, preco_ml_real, has_catalog, margem_pct, qty } = body;

  if (!fingerprint) return NextResponse.json({ error: 'fingerprint required' }, { status: 400 });

  // Upsert: if already in cart, increment qty; otherwise insert
  const result = await pool.query(
    `INSERT INTO lista_compras (fingerprint, titulo_amigavel, categoria, fornecedor_nome, preco_usd, preco_ml_real, has_catalog, margem_pct, qty, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [fingerprint, titulo_amigavel, categoria, fornecedor_nome, preco_usd, preco_ml_real, has_catalog, margem_pct, qty || 1, session.username]
  );

  return NextResponse.json(result.rows[0] ?? { fingerprint, status: 'already_in_cart' });
}
