import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

const GH_TOKEN = process.env.GH_WORKFLOW_DISPATCH_TOKEN ?? '';

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = getProjectScopeFromSession(session);

  const body = await req.json();
  const { event_id, target_repo, issue_number, pr_number } = body as {
    event_id: string;
    target_repo: string;
    issue_number?: number;
    pr_number?: number;
  };

  if (!event_id || !target_repo)
    return NextResponse.json({ error: 'event_id and target_repo are required' }, { status: 400 });

  // Verify the event exists and belongs to this project (RLS enforced via scope)
  const ev = await queryOne<{ id: string; event_type: string; classification: string | null }>(
    `SELECT id, event_type, classification FROM github_webhook_events WHERE id = $1`,
    [event_id],
    scope
  );

  if (!ev)
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Derive a human-readable title for the pipeline run
  const issueRef = issue_number ? `#${issue_number}` : pr_number ? `PR #${pr_number}` : '';
  const title = `fix: ${target_repo}${issueRef ? ' ' + issueRef : ''} (via GitHub event ${ev.event_type})`;

  // Insert pipeline_run row (type = fix, triggered_by = manual UI dispatch)
  const run = await queryOne<{ id: string; started_at: string }>(
    `INSERT INTO pipeline_runs
       (run_type, status, title, triggered_by, metadata, last_heartbeat_at)
     VALUES ('fix', 'running', $1, 'manual_dispatch', $2, NOW())
     RETURNING id, started_at`,
    [
      title,
      JSON.stringify({
        source: 'github_dispatch',
        event_id,
        target_repo,
        issue_number: issue_number ?? null,
        pr_number: pr_number ?? null,
        classification: ev.classification,
      }),
    ],
    scope
  );

  const pipelineRunId = run!.id;

  // Attempt workflow_dispatch if token is configured
  let ghRunId: number | null = null;
  let warning: string | undefined;

  if (GH_TOKEN) {
    try {
      const [owner, repo] = target_repo.split('/');
      const dispatchPayload: Record<string, unknown> = {
        ref: 'main',
        inputs: {
          event_id,
          pipeline_run_id: pipelineRunId,
          ...(issue_number != null ? { issue_number: String(issue_number) } : {}),
          ...(pr_number != null ? { pr_number: String(pr_number) } : {}),
        },
      };

      const ghRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/fix.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dispatchPayload),
        }
      );

      if (!ghRes.ok) {
        const errText = await ghRes.text();
        // Non-fatal: workflow may not exist; pipeline_run is still created
        warning = `GH dispatch failed (${ghRes.status}): ${errText.slice(0, 200)}`;

        // Mark run as failed since workflow couldn't be triggered
        await queryOne(
          `UPDATE pipeline_runs SET status = 'failed', finished_at = NOW() WHERE id = $1 RETURNING id`,
          [pipelineRunId],
          scope
        );
      } else {
        // GH workflow_dispatch returns 204 No Content — no run_id available synchronously
        ghRunId = null;
      }
    } catch (err) {
      warning = `GH dispatch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    warning = 'Dispatch deferred — no GH token configured (GH_WORKFLOW_DISPATCH_TOKEN not set)';
  }

  return NextResponse.json(
    {
      pipeline_run_id: pipelineRunId,
      run_id: ghRunId,
      ...(warning ? { warning } : {}),
    },
    { status: 201 }
  );
}
