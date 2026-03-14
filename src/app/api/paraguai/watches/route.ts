import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem'),
  max: 5,
});

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await pool.query(
    `SELECT * FROM price_watches WHERE username = $1 AND active = TRUE ORDER BY created_at DESC`,
    [session.username]
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { fingerprint, titulo_amigavel, preco_usd_referencia, notify_only_if_lower, whatsapp_number } = body;
  if (!fingerprint) return NextResponse.json({ error: 'fingerprint required' }, { status: 400 });

  // Get user's whatsapp from notification_settings if not provided
  let wapNumber = whatsapp_number;
  if (!wapNumber) {
    const ns = await pool.query(
      'SELECT whatsapp_number FROM notification_settings WHERE username = $1',
      [session.username]
    );
    wapNumber = ns.rows[0]?.whatsapp_number || '';
  }

  if (!wapNumber) return NextResponse.json({ error: 'Configure seu número WhatsApp nas configurações' }, { status: 400 });

  // Upsert: reactivate if already exists
  const result = await pool.query(
    `INSERT INTO price_watches (username, whatsapp_number, fingerprint, titulo_amigavel, preco_usd_referencia, notify_only_if_lower)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (username, fingerprint) WHERE active = TRUE
     DO UPDATE SET preco_usd_referencia=$5, notify_only_if_lower=$6, last_notified_at=NULL
     RETURNING *`,
    [session.username, wapNumber, fingerprint, titulo_amigavel, preco_usd_referencia, notify_only_if_lower ?? false]
  );
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fingerprint } = await req.json();
  await pool.query(
    `UPDATE price_watches SET active = FALSE WHERE username = $1 AND fingerprint = $2`,
    [session.username, fingerprint]
  );
  return NextResponse.json({ ok: true });
}
