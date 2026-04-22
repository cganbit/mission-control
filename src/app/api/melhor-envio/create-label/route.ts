import { NextRequest, NextResponse } from 'next/server';
import { createLabel } from '@wingx-app/api-me';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { safeDecrypt } from '@/lib/crypto';

// POST /api/melhor-envio/create-label
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const input = {
      projectId: session.project_id,
      ...body,
      cryptoAdapter: { safeDecrypt: (s: string) => safeDecrypt(s) },
      labelsDir: process.env.ME_LABELS_DIR ?? './labels',
    };
    const result = await createLabel(getPool(), input);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err?.code === 'LABEL_EXISTS') return NextResponse.json({ error: 'Label already exists' }, { status: 409 });
    console.error('[api/melhor-envio/create-label]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
