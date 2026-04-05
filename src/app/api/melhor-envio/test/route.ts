import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { meTestConnection, meGetBalance } from '@/lib/melhor-envio';

export async function GET(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === process.env.MC_WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [user, balance] = await Promise.all([meTestConnection(), meGetBalance()]);
    return NextResponse.json({
      status: 'ok',
      environment: process.env.MELHOR_ENVIO_ENV ?? 'sandbox',
      name: user.firstname + ' ' + user.lastname,
      email: user.email,
      balance: balance.balance,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}
