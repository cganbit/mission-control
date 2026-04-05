import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { meCalculateFreight } from '@/lib/melhor-envio';

export async function POST(req: NextRequest) {
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = workerKey === process.env.MC_WORKER_KEY;

  if (!isWorker) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      from_zip = '09051380',
      to_zip,
      weight = 0.5,
      width = 20,
      height = 10,
      length = 20,
      insurance_value = 0,
    } = body;

    if (!to_zip) return NextResponse.json({ error: 'to_zip obrigatório' }, { status: 400 });

    const results: any[] = await meCalculateFreight(
      from_zip,
      to_zip,
      weight,
      width,
      height,
      length,
      insurance_value
    );

    const pac = results.find((s: any) => s.id === 1);
    const sedex = results.find((s: any) => s.id === 2);

    const formatted = [pac, sedex]
      .filter(Boolean)
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        delivery_time: s.delivery_time,
        delivery_range: s.delivery_range,
        error: s.error ?? null,
        adicional: null as string | null,
      }));

    if (formatted.length === 2 && !formatted[0].error && !formatted[1].error) {
      const pacPrice = parseFloat(formatted[0].price ?? '0');
      const sedexPrice = parseFloat(formatted[1].price ?? '0');
      formatted[1].adicional = (sedexPrice - pacPrice).toFixed(2);
    }

    return NextResponse.json({ services: formatted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
