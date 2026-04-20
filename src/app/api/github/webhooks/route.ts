import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { withWorkerBypass } from '@/lib/db';

// PRD-040 Camada 1 — GitHub webhook receiver (observability read-only).
// TODO: project_id resolution via repo→project mapping. MVP usa Paraguai default
// (único tenant real em prod). Mapeamento multi-tenant vira PR futuro: opções
// consideradas são `connector_configs` key=`github_repo_<owner>/<repo>` ou tabela
// dedicada `github_repo_project_map(repo, project_id)`.
const PARAGUAI_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

const WEBHOOK_SECRET = process.env.MC_GITHUB_WEBHOOK_SECRET ?? '';

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

function resolveProjectId(_repo: string | null): string {
  // TODO: lookup em connector_configs ou github_repo_project_map.
  return PARAGUAI_PROJECT_ID;
}

interface GitHubIssuePayload {
  action?: string;
  issue?: {
    id: number;
    number: number;
    title: string;
    state: string;
    labels?: Array<{ name: string }> | string[];
    body?: string | null;
    created_at: string;
    closed_at?: string | null;
    updated_at?: string;
  };
  repository?: { full_name?: string };
}

interface GitHubPullRequestPayload {
  action?: string;
  pull_request?: {
    id: number;
    number: number;
    title: string;
    state: string;
    labels?: Array<{ name: string }> | string[];
    body?: string | null;
    head?: { ref?: string };
    base?: { ref?: string };
    created_at: string;
    closed_at?: string | null;
    merged_at?: string | null;
    updated_at?: string;
  };
  repository?: { full_name?: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = req.headers.get('x-github-event') ?? 'unknown';
  const deliveryId = req.headers.get('x-github-delivery') ?? '';

  const repoName =
    (payload as { repository?: { full_name?: string } })?.repository?.full_name ?? null;
  const projectId = resolveProjectId(repoName);

  await withWorkerBypass(async (q) => {
    await q(
      `INSERT INTO github_webhook_events (project_id, event_type, delivery_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [projectId, eventType, deliveryId, rawBody]
    );

    if (eventType === 'issues') {
      const p = payload as GitHubIssuePayload;
      const issue = p.issue;
      if (issue && repoName) {
        const labels = JSON.stringify(
          Array.isArray(issue.labels)
            ? issue.labels.map((l) => (typeof l === 'string' ? l : l.name))
            : []
        );
        await q(
          `INSERT INTO github_issues
             (github_id, project_id, repo, number, title, state, labels, body, opened_at, closed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, NOW())
           ON CONFLICT (github_id) DO UPDATE SET
             title      = EXCLUDED.title,
             state      = EXCLUDED.state,
             labels     = EXCLUDED.labels,
             body       = EXCLUDED.body,
             closed_at  = EXCLUDED.closed_at,
             updated_at = NOW()`,
          [
            issue.id,
            projectId,
            repoName,
            issue.number,
            issue.title,
            issue.state,
            labels,
            issue.body ?? null,
            issue.created_at,
            issue.closed_at ?? null,
          ]
        );
      }
    } else if (eventType === 'pull_request') {
      const p = payload as GitHubPullRequestPayload;
      const pr = p.pull_request;
      if (pr && repoName) {
        const labels = JSON.stringify(
          Array.isArray(pr.labels)
            ? pr.labels.map((l) => (typeof l === 'string' ? l : l.name))
            : []
        );
        await q(
          `INSERT INTO github_prs
             (github_id, project_id, repo, number, title, state, labels, body, head_ref, base_ref, opened_at, closed_at, merged_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (github_id) DO UPDATE SET
             title      = EXCLUDED.title,
             state      = EXCLUDED.state,
             labels     = EXCLUDED.labels,
             body       = EXCLUDED.body,
             head_ref   = EXCLUDED.head_ref,
             base_ref   = EXCLUDED.base_ref,
             closed_at  = EXCLUDED.closed_at,
             merged_at  = EXCLUDED.merged_at,
             updated_at = NOW()`,
          [
            pr.id,
            projectId,
            repoName,
            pr.number,
            pr.title,
            pr.state,
            labels,
            pr.body ?? null,
            pr.head?.ref ?? null,
            pr.base?.ref ?? null,
            pr.created_at,
            pr.closed_at ?? null,
            pr.merged_at ?? null,
          ]
        );
      }
    }

    return null;
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
