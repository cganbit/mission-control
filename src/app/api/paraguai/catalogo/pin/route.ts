import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

function extractCatalogId(url: string): string | null {
  const match = url.match(/MLB-?\d+/i);
  return match ? match[0].toUpperCase() : null;
}

// PATCH — adicionar catálogo manual ao pinned_json
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { fingerprint: string; catalog_url?: string; catalog_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { fingerprint, catalog_url, catalog_id: bodyId } = body;

  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.trim() === '') {
    return NextResponse.json({ ok: false, error: 'fingerprint obrigatório' }, { status: 400 });
  }

  let catalog_id = bodyId ?? null;
  if (!catalog_id && catalog_url) {
    catalog_id = extractCatalogId(catalog_url);
  }

  if (!catalog_id) {
    return NextResponse.json(
      { ok: false, error: 'catalog_url ou catalog_id válido obrigatório' },
      { status: 400 }
    );
  }

  const item = {
    catalog_id,
    url: catalog_url ?? null,
    is_manual: true,
    pinned_at: new Date().toISOString(),
  };

  const db = getArbitragemPool();
  try {
    await db.query(
      `INSERT INTO preco_ml_cache (fingerprint, ml_catalogs_pinned_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (fingerprint) DO UPDATE
         SET ml_catalogs_pinned_json =
           COALESCE(preco_ml_cache.ml_catalogs_pinned_json, '[]'::jsonb)
           || EXCLUDED.ml_catalogs_pinned_json`,
      [fingerprint, JSON.stringify([item])]
    );

    await logAudit(session.username, 'catalogo_pinado', fingerprint, { catalog_id });
    return NextResponse.json({ ok: true, catalog: item });
  } catch (e) {
    console.error('[paraguai/catalogo/pin PATCH]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}

// POST — marcar catálogo como winner (ml_catalog_id scalar)
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { fingerprint: string; catalog_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { fingerprint, catalog_id } = body;

  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.trim() === '') {
    return NextResponse.json({ ok: false, error: 'fingerprint obrigatório' }, { status: 400 });
  }
  if (!catalog_id || typeof catalog_id !== 'string' || catalog_id.trim() === '') {
    return NextResponse.json({ ok: false, error: 'catalog_id obrigatório' }, { status: 400 });
  }

  const db = getArbitragemPool();
  try {
    await db.query(
      `UPDATE preco_ml_cache SET ml_catalog_id = $1 WHERE fingerprint = $2`,
      [catalog_id, fingerprint]
    );

    await logAudit(session.username, 'catalogo_winner_set', fingerprint, { catalog_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[paraguai/catalogo/pin POST]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}

// DELETE — remover catálogo específico do pinned_json
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fingerprint = searchParams.get('fingerprint');
  const catalog_id  = searchParams.get('catalog_id');

  if (!fingerprint || fingerprint.trim() === '') {
    return NextResponse.json({ ok: false, error: 'fingerprint obrigatório' }, { status: 400 });
  }
  if (!catalog_id || catalog_id.trim() === '') {
    return NextResponse.json({ ok: false, error: 'catalog_id obrigatório' }, { status: 400 });
  }

  const db = getArbitragemPool();
  try {
    await db.query(
      `UPDATE preco_ml_cache
         SET ml_catalogs_pinned_json = COALESCE(
           (SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(ml_catalogs_pinned_json) elem
            WHERE elem->>'catalog_id' != $1),
           '[]'::jsonb
         )
       WHERE fingerprint = $2`,
      [catalog_id, fingerprint]
    );

    await logAudit(session.username, 'catalogo_unpinado', fingerprint, { catalog_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[paraguai/catalogo/pin DELETE]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
