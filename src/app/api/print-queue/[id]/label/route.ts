import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';
const QUEUE_KEY = process.env.QUEUE_KEY ?? '';
const ML_API = 'https://api.mercadolibre.com';
const LABELS_DIR = join(process.cwd(), 'labels');
// Modo sandbox: ML_LABEL_MOCK=true ou order_id começando com 9999
const MOCK_MODE = process.env.ML_LABEL_MOCK === 'true';

function ensureLabelsDir() {
  if (!existsSync(LABELS_DIR)) mkdirSync(LABELS_DIR, { recursive: true });
}

// Gera PDF válido com dimensões de etiqueta (4x6 polegadas = 288x432 pts)
function generateMockPdf(orderId: string): Buffer {
  const parts: string[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const w = (s: string) => { parts.push(s); pos += Buffer.byteLength(s); };

  w('%PDF-1.4\n');
  offsets[1] = pos; w('1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n');
  offsets[2] = pos; w('2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n');
  offsets[3] = pos; w('3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 288 432]\n/Resources <</Font <</F1 5 0 R>>>>\n/Contents 4 0 R>>\nendobj\n');
  const stream = `BT\n/F1 14 Tf\n10 410 Td\n(ETIQUETA TESTE) Tj\n0 -24 Td\n(Pedido: ${orderId}) Tj\n0 -24 Td\n(Modo Sandbox) Tj\nET`;
  offsets[4] = pos; w(`4 0 obj\n<</Length ${Buffer.byteLength(stream)}>>\nstream\n${stream}\nendstream\nendobj\n`);
  offsets[5] = pos; w('5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n');

  const xref = pos;
  w('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) w(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  w(`trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`);

  return Buffer.from(parts.join(''));
}

async function getTokenForSeller(nickname: string): Promise<string | null> {
  const db = getPool();
  const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
  if (!row.rows[0]) return null;
  const accounts: Array<{ nickname: string; access_token: string }> =
    (() => { const p = JSON.parse(row.rows[0].value); return Array.isArray(p) ? p : (p.accounts ?? []); })();
  // Cada conta usa EXCLUSIVAMENTE seu próprio token — sem fallback para outras contas
  const found = accounts.find(a => a.nickname === nickname);
  if (!found) {
    console.error(`[label] Token não encontrado para seller: "${nickname}". Contas disponíveis: ${accounts.map(a => a.nickname).join(', ')}`);
    return null;
  }
  return found.access_token;
}

// ─── GET — agente baixa etiqueta via MC ──────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  const queueKey = req.nextUrl.searchParams.get('key');

  const isAgent = AGENT_KEY && key === AGENT_KEY;
  const isQueue = QUEUE_KEY && queueKey === QUEUE_KEY;
  const session = await getSessionFromRequest(req);
  const isDashboard = !!(session && hasRole(session, 'member'));

  if (!isAgent && !isQueue && !isDashboard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getPool();

  const row = await db.query(
    `SELECT ml_shipment_id, seller_nickname, has_label, ml_order_id, logistic_type FROM print_queue WHERE id = $1`,
    [id]
  );

  if (!row.rows[0]) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const { ml_shipment_id, seller_nickname, has_label, ml_order_id, logistic_type } = row.rows[0];

  // Verificar test_mode por conta
  const accountCfg = await db.query(
    `SELECT test_mode FROM ml_account_configs WHERE nickname = $1 LIMIT 1`,
    [seller_nickname]
  );
  const accountTestMode = accountCfg.rows[0]?.test_mode ?? false;

  // Modo sandbox: retorna PDF de teste sem chamar a ML API
  const isMock = MOCK_MODE || accountTestMode || String(ml_order_id ?? '').startsWith('9999');
  if (isMock) {
    const isLogisticType = (t: string) => String(logistic_type ?? '').toLowerCase().includes(t);
    const mockCandidates = [
      isLogisticType('flex') ? join(process.cwd(), 'public', 'test-label-flex.pdf') : null,
      isLogisticType('me2') || isLogisticType('mercado') ? join(process.cwd(), 'public', 'test-label-mercadoenvios.pdf') : null,
      join(process.cwd(), 'public', 'test-label-mock.pdf'),
    ];
    const mockFile = mockCandidates.find(f => f && existsSync(f)) ?? null;
    const pdf = mockFile ? readFileSync(mockFile) : generateMockPdf(String(ml_order_id));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="etiqueta-mock-${ml_order_id}.pdf"`,
        'X-Label-Source': 'mock',
      },
    });
  }

  // Se já temos o PDF salvo, serve direto
  if (has_label) {
    ensureLabelsDir();
    const saved = join(LABELS_DIR, `${id}.pdf`);
    if (existsSync(saved)) {
      const pdf = readFileSync(saved);
      return new NextResponse(new Uint8Array(pdf), {
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
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="etiqueta-teste-${id}.pdf"`,
        },
      });
    } catch {
      return NextResponse.json({ error: 'No shipment_id and no test label file found' }, { status: 422 });
    }
  }

  // Apenas agente ou dashboard pode buscar do ML
  if (!isAgent && !isDashboard) {
    return NextResponse.json({ error: 'Label not stored yet' }, { status: 404 });
  }

  const token = await getTokenForSeller(seller_nickname);
  if (!token) {
    return NextResponse.json({ error: 'No ML token available' }, { status: 503 });
  }

  const mlRes = await fetch(
    `${ML_API}/shipment_labels?shipment_ids=${ml_shipment_id}&response_type=pdf`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) }
  );

  if (!mlRes.ok) {
    const txt = await mlRes.text().catch(() => '');
    console.error(`[label] ML error ${mlRes.status} para shipment ${ml_shipment_id} (seller: ${seller_nickname}): ${txt.slice(0, 200)}`);
    // 424 = Failed Dependency (erro na ML API), 502 = apenas para erros 5xx da ML
    const status = mlRes.status >= 500 ? 502 : 424;
    return NextResponse.json({ error: `ML ${mlRes.status}: ${txt.slice(0, 100)}` }, { status });
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
