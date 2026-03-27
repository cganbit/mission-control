import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    const client = await getPool().connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  } catch {
    dbStatus = 'error';
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  const httpStatus = dbStatus === 'ok' ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        app: 'ok',
      },
      version: '22',
    },
    { status: httpStatus }
  );
}
