'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart2, DollarSign, Zap, Database } from 'lucide-react';
import FilterBar from './FilterBar';
import SprintEvolutionChart from './SprintEvolutionChart';
import CacheHitChart from './CacheHitChart';
import CostVsHoursChart from './CostVsHoursChart';
import AgentPerformanceTable from './AgentPerformanceTable';
import LLMRecommendationsPanel from './LLMRecommendationsPanel';

interface Summary {
  total_sessions: number;
  total_cost: number;
  avg_cache_hit: number;
  total_tokens: number;
}

interface DashboardData {
  summary: Summary;
  tokensBySprint: Array<{ sprint_number: number; total_input: number; total_output: number; cache_creation: number; cache_read: number; total: number }>;
  cacheHitBySprint: Array<{ sprint_number: number; avg_cache_hit: number }>;
  costVsHours: Array<{ sprint_number: number; cost_usd: number; duration_hours: number }>;
  recommendations: Array<{ id: number; agent_name: string; current_model: string; recommended: string; reason: string; sprint_number: number }>;
}

interface AgentRow {
  agent_name: string;
  model: string;
  sessions: number;
  avg_tool_calls: number;
  avg_context_pct: number;
  avg_rating: number;
  total_cost: number;
}

const STAT_CARDS = [
  { key: 'total_sessions', label: 'Sprints', icon: BarChart2, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', format: (v: number) => String(v ?? 0) },
  { key: 'total_cost', label: 'Custo Total', icon: DollarSign, color: 'text-[var(--brand)]', bg: 'bg-[var(--brand)]/10', format: (v: number) => `$${(v ?? 0).toFixed(2)}` },
  { key: 'avg_cache_hit', label: 'Cache Hit %', icon: Zap, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-muted)]', format: (v: number) => `${(v ?? 0).toFixed(1)}%` },
  { key: 'total_tokens', label: 'Total Tokens', icon: Database, color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--bg-muted)]', format: (v: number) => {
    if (!v) return '0';
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(v);
  }},
];

export default function AnalyticsPage() {
  const [project, setProject] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = project ? `?project=${encodeURIComponent(project)}` : '';
      const [dashRes, agentsRes] = await Promise.all([
        fetch(`/api/analytics/dashboard${qs}`),
        fetch(`/api/analytics/agents${qs}`),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const projects = dashboard?.tokensBySprint
    ? [...new Set(dashboard.tokensBySprint.map(() => project).filter(Boolean))]
    : [];

  // Derive available projects from sessions list
  const [allProjects, setAllProjects] = useState<string[]>(['paraguai']);
  useEffect(() => {
    fetch('/api/analytics/sessions?limit=100')
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ project: string }>) => {
        const unique = [...new Set(rows.map(r => r.project).filter(Boolean))];
        if (unique.length > 0) setAllProjects(unique);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Sprint Analytics</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Performance, custo e eficiência por sprint</p>
        </div>
        <FilterBar project={project} projects={allProjects} onProjectChange={setProject} />
      </div>

      {/* Loading state */}
      {loading && !dashboard && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin" />
        </div>
      )}

      {dashboard && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4">
            {STAT_CARDS.map(card => {
              const val = dashboard.summary?.[card.key as keyof Summary] ?? 0;
              const Icon = card.icon;
              return (
                <div key={card.key} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                      <Icon className={`h-4.5 w-4.5 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
                      <p className={`text-lg font-bold ${card.color}`}>{card.format(val as number)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-2 gap-4">
            <SprintEvolutionChart data={dashboard.tokensBySprint} />
            <CacheHitChart data={dashboard.cacheHitBySprint} />
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-2 gap-4">
            <CostVsHoursChart data={dashboard.costVsHours} />
            <LLMRecommendationsPanel data={dashboard.recommendations} onApplied={fetchData} />
          </div>

          {/* Agent table */}
          <AgentPerformanceTable data={agents} />
        </>
      )}
    </div>
  );
}
