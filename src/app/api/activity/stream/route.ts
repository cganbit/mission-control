import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const scope = getProjectScopeFromSession(session);
  const squadId = req.nextUrl.searchParams.get('squad_id');

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode(': ping\n\n'));

      // Track latest timestamp seen
      let lastTimestamp = new Date().toISOString();

      const send = (data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const params: unknown[] = [lastTimestamp];
          const where = squadId
            ? `WHERE al.timestamp > $1 AND al.squad_id = $2`
            : `WHERE al.timestamp > $1`;
          if (squadId) params.push(squadId);

          const rows = await query(`
            SELECT al.*, a.name AS agent_name, s.name AS squad_name, s.color AS squad_color
            FROM activity_log al
            LEFT JOIN agents a ON a.id = al.agent_id
            LEFT JOIN squads s ON s.id = al.squad_id
            ${where}
            ORDER BY al.timestamp ASC
            LIMIT 20
          `, params, scope) as { timestamp: string }[];

          if (rows.length > 0) {
            lastTimestamp = rows[rows.length - 1].timestamp;
            for (const row of rows) send(row);
          }
        } catch {
          // DB error — keep connection alive, retry next tick
        }
      };

      const interval = setInterval(poll, 2000);

      // Close stream when client disconnects
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
