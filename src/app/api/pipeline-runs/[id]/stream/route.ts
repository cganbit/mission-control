import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

const WORKER_KEY = process.env.MC_WORKER_KEY ?? '';

function isAuthorized(req: NextRequest) {
  return req.headers.get('x-worker-key') === WORKER_KEY && WORKER_KEY !== '';
}

type RouteContext = { params: Promise<{ id: string }> };

interface RunRow {
  id: string;
  status: string;
  title: string | null;
  sprint_number: number | null;
  prd_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: string | null;
  last_heartbeat_at: string | null;
  [k: string]: unknown;
}

interface StepRow {
  id: string;
  run_id: string;
  step_id: string;
  step_index: number;
  status: string;
  agent: string | null;
  parallel_group: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  output_summary: string | null;
  error_message: string | null;
  [k: string]: unknown;
}

/**
 * SSE stream for a single pipeline run. Polls DB every 2s and emits a diff
 * when run state or any step state changes. Also emits a heartbeat comment
 * every 15s so proxies (nginx) don't close idle connections.
 *
 * Terminates when status becomes terminal (ok/failed/cancelled) and the
 * client has received the final update — keeps the connection 5s extra
 * after terminal state so the frontend can redraw.
 *
 * Events emitted:
 *   event: snapshot — full { run, steps } payload (sent once on connect)
 *   event: step     — { step } diff when a step changes
 *   event: run      — { run } diff when run metadata changes
 *   event: end      — { status } when run reaches terminal state
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionFromRequest(req);
  if (!session && !isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await ctx.params;

  const run0 = await queryOne<RunRow>(
    `SELECT * FROM pipeline_runs WHERE id = $1`,
    [id]
  );
  if (!run0) {
    return new Response('Run not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Cache of last-seen signatures so we only emit diffs
      const stepSig = new Map<string, string>();
      let runSig = '';
      let terminalEmittedAt: number | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const sigForRun = (r: RunRow) =>
        [r.status, r.finished_at ?? '', r.duration_ms ?? '', r.total_tokens ?? '', r.estimated_cost_usd ?? '', r.last_heartbeat_at ?? ''].join('|');

      const sigForStep = (s: StepRow) =>
        [s.status, s.started_at ?? '', s.finished_at ?? '', s.duration_ms ?? '', s.output_summary ?? '', s.error_message ?? ''].join('|');

      // Initial snapshot
      const steps0 = await query<StepRow>(
        `SELECT * FROM pipeline_steps WHERE run_id = $1 ORDER BY step_index ASC`,
        [id]
      );
      send('snapshot', { run: run0, steps: steps0 });
      runSig = sigForRun(run0);
      for (const s of steps0) stepSig.set(s.step_id, sigForStep(s));

      const isTerminal = (status: string) =>
        status === 'ok' || status === 'failed' || status === 'cancelled';

      if (isTerminal(run0.status)) {
        // Run is already done — emit end and close after a brief delay
        send('end', { status: run0.status });
        terminalEmittedAt = Date.now();
      }

      const poll = async () => {
        if (closed) return;
        try {
          const run = await queryOne<RunRow>(
            `SELECT * FROM pipeline_runs WHERE id = $1`,
            [id]
          );
          if (!run) return;

          const newRunSig = sigForRun(run);
          if (newRunSig !== runSig) {
            send('run', { run });
            runSig = newRunSig;
          }

          const steps = await query<StepRow>(
            `SELECT * FROM pipeline_steps WHERE run_id = $1 ORDER BY step_index ASC`,
            [id]
          );
          for (const s of steps) {
            const sig = sigForStep(s);
            if (stepSig.get(s.step_id) !== sig) {
              send('step', { step: s });
              stepSig.set(s.step_id, sig);
            }
          }

          if (isTerminal(run.status) && terminalEmittedAt === null) {
            send('end', { status: run.status });
            terminalEmittedAt = Date.now();
          }

          // 5s grace after terminal → close
          if (terminalEmittedAt !== null && Date.now() - terminalEmittedAt > 5000) {
            closed = true;
            try { controller.close(); } catch { /* noop */ }
          }
        } catch {
          // Never crash the stream on a transient DB hiccup
        }
      };

      const pollInterval = setInterval(poll, 2000);
      const heartbeatInterval = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { closed = true; }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* noop */ }
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
