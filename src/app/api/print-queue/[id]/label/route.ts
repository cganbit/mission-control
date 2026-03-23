import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';
const ML_API = 'https://api.mercadolibre.com';

async function getTokenForSeller(nickname: string): Promise<string | null> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return null;
  const accounts: Array<{ nickname: string; access_token: string }> =
    (() => { const p = JSON.parse(row.rows[0].value); return Array.isArray(p) ? p : (p.accounts ?? []); })();
  return accounts.find(a => a.nickname === nickname)?.access_token ?? accounts[0]?.access_token ?? null;
}

// ─── GET /api/print-queue/[id]/label — agente baixa etiqueta via MC ──────────
// MC faz o proxy do ML usando os tokens armazenados (renovados automaticamente)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  if (!AGENT_KEY || key !== AGENT_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getPool();

  const row = await db.query(
    `SELECT ml_shipment_id, seller_nickname FROM print_queue WHERE id = $1`,
    [id]
  );

  if (!row.rows[0]) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const { ml_shipment_id, seller_nickname } = row.rows[0];
  if (!ml_shipment_id) {
    return NextResponse.json({ error: 'No shipment_id — may be Flex or pickup' }, { status: 422 });
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
