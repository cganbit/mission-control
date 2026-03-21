import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { types } from 'pg';
import { getArbitragemPool } from '@/lib/db';

// Força o pg a retornar NUMERIC (1700) e BIGINT (20) como números
types.setTypeParser(1700, (val) => parseFloat(val));
types.setTypeParser(20, (val) => parseInt(val, 10));

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const marca    = searchParams.get('marca') || '';
  const categoria = searchParams.get('categoria') || '';
  const fornecedor = searchParams.get('fornecedor') || '';
  const has_catalog = searchParams.get('has_catalog');
  const min_margem = parseFloat(searchParams.get('min_margem') || '-100') || -100;
  const search = searchParams.get('search') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  // Get the latest price for each fingerprint from historico_precos
  // Join with preco_ml_cache to get ML prices
  // Only return products seen in the last 30 days
  const conditions: string[] = ['hp.received_at > NOW() - INTERVAL \'30 days\''];
  const params: unknown[] = [];
  let pi = 1;

  if (marca) {
    conditions.push(`hp.fingerprint IN (SELECT fingerprint FROM produtos_mestre WHERE marca ILIKE $${pi++})`);
    params.push(marca);
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
  if (fornecedor) {
    conditions.push(`hp.fornecedor_nome = $${pi++}`);
    params.push(fornecedor);
  }
  if (search) {
    // Busca flexível no título, marca ou descrição original
    conditions.push(`(
      hp.descricao_original ILIKE $${pi} OR 
      hp.fingerprint IN (SELECT fingerprint FROM produtos_mestre WHERE titulo_amigavel ILIKE $${pi} OR marca ILIKE $${pi})
    )`);
    params.push(`%${search}%`);
    pi++;
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
    ),
    history_trend AS (
      SELECT 
        fingerprint,
        json_agg(json_build_object(
          'date', date_trunc('day', received_at),
          'min_preco_usd', min_preco,
          'min_preco_ml', min_ml
        ) ORDER BY date_trunc('day', received_at) ASC) as price_history
      FROM (
        SELECT 
          fingerprint, 
          received_at, 
          MIN(preco_usd) as min_preco,
          MIN(preco_ml_real) as min_ml
        FROM historico_precos
        WHERE received_at > NOW() - INTERVAL '30 days'
        GROUP BY fingerprint, date_trunc('day', received_at), received_at
      ) daily_mins
      GROUP BY fingerprint
    )
    SELECT * FROM (
      SELECT
        l.fingerprint,
        COALESCE(pm.titulo_amigavel, l.descricao_original) AS titulo_amigavel,
        COALESCE(pm.marca, split_part(l.fingerprint, '_', 1)) AS marca,
        COALESCE(pm.modelo, '') AS modelo,
        COALESCE(pm.capacidade, '') AS capacidade,
        COALESCE(pm.categoria, 'outros') AS categoria,
        COALESCE(pm.origem, '') AS origem,
        l.fornecedor_nome AS melhor_fornecedor,
        l.preco_usd AS melhor_preco_usd,
        c.preco_ml_real,
        c.ml_price_premium,
        c.ml_price_classic,
        c.ml_catalogs_json,
        c.ml_catalog_id,
        c.ml_catalog_url,
        c.ml_shipping_type as shipping_type,
        c.has_catalog,
        c.catalog_ids,
        c.ml_source,
        c.ml_enriched_json,
        s.all_suppliers,
        s.num_suppliers,
        l.received_at AS ultima_atualizacao,
        ht.price_history,
        CASE
          WHEN c.ml_price_premium IS NOT NULL AND c.ml_price_premium > 0 THEN
            ROUND((c.ml_price_premium * 0.82) - (l.preco_usd * 5.8), 2)
          ELSE NULL
        END AS lucro_premium,
        CASE
          WHEN c.ml_price_premium IS NOT NULL AND c.ml_price_premium > 0 THEN
            ROUND((( (c.ml_price_premium * 0.82) - (l.preco_usd * 5.8) ) / c.ml_price_premium) * 100, 1)
          ELSE 0
        END AS margem_premium,
        CASE
          WHEN c.ml_price_classic IS NOT NULL AND c.ml_price_classic > 0 THEN
            ROUND((c.ml_price_classic * 0.84) - (l.preco_usd * 5.8), 2)
          ELSE NULL
        END AS lucro_classico,
        CASE
          WHEN c.ml_price_classic IS NOT NULL AND c.ml_price_classic > 0 THEN
            ROUND((( (c.ml_price_classic * 0.84) - (l.preco_usd * 5.8) ) / c.ml_price_classic) * 100, 1)
          ELSE 0
        END AS margem_classico,
        -- Mantemos margem_pct para compatibilidade de ordenação/filtro (usando o maior)
        GREATEST(
          CASE WHEN c.ml_price_premium > 0 THEN ROUND((((c.ml_price_premium*0.82)-(l.preco_usd*5.8))/c.ml_price_premium)*100,1) ELSE -100 END,
          CASE WHEN c.ml_price_classic > 0 THEN ROUND((((c.ml_price_classic*0.84)-(l.preco_usd*5.8))/c.ml_price_classic)*100,1) ELSE -100 END
        ) AS margem_pct,
        EXISTS(
          SELECT 1 FROM lista_compras lc
          WHERE lc.fingerprint = l.fingerprint AND lc.status = 'pendente' AND lc.added_by = $${pi}
        ) AS no_carrinho,
        EXISTS(
          SELECT 1 FROM price_watches pw
          WHERE pw.fingerprint = l.fingerprint AND pw.username = $${pi} AND pw.active = TRUE
        ) AS monitorando,
        l.descricao_original AS descricao_raw
      FROM latest l
      LEFT JOIN produtos_mestre pm ON pm.fingerprint = l.fingerprint
      LEFT JOIN preco_ml_cache c ON c.fingerprint = l.fingerprint AND c.expires_at > NOW()
      LEFT JOIN suppliers s ON s.fingerprint = l.fingerprint
      LEFT JOIN history_trend ht ON ht.fingerprint = l.fingerprint
    ) sub
    WHERE (margem_pct >= $${pi + 1} OR margem_pct IS NULL OR $${pi + 1} = 0)
    ORDER BY margem_pct DESC NULLS LAST, ultima_atualizacao DESC
    LIMIT $${pi + 2}
  `;

  params.push(session.username);
  params.push(min_margem);
  params.push(limit);

  try {
    const result = await getArbitragemPool().query(sql, params);
    return NextResponse.json(result.rows);
  } catch (e) {
    console.error('oportunidades query error:', e);
    // Fallback if 'origem' simply doesn't exist on PM yet, return without it safely
    try {
      const fallbackSql = sql.replace("COALESCE(pm.origem, '') AS origem,", "").replace("c.ml_enriched_json,", "NULL::jsonb AS ml_enriched_json,");
      const resFallback = await getArbitragemPool().query(fallbackSql, params);
      return NextResponse.json(resFallback.rows);
    } catch(e2) {
      console.error('Fallback failed:', e2);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
  }
}
