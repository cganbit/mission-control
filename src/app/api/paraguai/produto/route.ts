import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

function buildFingerprint(titulo: string): string {
  return titulo.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function extractCatalogId(url: string): string | null {
  const match = url.match(/MLB-?\d+/i);
  return match ? match[0].toUpperCase() : null;
}

// POST — cadastro manual de produto
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: {
    titulo: string;
    preco_usd: number;
    fornecedor: string;
    categoria: string;
    catalog_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { titulo, preco_usd, fornecedor, categoria, catalog_url } = body;

  if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
    return NextResponse.json({ ok: false, error: 'titulo obrigatório' }, { status: 400 });
  }
  if (typeof preco_usd !== 'number' || preco_usd <= 0) {
    return NextResponse.json({ ok: false, error: 'preco_usd deve ser número > 0' }, { status: 400 });
  }

  const fingerprint = buildFingerprint(titulo);

  const db = getArbitragemPool();
  try {
    // Upsert in produtos_mestre
    await db.query(
      `INSERT INTO produtos_mestre (fingerprint, titulo_amigavel, categoria)
       VALUES ($1, $2, $3)
       ON CONFLICT (fingerprint) DO UPDATE
         SET titulo_amigavel = EXCLUDED.titulo_amigavel,
             categoria       = EXCLUDED.categoria`,
      [fingerprint, titulo.trim(), categoria ?? null]
    );

    // Record price history
    await db.query(
      `INSERT INTO historico_precos
         (fingerprint, fornecedor_nome, preco_usd, descricao_original, parser, received_at)
       VALUES ($1, $2, $3, $4, 'manual', NOW())`,
      [fingerprint, fornecedor ?? null, preco_usd, titulo.trim()]
    );

    // Pin catalog if URL provided
    if (catalog_url && typeof catalog_url === 'string' && catalog_url.trim() !== '') {
      const catalog_id = extractCatalogId(catalog_url);
      if (catalog_id) {
        const pinItem = JSON.stringify([{
          catalog_id,
          url: catalog_url,
          is_manual: true,
          pinned_at: new Date().toISOString(),
        }]);
        await db.query(
          `INSERT INTO preco_ml_cache (fingerprint, ml_catalogs_pinned_json)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (fingerprint) DO UPDATE
             SET ml_catalogs_pinned_json =
               COALESCE(preco_ml_cache.ml_catalogs_pinned_json, '[]'::jsonb)
               || EXCLUDED.ml_catalogs_pinned_json`,
          [fingerprint, pinItem]
        );
      }
    }

    await logAudit(session.username, 'produto_criado', fingerprint, { titulo, preco_usd, fornecedor, categoria, catalog_url });
    return NextResponse.json({ ok: true, fingerprint }, { status: 201 });
  } catch (e) {
    console.error('[paraguai/produto POST]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}

// PATCH — editar produto existente
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: {
    fingerprint: string;
    titulo: string;
    preco_usd: number;
    fornecedor: string;
    categoria: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { fingerprint, titulo, preco_usd, fornecedor, categoria } = body;

  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.trim() === '') {
    return NextResponse.json({ ok: false, error: 'fingerprint obrigatório' }, { status: 400 });
  }

  const db = getArbitragemPool();
  try {
    await db.query(
      `UPDATE produtos_mestre
         SET titulo_amigavel = $2,
             categoria       = $3
       WHERE fingerprint = $1`,
      [fingerprint, titulo ?? null, categoria ?? null]
    );

    // Only insert new price row if price changed from last record for this supplier
    const lastRow = await db.query(
      `SELECT preco_usd FROM historico_precos
       WHERE fingerprint = $1 AND fornecedor_nome = $2
       ORDER BY received_at DESC
       LIMIT 1`,
      [fingerprint, fornecedor ?? null]
    );

    const lastPrice = lastRow.rows[0]?.preco_usd;
    if (lastPrice === undefined || parseFloat(lastPrice) !== preco_usd) {
      await db.query(
        `INSERT INTO historico_precos
           (fingerprint, fornecedor_nome, preco_usd, descricao_original, parser, received_at)
         VALUES ($1, $2, $3, $4, 'manual', NOW())`,
        [fingerprint, fornecedor ?? null, preco_usd, titulo ?? null]
      );
    }

    await logAudit(session.username, 'produto_editado', fingerprint, { titulo, preco_usd, fornecedor, categoria });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[paraguai/produto PATCH]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}

// DELETE — remover produto e dependentes em cascata
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { fingerprints: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { fingerprints } = body;

  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    return NextResponse.json({ ok: false, error: 'fingerprints array obrigatório e não-vazio' }, { status: 400 });
  }

  const db = getArbitragemPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM lista_compras      WHERE fingerprint = ANY($1)`, [fingerprints]);
    await client.query(`DELETE FROM price_watches      WHERE fingerprint = ANY($1)`, [fingerprints]);
    await client.query(`DELETE FROM preco_ml_cache     WHERE fingerprint = ANY($1)`, [fingerprints]);
    await client.query(`DELETE FROM historico_precos   WHERE fingerprint = ANY($1)`, [fingerprints]);
    await client.query(`DELETE FROM produtos_mestre    WHERE fingerprint = ANY($1)`, [fingerprints]);
    await client.query('COMMIT');

    await logAudit(session.username, 'produto_deletado', null, { fingerprints, count: fingerprints.length });
    return NextResponse.json({ ok: true, deleted: fingerprints.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[paraguai/produto DELETE]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  } finally {
    client.release();
  }
}
