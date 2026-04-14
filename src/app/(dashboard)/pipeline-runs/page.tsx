'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Workflow, Search, RefreshCw } from 'lucide-react';
import { RunStatusBadge } from '@/components/pipeline-runs/RunStatusBadge';

interface RunListRow {
  id: string;
  run_type: string;
  status: string;
  title: string | null;
  sprint_number: number | null;
  prd_id: string | null;
  epic_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_tokens: number | null;
  estimated_cost_usd: string | null;
  triggered_by: string | null;
  last_heartbeat_at: string | null;
  step_count: string | number;
  steps_done: string | number;
  current_step: string | null;
}

interface ListResponse {
  runs: RunListRow[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    prd_ids: Array<{ prd_id: string; count: string }>;
    run_types: Array<{ run_type: string; count: string }>;
    statuses: Array<{ status: string; count: string }>;
    sprints: Array<{ sprint_number: number; count: string }>;
  };
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${String(rs).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${String(rm).padStart(2, '0')}m`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function formatTokens(n: number | null): string {
  if (!n) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export default function PipelineRunsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [prdFilter, setPrdFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (prdFilter) params.set('prd', prdFilter);
      if (typeFilter) params.set('run_type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('limit', '30');
      const res = await fetch(`/api/pipeline-runs?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [prdFilter, typeFilter, statusFilter, search]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Auto-refresh every 5s if there's a running run in the list
  const hasRunning = useMemo(
    () => data?.runs.some(r => r.status === 'running') ?? false,
    [data]
  );
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(fetchList, 5000);
    return () => clearInterval(t);
  }, [hasRunning, fetchList]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-[var(--brand)]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Pipeline Runs</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Execuções do harness em tempo real — sprint-close, tasks, fixes e spikes
          </p>
        </div>
        <button
          onClick={fetchList}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, PRD, epic..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--brand)]/50"
          />
        </div>
        <select
          value={prdFilter}
          onChange={e => setPrdFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]/50"
        >
          <option value="">All PRDs</option>
          {data?.facets.prd_ids.map(f => (
            <option key={f.prd_id} value={f.prd_id}>
              {f.prd_id} ({f.count})
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]/50"
        >
          <option value="">All types</option>
          {data?.facets.run_types.map(f => (
            <option key={f.run_type} value={f.run_type}>
              {f.run_type} ({f.count})
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]/50"
        >
          <option value="">All statuses</option>
          {data?.facets.statuses.map(f => (
            <option key={f.status} value={f.status}>
              {f.status} ({f.count})
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin" />
        </div>
      )}

      {data && data.runs.length === 0 && (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-10 text-center">
          <Workflow className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-primary)] font-semibold">No pipeline runs yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Runs show up here as soon as the harness starts tracking sprint-close, task, fix, bug or spike.
          </p>
        </div>
      )}

      {data && data.runs.length > 0 && (
        <div className="space-y-2">
          {data.runs.map(run => {
            const cost = parseFloat(run.estimated_cost_usd ?? '0') || 0;
            const stepCount = Number(run.step_count);
            const stepsDone = Number(run.steps_done);
            const isRunning = run.status === 'running';
            const pct = stepCount > 0 ? Math.round((stepsDone / stepCount) * 100) : 0;

            return (
              <Link
                key={run.id}
                href={`/pipeline-runs/${run.id}`}
                className={`block rounded-lg border p-4 transition-all hover:shadow-md ${
                  isRunning
                    ? 'bg-[var(--info-muted)]/30 border-[var(--info)]/40 shadow-[0_0_0_1px_var(--info-muted)]'
                    : run.status === 'failed'
                    ? 'bg-[var(--bg-surface)] border-[var(--destructive)]/30'
                    : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--border-default,var(--border))]'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RunStatusBadge status={run.status} />
                      <span className="text-xs text-[var(--text-muted)] font-mono">{run.run_type}</span>
                      {run.sprint_number && (
                        <span className="text-xs text-[var(--text-muted)]">· Sprint {run.sprint_number}</span>
                      )}
                      {run.prd_id && (
                        <span className="text-xs text-[var(--text-muted)]">· {run.prd_id}{run.epic_id && ` ${run.epic_id}`}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1 truncate">
                      {run.title ?? run.id}
                    </p>
                    {isRunning && run.current_step && (
                      <p className="text-xs text-[var(--info)] mt-0.5">▶ {run.current_step}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-[var(--text-muted)] flex-shrink-0">
                    <p className="font-mono">{formatDuration(run.duration_ms)}</p>
                    <p>{formatRelative(run.started_at)}</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--text-muted)] font-mono flex-wrap">
                  <span>
                    {stepsDone}/{stepCount} steps
                  </span>
                  <span>·</span>
                  <span>{formatTokens(run.total_tokens)} tok</span>
                  <span>·</span>
                  <span>${cost.toFixed(4)}</span>
                  {run.triggered_by && (
                    <>
                      <span>·</span>
                      <span>{run.triggered_by}</span>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                {stepCount > 0 && (
                  <div className="mt-3 h-1 rounded-full bg-[var(--bg-muted)] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        run.status === 'failed'
                          ? 'bg-[var(--destructive)]'
                          : isRunning
                          ? 'bg-[var(--info)]'
                          : 'bg-[var(--success,#10b981)]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </Link>
            );
          })}

          {data.total > data.runs.length && (
            <p className="text-center text-xs text-[var(--text-muted)] pt-3">
              Showing {data.runs.length} of {data.total} runs
            </p>
          )}
        </div>
      )}
    </div>
  );
}
