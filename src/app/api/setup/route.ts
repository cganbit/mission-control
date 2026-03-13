import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';
import { CREATE_TABLES_SQL, SEED_PARAGUAY_SQUAD_SQL } from '@/db/schema';

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await query(CREATE_TABLES_SQL);
    await query(SEED_PARAGUAY_SQUAD_SQL);
    return NextResponse.json({ ok: true, message: 'Database initialized and seeded' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
