import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

interface TotalsRow {
  classification: string | null;
  cnt: string;
}

interface DayRow {
  day: string;
  classification: string | null;
  cnt: string;
}

interface RepoRow {
  repo: string | null;
  classification: string | null;
  cnt: string;
}

interface TotalCountRow {
  total: string;
  classified: string;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = getProjectScopeFromSession(session);

  // Run all 4 queries in parallel, all respect RLS via scope
  const [totalsRows, dayRows, repoRows, countRow] = await Promise.all([
    // 1. Overall totals per classification (including null = unclassified)
    query<TotalsRow>(
      `SELECT classification, COUNT(*)::TEXT AS cnt
       FROM github_webhook_events
       GROUP BY classification`,
      [],
      scope
    ),

    // 2. Last 7 days trend — only classified events
    query<DayRow>(
      `SELECT date_trunc('day', received_at)::DATE::TEXT AS day,
              classification,
              COUNT(*)::TEXT AS cnt
       FROM github_webhook_events
       WHERE received_at >= NOW() - INTERVAL '7 days'
         AND classification IS NOT NULL
       GROUP BY 1, 2
       ORDER BY 1 ASC`,
      [],
      scope
    ),

    // 3. Top repos by classification — only classified events
    query<RepoRow>(
      `SELECT repo, classification, COUNT(*)::TEXT AS cnt
       FROM github_webhook_events
       WHERE classification IS NOT NULL
         AND repo IS NOT NULL
       GROUP BY repo, classification
       ORDER BY COUNT(*) DESC`,
      [],
      scope
    ),

    // 4. Total + classified count for percentage
    queryOne<TotalCountRow>(
      `SELECT COUNT(*)::TEXT AS total,
              COUNT(classification)::TEXT AS classified
       FROM github_webhook_events`,
      [],
      scope
    ),
  ]);

  // --- Build totals ---
  const totals = { trivial_fix: 0, needs_human: 0, noise: 0, unclassified: 0 };
  for (const row of totalsRows) {
    const cnt = parseInt(row.cnt, 10);
    if (row.classification === 'trivial_fix') totals.trivial_fix += cnt;
    else if (row.classification === 'needs_human') totals.needs_human += cnt;
    else if (row.classification === 'noise') totals.noise += cnt;
    else totals.unclassified += cnt;
  }

  // --- Build last_7_days ---
  // Collect all unique days in range
  const dayMap = new Map<string, { trivial_fix: number; needs_human: number; noise: number }>();
  for (const row of dayRows) {
    if (!dayMap.has(row.day)) {
      dayMap.set(row.day, { trivial_fix: 0, needs_human: 0, noise: 0 });
    }
    const entry = dayMap.get(row.day)!;
    const cnt = parseInt(row.cnt, 10);
    if (row.classification === 'trivial_fix') entry.trivial_fix += cnt;
    else if (row.classification === 'needs_human') entry.needs_human += cnt;
    else if (row.classification === 'noise') entry.noise += cnt;
  }
  const last_7_days = Array.from(dayMap.entries())
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // --- Build top_repos ---
  // Aggregate per repo across classifications, pick top 10
  const repoMap = new Map<string, { trivial_fix: number; needs_human: number; noise: number }>();
  for (const row of repoRows) {
    const repo = row.repo ?? '(unknown)';
    if (!repoMap.has(repo)) {
      repoMap.set(repo, { trivial_fix: 0, needs_human: 0, noise: 0 });
    }
    const entry = repoMap.get(repo)!;
    const cnt = parseInt(row.cnt, 10);
    if (row.classification === 'trivial_fix') entry.trivial_fix += cnt;
    else if (row.classification === 'needs_human') entry.needs_human += cnt;
    else if (row.classification === 'noise') entry.noise += cnt;
  }
  const top_repos = Array.from(repoMap.entries())
    .map(([repo, counts]) => ({ repo, ...counts }))
    .sort(
      (a, b) =>
        b.trivial_fix + b.needs_human + b.noise -
        (a.trivial_fix + a.needs_human + a.noise)
    )
    .slice(0, 10);

  // --- classified_pct ---
  const total = parseInt(countRow?.total ?? '0', 10);
  const classified = parseInt(countRow?.classified ?? '0', 10);
  const classified_pct = total === 0 ? 0 : Math.round((classified / total) * 10000) / 100;

  return NextResponse.json({
    totals,
    last_7_days,
    top_repos,
    classified_pct,
  });
}
