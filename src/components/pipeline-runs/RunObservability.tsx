'use client';

/**
 * RunObservability — PRD-042 Phase 3 §16 MC-C UI dashboard MVP.
 *
 * Drill-down per-run cards consumindo `pipeline_runs.run_health` (jsonb) +
 * `pipeline_runs.sprint_work` (jsonb) — populadas por wingx-platform
 * close-sprint step 7 emit_telemetry consolidator (PRD-042 D42.11).
 *
 * Cards:
 *   1. Step Durations — BarChart per stepId.duration_ms
 *   2. Agent Metrics — table response_time + tokens + invocation_count
 *   3. Retries + Hard Fails — counters + list
 *   4. Sprint Work — close-sprint only, conditional render
 *
 * Fail-soft: empty-state graceful pra runs antigas sem observability data.
 *
 * MVP scope; aggregate observability page (trend across runs, heatmap,
 * box plot, treemap) defer pra MC-C v2 (próxima sessão).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Activity,
  Clock,
  AlertTriangle,
  Repeat,
  Bot,
  GitCommit,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror wingx-platform/lib/run-health-collector.ts:RunHealth
//        + lib/mc-telemetry.ts:SprintWork
// ─────────────────────────────────────────────────────────────────────────────

interface StepMetric {
  duration_ms: number;
  status: 'success' | 'failed';
  error?: string;
}

interface AgentMetric {
  response_time_ms: number;
  tokens: number;
  cost_usd: number;
  invocation_count: number;
}

interface HardFail {
  node: string;
  reason: string;
  ts: string;
}

interface RunHealth {
  steps: Record<string, StepMetric>;
  agents: Record<string, AgentMetric>;
  retries: Record<string, number>;
  hard_fails: HardFail[];
}

interface SprintWork {
  commit_count?: number;
  lines_added?: number;
  lines_deleted?: number;
  files_touched?: number;
  commit_type_breakdown?: Record<string, number>;
  repos_scanned?: string[];
  envelope_decision?: {
    since_ref_resolved?: string | null;
    since_ref_source?: string;
    max_commits_envelope?: number | null;
    prds_active_count?: number;
  };
  docs_updated_per_code_ratio?: number | null;
  prd_concentration?: Record<string, number>;
}

interface RunDetailResponse {
  run: {
    run_type?: string;
    run_health?: RunHealth | null;
    sprint_work?: SprintWork | null;
  } | null;
}

interface RunObservabilityProps {
  runId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  return `${m.toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RunObservability({ runId }: RunObservabilityProps) {
  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pipeline-runs/${runId}`)
      .then((r) => r.json())
      .then((d: RunDetailResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (loading) return null;
  if (!data?.run) return null;

  const runHealth = data.run.run_health ?? null;
  const sprintWork = data.run.sprint_work ?? null;

  // Fail-soft: hide entire section when no observability data.
  if (!runHealth && !sprintWork) return null;

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-[var(--info)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Observability
        </h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {runHealth && <StepDurationsCard runHealth={runHealth} />}
        {runHealth && <AgentMetricsCard runHealth={runHealth} />}
        {runHealth && <RetriesHardFailsCard runHealth={runHealth} />}
        {sprintWork && <SprintWorkCard sprintWork={sprintWork} />}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card: Step Durations (BarChart)
// ─────────────────────────────────────────────────────────────────────────────

function StepDurationsCard({ runHealth }: { runHealth: RunHealth }) {
  const data = useMemo(() => {
    return Object.entries(runHealth.steps)
      .map(([name, m]) => ({
        name,
        duration: m.duration_ms,
        status: m.status,
      }))
      .sort((a, b) => b.duration - a.duration);
  }, [runHealth]);

  const totalMs = data.reduce((sum, d) => sum + d.duration, 0);

  if (data.length === 0) {
    return <CardEmpty title="Step Durations" icon={<Clock className="h-4 w-4" />} message="No step metrics recorded." />;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--info)]" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Step Durations</h3>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          Total: {formatMs(totalMs)}
        </span>
      </header>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <XAxis type="number" tickFormatter={formatMs} stroke="var(--text-muted)" fontSize={11} />
            <YAxis type="category" dataKey="name" width={130} stroke="var(--text-muted)" fontSize={11} />
            <Tooltip
              formatter={(v) => (typeof v === 'number' ? formatMs(v) : '—')}
              contentStyle={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.status === 'success' ? 'var(--success, #10b981)' : 'var(--error, #ef4444)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card: Agent Metrics (table)
// ─────────────────────────────────────────────────────────────────────────────

function AgentMetricsCard({ runHealth }: { runHealth: RunHealth }) {
  const rows = useMemo(() => {
    return Object.entries(runHealth.agents)
      .map(([name, m]) => ({ name, ...m }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [runHealth]);

  if (rows.length === 0) {
    return <CardEmpty title="Agent Metrics" icon={<Bot className="h-4 w-4" />} message="No agent invocations recorded." />;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <header className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 text-[var(--accent,#a78bfa)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Agent Metrics</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="pb-2 pr-3 font-medium">Agent</th>
              <th className="pb-2 pr-3 font-medium text-right">Time</th>
              <th className="pb-2 pr-3 font-medium text-right">Tokens</th>
              <th className="pb-2 font-medium text-right">Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2 pr-3 font-mono text-[var(--text-primary)]">{r.name}</td>
                <td className="py-2 pr-3 text-right text-[var(--text-secondary)]">{formatMs(r.response_time_ms)}</td>
                <td className="py-2 pr-3 text-right text-[var(--text-secondary)]">{formatTokens(r.tokens)}</td>
                <td className="py-2 text-right text-[var(--text-secondary)]">{r.invocation_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card: Retries + Hard Fails
// ─────────────────────────────────────────────────────────────────────────────

function RetriesHardFailsCard({ runHealth }: { runHealth: RunHealth }) {
  const totalRetries = Object.values(runHealth.retries).reduce((s, n) => s + n, 0);
  const failCount = runHealth.hard_fails.length;
  const retryEntries = Object.entries(runHealth.retries);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <header className="mb-3 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-[var(--warning,#f59e0b)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Retries & Hard Fails</h3>
      </header>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Counter label="Retries" value={totalRetries} accent="text-[var(--warning,#f59e0b)]" />
        <Counter label="Hard Fails" value={failCount} accent="text-[var(--error,#ef4444)]" />
      </div>
      {retryEntries.length > 0 && (
        <div className="text-xs space-y-1 mb-3">
          <div className="text-[var(--text-muted)] font-medium">Per step:</div>
          {retryEntries.map(([step, n]) => (
            <div key={step} className="flex justify-between font-mono">
              <span className="text-[var(--text-secondary)]">{step}</span>
              <span className="text-[var(--warning,#f59e0b)]">×{n}</span>
            </div>
          ))}
        </div>
      )}
      {runHealth.hard_fails.length > 0 && (
        <div className="text-xs space-y-1">
          <div className="text-[var(--text-muted)] font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Failures:
          </div>
          {runHealth.hard_fails.slice(0, 5).map((f, i) => (
            <div key={i} className="font-mono">
              <div className="text-[var(--error,#ef4444)]">{f.node}</div>
              <div className="text-[var(--text-secondary)] truncate">{f.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card: Sprint Work (close-sprint only)
// ─────────────────────────────────────────────────────────────────────────────

function SprintWorkCard({ sprintWork }: { sprintWork: SprintWork }) {
  const linesNet =
    (sprintWork.lines_added ?? 0) - (sprintWork.lines_deleted ?? 0);
  const repos = sprintWork.repos_scanned ?? [];
  const envDecision = sprintWork.envelope_decision;
  const prdConc = Object.entries(sprintWork.prd_concentration ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const commitTypes = Object.entries(sprintWork.commit_type_breakdown ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 lg:col-span-2">
      <header className="mb-3 flex items-center gap-2">
        <GitCommit className="h-4 w-4 text-[var(--success,#10b981)]" />
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Sprint Work</h3>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Counter label="Commits" value={sprintWork.commit_count ?? 0} accent="text-[var(--info)]" />
        <Counter label="Files" value={sprintWork.files_touched ?? 0} accent="text-[var(--accent,#a78bfa)]" />
        <Counter
          label="Lines Δ"
          value={linesNet}
          accent={linesNet >= 0 ? 'text-[var(--success,#10b981)]' : 'text-[var(--error,#ef4444)]'}
          prefix={linesNet >= 0 ? '+' : ''}
        />
        <Counter label="Repos" value={repos.length} accent="text-[var(--text-secondary)]" />
      </div>

      {envDecision && (
        <div className="mb-3 p-3 rounded bg-[var(--surface-2)] text-xs space-y-1">
          <div className="text-[var(--text-muted)] font-medium">Envelope Decision</div>
          <div className="font-mono flex justify-between">
            <span className="text-[var(--text-secondary)]">since_ref_source</span>
            <span className="text-[var(--text-primary)]">{envDecision.since_ref_source ?? '—'}</span>
          </div>
          <div className="font-mono flex justify-between">
            <span className="text-[var(--text-secondary)]">commits_max</span>
            <span className="text-[var(--text-primary)]">{envDecision.max_commits_envelope ?? '—'}</span>
          </div>
          <div className="font-mono flex justify-between">
            <span className="text-[var(--text-secondary)]">prds_active</span>
            <span className="text-[var(--text-primary)]">{envDecision.prds_active_count ?? '—'}</span>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {commitTypes.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="text-[var(--text-muted)] font-medium">Commit Types</div>
            {commitTypes.map(([t, n]) => (
              <div key={t} className="flex justify-between font-mono">
                <span className="text-[var(--text-secondary)]">{t}</span>
                <span className="text-[var(--text-primary)]">{n}</span>
              </div>
            ))}
          </div>
        )}
        {prdConc.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="text-[var(--text-muted)] font-medium">PRD Concentration</div>
            {prdConc.map(([p, n]) => (
              <div key={p} className="flex justify-between font-mono">
                <span className="text-[var(--text-secondary)]">{p}</span>
                <span className="text-[var(--text-primary)]">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sprintWork.docs_updated_per_code_ratio !== undefined &&
        sprintWork.docs_updated_per_code_ratio !== null && (
          <div className="mt-3 text-xs flex justify-between p-2 rounded bg-[var(--surface-2)]">
            <span className="text-[var(--text-muted)]">docs / code ratio</span>
            <span className="font-mono text-[var(--text-primary)]">
              {(sprintWork.docs_updated_per_code_ratio * 100).toFixed(1)}%
            </span>
          </div>
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  accent,
  prefix = '',
}: {
  label: string;
  value: number;
  accent: string;
  prefix?: string;
}) {
  return (
    <div className="text-center p-2 rounded bg-[var(--surface-2)]">
      <div className={`text-xl font-semibold ${accent}`}>
        {prefix}
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mt-1">
        {label}
      </div>
    </div>
  );
}

function CardEmpty({
  title,
  icon,
  message,
}: {
  title: string;
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <header className="mb-2 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      </header>
      <p className="text-xs text-[var(--text-muted)] italic">{message}</p>
    </div>
  );
}
