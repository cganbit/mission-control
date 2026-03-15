import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { Pool } from 'pg';

// Connects to the arbitragem database (same postgres instance, different DB)
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem'),
  max: 5,
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const marca    = searchParams.get('marca') || '';
  const categoria = searchParams.get('categoria') || '';
  const has_catalog = searchParams.get('has_catalog');
  const min_margem = parseFloat(searchParams.get('min_margem') || '0') || 0;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);

  // Get the latest price for each fingerprint from historico_precos
  // Join with preco_ml_cache to get ML prices
  // Only return products seen in the last 30 days
  const conditions: string[] = ['hp.received_at > NOW() - INTERVAL \'30 days\''];
  const params: unknown[] = [];
  let pi = 1;

  if (marca) {
    conditions.push(`UPPER(hp.fingerprint) LIKE $${pi++}`);
    params.push(`${marca.toUpperCase()}%`);
  }
  if (categoria) {
    conditions.push(`hp.fingerprint IN (SELECT fingerprint FROM produtos_mestre WHERE categoria = $${pi++})`);
    params.push(categoria);
  }
  if (has_catalog === 'true') {
    conditions.push(`c.has_catalog = TRUE`);
  } else if (has_catalog === 'false') {
    conditions.push(`(c.has_catalog IS NULL OR c.has_catalog = FALSE)`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (hp.fingerprint)
        hp.fingerprint,
        hp.fornecedor_nome,
        hp.preco_usd,
        hp.descricao_original,
        hp.received_at,
        hp.parser
      FROM historico_precos hp
      ${where}
      ORDER BY hp.fingerprint, hp.preco_usd ASC
    ),
    suppliers AS (
      SELECT
        hp.fingerprint,
        json_agg(json_build_object(
          'fornecedor_nome', hp.fornecedor_nome,
          'preco_usd', hp.preco_usd,
          'received_at', hp.received_at
        ) ORDER BY hp.preco_usd ASC) AS all_suppliers,
        COUNT(DISTINCT hp.fornecedor_nome) AS num_suppliers
      FROM historico_precos hp
      WHERE hp.received_at > NOW() - INTERVAL '30 days'
      GROUP BY hp.fingerprint
    )
    SELECT
      l.fingerprint,
      COALESCE(pm.titulo_amigavel, l.descricao_original) AS titulo_amigavel,
      COALESCE(pm.marca, split_part(l.fingerprint, '_', 1)) AS marca,
      COALESCE(pm.modelo, '') AS modelo,
      COALESCE(pm.capacidade, '') AS capacidade,
      COALESCE(pm.categoria, 'outros') AS categoria,
      l.fornecedor_nome AS melhor_fornecedor,
      l.preco_usd AS melhor_preco_usd,
      c.preco_ml_real,
      c.has_catalog,
      c.catalog_ids,
      c.ml_source,
      s.all_suppliers,
      s.num_suppliers,
      l.received_at AS ultima_atualizacao,
      -- Calcular margem (fx=5.80, impostos=15%, taxa_ml=18%)
      CASE
        WHEN c.preco_ml_real IS NOT NULL THEN
          ROUND(
            (c.preco_ml_real - l.preco_usd * 5.80 * 1.15 * 1.18) / c.preco_ml_real * 100
          , 1)
        ELSE NULL
      END AS margem_pct,
      EXISTS(
        SELECT 1 FROM lista_compras lc
        WHERE lc.fingerprint = l.fingerprint AND lc.status = 'pendente' AND lc.added_by = $${pi}
      ) AS no_carrinho,
      EXISTS(
        SELECT 1 FROM price_watches pw
        WHERE pw.fingerprint = l.fingerprint AND pw.username = $${pi} AND pw.active = TRUE
      ) AS monitorando
    FROM latest l
    LEFT JOIN produtos_mestre pm ON pm.fingerprint = l.fingerprint
    LEFT JOIN preco_ml_cache c ON c.fingerprint = l.fingerprint AND c.expires_at > NOW()
    LEFT JOIN suppliers s ON s.fingerprint = l.fingerprint
    HAVING (CASE WHEN c.preco_ml_real IS NOT NULL THEN
      ROUND((c.preco_ml_real - l.preco_usd * 5.80 * 1.15 * 1.18) / c.preco_ml_real * 100, 1)
      ELSE NULL END) >= $${pi + 1} OR c.preco_ml_real IS NULL
    ORDER BY margem_pct DESC NULLS LAST, l.received_at DESC
    LIMIT $${pi + 2}
  `;

  params.push(session.username);
  params.push(min_margem);
  params.push(limit);

  try {
    const result = await pool.query(sql, params);
    return NextResponse.json(result.rows);
  } catch (e) {
    console.error('oportunidades query error:', e);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
