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
    'SELECT * FROM notification_settings WHERE username = $1',
    [session.username]
  );
  // Return defaults if not configured yet
  return NextResponse.json(result.rows[0] ?? {
    username: session.username,
    whatsapp_number: '',
    whatsapp_alerts_global: true,
    min_margem: 20.0,
    marcas_filtro: [],
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { whatsapp_number, whatsapp_alerts_global, min_margem, marcas_filtro } = body;

  const result = await pool.query(
    `INSERT INTO notification_settings (username, whatsapp_number, whatsapp_alerts_global, min_margem, marcas_filtro)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (username) DO UPDATE SET
       whatsapp_number = COALESCE($2, notification_settings.whatsapp_number),
       whatsapp_alerts_global = COALESCE($3, notification_settings.whatsapp_alerts_global),
       min_margem = COALESCE($4, notification_settings.min_margem),
       marcas_filtro = COALESCE($5, notification_settings.marcas_filtro)
     RETURNING *`,
    [session.username, whatsapp_number, whatsapp_alerts_global, min_margem, marcas_filtro]
  );
  return NextResponse.json(result.rows[0]);
}
