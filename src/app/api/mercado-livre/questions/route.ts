import { NextRequest, NextResponse } from 'next/server';
import { listQuestions, answerQuestion, getMlAccounts } from '@wingx-app/api-ml';
import type { QuestionsMlAccountsProvider } from '@wingx-app/api-ml';
import { getSessionFromRequest } from '@/lib/auth';
import { getPool } from '@/lib/db';

const provider: QuestionsMlAccountsProvider = {
  getMlAccounts: () => getMlAccounts(getPool()),
};

// GET /api/mercado-livre/questions?seller_id=X
// Lista perguntas não respondidas com contexto do produto
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sellerIdParam = req.nextUrl.searchParams.get('seller_id');
    const input = {
      sellerId: sellerIdParam ? Number(sellerIdParam) : undefined,
    };

    const result = await listQuestions(provider, input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/mercado-livre/questions GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/mercado-livre/questions
// Body: { seller_id, question_id, text }
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { seller_id, question_id, text } = body;
    if (!seller_id || !question_id || !text) {
      return NextResponse.json(
        { error: 'seller_id, question_id e text obrigatórios' },
        { status: 400 }
      );
    }

    const result = await answerQuestion(provider, { seller_id, question_id, text });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/mercado-livre/questions POST]', err);
    const status = err?.status ?? 500;
    if (status === 404) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
