import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';
const QUEUE_KEY = process.env.QUEUE_KEY ?? '';
const ML_API = 'https://api.mercadolibre.com';
const LABELS_DIR = join(process.cwd(), 'labels');

function ensureLabelsDir() {
  if (!existsSync(LABELS_DIR)) mkdirSync(LABELS_DIR, { recursive: true });
}

async function getTokenForSeller(nickname: string): Promise<string | null> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return null;
  const accounts: Array<{ nickname: string; access_token: string }> =
    (() => { const p = JSON.parse(row.rows[0].value); return Array.isArray(p) ? p : (p.accounts ?? []); })();
  return accounts.find(a => a.nickname === nickname)?.access_token ?? accounts[0]?.access_token ?? null;
}

// ─── GET — agente baixa etiqueta via MC ──────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  const queueKey = req.nextUrl.searchParams.get('key');

  const isAgent = AGENT_KEY && key === AGENT_KEY;
  const isQueue = QUEUE_KEY && queueKey === QUEUE_KEY;

  if (!isAgent && !isQueue) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getPool();

  const row = await db.query(
    `SELECT ml_shipment_id, seller_nickname, has_label, ml_order_id FROM print_queue WHERE id = $1`,
    [id]
  );

  if (!row.rows[0]) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const { ml_shipment_id, seller_nickname, has_label, ml_order_id } = row.rows[0];

  // Se já temos o PDF salvo, serve direto
  if (has_label) {
    ensureLabelsDir();
    const saved = join(LABELS_DIR, `${id}.pdf`);
    if (existsSync(saved)) {
      const pdf = readFileSync(saved);
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="etiqueta-${ml_order_id}.pdf"`,
        },
      });
    }
  }

  // Modo teste: sem shipment_id → serve arquivo local de /public/test-label-{id}.pdf
  if (!ml_shipment_id) {
    try {
      const testFile = join(process.cwd(), 'public', `test-label-${id}.pdf`);
      const pdf = readFileSync(testFile);
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="etiqueta-teste-${id}.pdf"`,
        },
      });
    } catch {
      return NextResponse.json({ error: 'No shipment_id and no test label file found' }, { status: 422 });
    }
  }

  // Apenas agente pode buscar do ML
  if (!isAgent) {
    return NextResponse.json({ error: 'Label not stored yet' }, { status: 404 });
  }

  const token = await getTokenForSeller(seller_nickname);
  if (!token) {
    return NextResponse.json({ error: 'No ML token available' }, { status: 503 });
  }

  const mlRes = await fetch(
    `${ML_API}/shipments/${ml_shipment_id}/labels?response_type=pdf2&free_method=false`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) }
  );

  if (!mlRes.ok) {
    const txt = await mlRes.text().catch(() => '');
    return NextResponse.json({ error: `ML ${mlRes.status}: ${txt.slice(0, 100)}` }, { status: 502 });
  }

  const pdf = await mlRes.arrayBuffer();
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="etiqueta-${ml_shipment_id}.pdf"`,
    },
  });
}

// ─── POST — agente envia PDF após imprimir ────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  if (!AGENT_KEY || key !== AGENT_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const pdf = await req.arrayBuffer();
  if (!pdf.byteLength) return NextResponse.json({ error: 'Empty body' }, { status: 400 });

  ensureLabelsDir();
  writeFileSync(join(LABELS_DIR, `${id}.pdf`), Buffer.from(pdf));

  const db = getPool();
  await db.query(`UPDATE print_queue SET has_label = true WHERE id = $1`, [id]);

  return NextResponse.json({ ok: true });
}
