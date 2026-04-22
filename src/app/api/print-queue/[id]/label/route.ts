import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { getPool } from '@/lib/db';
import { getSessionFromRequest, hasRole } from '@/lib/auth';
import { auditLog } from '@/lib/mc-audit';
import { getMlAccounts } from '@wingx-app/api-ml';
import { fetchLabel, storeLabelPdf } from '@wingx-app/api-print';
import type { AuditLogger, MLTokenSet } from '@wingx-app/api-print';

const AGENT_KEY = process.env.PRINT_AGENT_KEY ?? '';
const QUEUE_KEY = process.env.QUEUE_KEY ?? '';
const LABELS_DIR = join(process.cwd(), 'labels');
const MOCK_MODE = process.env.ML_LABEL_MOCK === 'true';

// ─── GET — agente/dashboard baixa etiqueta via MC ────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  const queueKey = req.nextUrl.searchParams.get('key');

  const isAgent = !!AGENT_KEY && key === AGENT_KEY;
  const isQueue = !!QUEUE_KEY && queueKey === QUEUE_KEY;
  const session = await getSessionFromRequest(req);
  const isDashboard = !!(session && hasRole(session, 'member'));

  if (!isAgent && !isQueue && !isDashboard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const jobId = Number(id);

  // Build MLTokenSet from MC's ml-tokens lib
  const mlTokens: MLTokenSet = {
    async getTokenForSeller(nickname: string): Promise<string | null> {
      const accounts = await getMlAccounts();
      const found = accounts.find(a => a.nickname === nickname);
      if (!found) {
        console.error(`[label] Token não encontrado para seller: "${nickname}". Contas disponíveis: ${accounts.map(a => a.nickname).join(', ')}`);
        return null;
      }
      return found.access_token;
    },
  };

  const audit: AuditLogger = (entry) => auditLog(entry);

  const db = getPool();

  try {
    const labelResult = await fetchLabel(
      db,
      {
        jobId,
        mlTokens,
        labelsDir: LABELS_DIR,
        mcUrl: process.env.MC_URL,
        testMode: MOCK_MODE || undefined,
      },
      audit,
    );

    return new NextResponse(new Uint8Array(labelResult.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${labelResult.filename}"`,
        'X-Label-Source': labelResult.source,
      },
    });
  } catch (err: any) {
    if (err?.message?.startsWith('Job not found')) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (err?.message === 'ME label not available') {
      return NextResponse.json({ error: 'ME label not available' }, { status: 404 });
    }
    if (err?.message === 'No shipment_id and no test label file found') {
      return NextResponse.json({ error: 'No shipment_id and no test label file found' }, { status: 422 });
    }
    if (err?.message?.startsWith('No ML token available')) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // ML API error — mlStatus set by fetchLabel
    const mlStatus: number | undefined = err?.mlStatus;
    const httpStatus = mlStatus && mlStatus >= 500 ? 502 : 424;
    return NextResponse.json({ error: err?.message ?? 'Label fetch failed' }, { status: httpStatus });
  }
}

// ─── POST — agente envia PDF após imprimir ────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get('x-agent-key');
  if (!AGENT_KEY || key !== AGENT_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const pdfBuffer = Buffer.from(await req.arrayBuffer());
  if (!pdfBuffer.byteLength) return NextResponse.json({ error: 'Empty body' }, { status: 400 });

  const db = getPool();
  const result = await storeLabelPdf(db, { jobId: Number(id), pdf: pdfBuffer, labelsDir: LABELS_DIR });
  return NextResponse.json({ ok: result.ok });
}
