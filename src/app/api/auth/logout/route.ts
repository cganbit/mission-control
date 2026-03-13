import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);

  if (session?.sid) {
    try {
      await query(
        `INSERT INTO access_logs (user_id, username, session_id, action, ip, user_agent)
         VALUES ($1, $2, $3, 'logout', $4, $5)`,
        [
          session.sub,
          session.username,
          session.sid,
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
          req.headers.get('user-agent') ?? '',
        ]
      );
    } catch {
      // access_logs may not exist yet — ignore
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete('mc_token');
  return res;
}
