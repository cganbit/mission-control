'use client';

/**
 * Pipeline Runs — Observability Aggregate Page (MC-C v2).
 *
 * PRD-042 Phase 3 §16 — agregação cross-run das colunas jsonb
 * `pipeline_runs.run_health` + `pipeline_runs.sprint_work`. Drill-down
 * per-run continua em /pipeline-runs/[id] via RunObservability component.
 *
 * Cards (MC-C v2):
 *   1. Steps Trend           — LineChart total step durations per run over time
 *   2. Agent Tokens Trend    — multi-line per agent across last N runs
 *   3. Cost Box              — Bar com min/median/max per run (proxy box plot)
 *   4. PRD Concentration     — Treemap aggregated across runs
 *   5. Commit Type Donut     — PieChart aggregated commit_type_breakdown
 *   6. Boundary Integrity    — PieChart since_ref_source distribution (% chain steps)
 *
 * Fail-soft: empty-state graceful quando 0 runs com observability data.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Treemap,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror RunObservability component
// ─────────────────────────────────────────────────────────────────────────────

interface AgentMetric {
  response_time_ms: number;
  tokens: number;
  cost_usd: number;
  invocation_count: number;
}

interface StepMetric {
  duration_ms: number;
  status: 'success' | 'failed';
}

interface RunHealth {
  steps: Record<string, StepMetric>;
  agents: Record<string, AgentMetric>;
  retries: Record<string, number>;
  hard_fails: unknown[];
}

interface SprintWork {
  commit_count?: number;
  lines_added?: number;
  lines_deleted?: number;
  files_touched?: number;
  commit_type_breakdown?: Record<string, number>;
  envelope_decision?: {
    since_ref_source?: string;
  };
  prd_concentration?: Record<string, number>;
}

interface RunRow {
  id: string;
  run_type: string;
  started_at: string;
  estimated_cost_usd: string | null;
  total_tokens: number | null;
  prd_id: string | null;
  run_health?: RunHealth | null;
  sprint_work?: SprintWork | null;
}

interface ListResponse {
  runs: RunRow[];
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE = [
  '#10b981', // green
  '#3b82f6', // blue
  '#a78bfa', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PipelineRunsObservabilityPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pipeline-runs?include_observability=1&limit=30')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ListResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/pipeline-runs"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Pipeline Runs
        </Link>
      </div>

      <header className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-[var(--info)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Observability — Aggregate
        </h1>
        {data && (
          <span className="ml-2 text-xs text-[var(--text-muted)]">
            ({data.runs.length} runs com observability data)
          </span>
        )}
      </header>

      {loading && (
        <div className="text-sm text-[var(--text-muted)]">Loading...</div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--error,#ef4444)] bg-[var(--surface-1)] p-4 text-sm text-[var(--error,#ef4444)]">
          Error: {error}
        </div>
      )}

      {data && data.runs.length === 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-sm text-[var(--text-muted)]">
          Nenhum run com observability data ainda. Roda <code>wingx close-sprint &lt;slug&gt;</code> pra
          gerar — step 7 emit_telemetry consolida run_health + sprint_work pro MC.
        </div>
      )}

      {data && data.runs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StepsTrendCard runs={data.runs} />
          <AgentTokensTrendCard runs={data.runs} />
          <CostBoxCard runs={data.runs} />
          <PrdConcentrationTreemapCard runs={data.runs} />
          <CommitTypeDonutCard runs={data.runs} />
          <BoundaryIntegrityPizzaCard runs={data.runs} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 1: Steps Trend (LineChart)
// ─────────────────────────────────────────────────────────────────────────────

function StepsTrendCard({ runs }: { runs: RunRow[] }) {
  const data = useMemo(() => {
    return [...runs]
      .filter((r) => r.run_health)
      .reverse() // chronological asc for line trend
      .map((r) => {
        const totalMs = Object.values(r.run_health!.steps).reduce(
          (s, m) => s + m.duration_ms,
          0,
        );
        return {
          date: shortDate(r.started_at),
          total: totalMs,
          steps: Object.keys(r.run_health!.steps).length,
        };
      });
  }, [runs]);

  return (
    <CardWrapper title="Steps Total Duration Trend" subtitle={`${data.length} runs`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
          <YAxis tickFormatter={formatMs} stroke="var(--text-muted)" fontSize={11} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? formatMs(v) : '—')}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="var(--info, #3b82f6)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 2: Agent Tokens Trend (multi-line)
// ─────────────────────────────────────────────────────────────────────────────

function AgentTokensTrendCard({ runs }: { runs: RunRow[] }) {
  const { data, agents } = useMemo(() => {
    const agentSet = new Set<string>();
    const points = [...runs]
      .filter((r) => r.run_health)
      .reverse()
      .map((r) => {
        const point: Record<string, string | number> = {
          date: shortDate(r.started_at),
        };
        for (const [name, m] of Object.entries(r.run_health!.agents)) {
          point[name] = m.tokens;
          agentSet.add(name);
        }
        return point;
      });
    return { data: points, agents: Array.from(agentSet).slice(0, 8) };
  }, [runs]);

  return (
    <CardWrapper title="Agent Tokens Trend" subtitle={`${agents.length} agents`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
          <YAxis tickFormatter={formatTokens} stroke="var(--text-muted)" fontSize={11} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? formatTokens(v) : '—')}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          {agents.map((a, i) => (
            <Line
              key={a}
              type="monotone"
              dataKey={a}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={1.5}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 3: Cost Box (proxy via Bar com min/median/max)
// ─────────────────────────────────────────────────────────────────────────────

function CostBoxCard({ runs }: { runs: RunRow[] }) {
  const data = useMemo(() => {
    return [...runs]
      .reverse()
      .map((r) => ({
        date: shortDate(r.started_at),
        cost: r.estimated_cost_usd ? parseFloat(r.estimated_cost_usd) : 0,
      }))
      .filter((d) => d.cost > 0);
  }, [runs]);

  if (data.length === 0) {
    return (
      <CardWrapper title="Run Cost Trend" subtitle="">
        <div className="text-xs text-[var(--text-muted)] italic py-8 text-center">
          No cost data — runs need estimated_cost_usd populated.
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper title="Run Cost Trend" subtitle={`${data.length} runs com cost > 0`}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
          <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? `$${v.toFixed(4)}` : '—')}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="cost" fill="var(--accent, #a78bfa)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 4: PRD Concentration Treemap
// ─────────────────────────────────────────────────────────────────────────────

function PrdConcentrationTreemapCard({ runs }: { runs: RunRow[] }) {
  const data = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of runs) {
      const conc = r.sprint_work?.prd_concentration ?? {};
      for (const [prd, n] of Object.entries(conc)) {
        agg[prd] = (agg[prd] ?? 0) + n;
      }
    }
    return Object.entries(agg)
      .map(([name, size], i) => ({
        name,
        size,
        fill: PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
  }, [runs]);

  if (data.length === 0) {
    return (
      <CardWrapper title="PRD Concentration" subtitle="">
        <div className="text-xs text-[var(--text-muted)] italic py-8 text-center">
          No PRD concentration data (close-sprint runs only).
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper title="PRD Concentration (Treemap)" subtitle={`${data.length} PRDs`}>
      <ResponsiveContainer width="100%" height={220}>
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          stroke="var(--surface-2)"
          fill="var(--info)"
          aspectRatio={4 / 3}
        />
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 5: Commit Type Donut (PieChart inner radius)
// ─────────────────────────────────────────────────────────────────────────────

function CommitTypeDonutCard({ runs }: { runs: RunRow[] }) {
  const data = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of runs) {
      const breakdown = r.sprint_work?.commit_type_breakdown ?? {};
      for (const [t, n] of Object.entries(breakdown)) {
        agg[t] = (agg[t] ?? 0) + n;
      }
    }
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [runs]);

  if (data.length === 0) {
    return (
      <CardWrapper title="Commit Type Breakdown" subtitle="">
        <div className="text-xs text-[var(--text-muted)] italic py-8 text-center">
          No commit type data (close-sprint runs only).
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper title="Commit Type (Donut)" subtitle={`${data.length} types`}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card 6: Boundary Integrity Pizza (since_ref_source distribution)
// ─────────────────────────────────────────────────────────────────────────────

function BoundaryIntegrityPizzaCard({ runs }: { runs: RunRow[] }) {
  const data = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of runs) {
      const src = r.sprint_work?.envelope_decision?.since_ref_source;
      if (src) agg[src] = (agg[src] ?? 0) + 1;
    }
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [runs]);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <CardWrapper title="Boundary Integrity" subtitle="">
        <div className="text-xs text-[var(--text-muted)] italic py-8 text-center">
          No boundary data (close-sprint runs only — since_ref chain).
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper title="Boundary Integrity" subtitle={`${total} close-sprint runs`}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Tooltip
            formatter={(v, name) => {
              if (typeof v !== 'number') return ['—', String(name ?? '')];
              return [`${v} (${((v / total) * 100).toFixed(0)}%)`, String(name ?? '')];
            }}
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={85}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {data.map((d, i) => {
              // Color hint: explicit/sprint_tag = green (high confidence)
              //             last_close_sprint_commit = blue (medium)
              //             24h_fallback = amber (low)
              let fill: string = PALETTE[i % PALETTE.length];
              if (d.name === 'explicit' || d.name === 'sprint_tag') fill = '#10b981';
              else if (d.name === 'last_close_sprint_commit') fill = '#3b82f6';
              else if (d.name?.includes('24h_fallback')) fill = '#f59e0b';
              return <Cell key={i} fill={fill} />;
            })}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

function CardWrapper({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
        {subtitle && (
          <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
        )}
      </header>
      {children}
    </div>
  );
}
