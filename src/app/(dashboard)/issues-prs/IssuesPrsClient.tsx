'use client';

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Search, RefreshCw, X, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { StatusTone } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';

// ----- Types -----

interface GithubEvent {
  id: string;
  repo: string;
  event_type: string;
  action: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  github_url: string | null;
}

interface GithubIssue {
  id: string;
  repo: string;
  github_number: number;
  title: string;
  state: string;
  author: string | null;
  github_url: string | null;
  updated_at: string;
}

interface GithubPr {
  id: string;
  repo: string;
  github_number: number;
  title: string;
  state: string;
  author: string | null;
  github_url: string | null;
  updated_at: string;
  merged_at: string | null;
}

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

type Tab = 'events' | 'issues' | 'prs';

// ----- Helpers -----

const PAGE_SIZE = 25;

function stateTone(state: string): StatusTone {
  switch (state.toLowerCase()) {
    case 'open': return 'info';
    case 'closed': return 'neutral';
    case 'merged': return 'success';
    default: return 'neutral';
  }
}

function eventTypeTone(type: string): StatusTone {
  if (type.includes('push') || type.includes('create')) return 'info';
  if (type.includes('delete') || type.includes('error')) return 'failed';
  if (type.includes('release')) return 'success';
  return 'neutral';
}

// ----- Modal -----

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ onClose, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ----- Event detail -----

function EventDetail({ event, onClose }: { event: GithubEvent; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge label={event.event_type} tone={eventTypeTone(event.event_type)} />
          {event.action && (
            <StatusBadge label={event.action} tone="neutral" />
          )}
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)] font-mono mb-1">{event.repo}</p>
          <p className="text-xs text-[var(--text-muted)]">{formatDate(event.created_at)}</p>
        </div>
        {event.github_url && (
          <a
            href={event.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--brand)] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open on GitHub
          </a>
        )}
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-1 font-semibold uppercase tracking-wider">Payload</p>
          <pre className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      </div>
    </Modal>
  );
}

// ----- Issue/PR detail -----

function IssueOrPrDetail({ item, onClose }: { item: GithubIssue | GithubPr; onClose: () => void }) {
  const pr = 'merged_at' in item ? item as GithubPr : null;
  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge label={item.state} tone={stateTone(item.state)} />
          <span className="text-xs text-[var(--text-muted)] font-mono">#{item.github_number}</span>
        </div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
        <div className="space-y-1 text-xs text-[var(--text-muted)]">
          <p><span className="text-[var(--text-secondary)]">Repo:</span> {item.repo}</p>
          {item.author && <p><span className="text-[var(--text-secondary)]">Author:</span> {item.author}</p>}
          <p><span className="text-[var(--text-secondary)]">Updated:</span> {formatDate(item.updated_at)}</p>
          {pr?.merged_at && (
            <p><span className="text-[var(--text-secondary)]">Merged:</span> {formatDate(pr.merged_at)}</p>
          )}
        </div>
        {item.github_url && (
          <a
            href={item.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--brand)] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open on GitHub
          </a>
        )}
      </div>
    </Modal>
  );
}

// ----- Pagination -----

function Pagination({
  page, total, limit, onPrev, onNext,
}: {
  page: number; total: number; limit: number;
  onPrev: () => void; onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between pt-3 text-xs text-[var(--text-muted)]">
      <span>Page {page} of {totalPages} · {total} total</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ----- Main component -----

export function IssuesPrsClient() {
  const [activeTab, setActiveTab] = useState<Tab>('events');

  // Filters
  const [repoFilter, setRepoFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  // Pages per tab
  const [eventsPage, setEventsPage] = useState(1);
  const [issuesPage, setIssuesPage] = useState(1);
  const [prsPage, setPrsPage] = useState(1);

  // Data per tab
  const [eventsData, setEventsData] = useState<PagedResponse<GithubEvent> | null>(null);
  const [issuesData, setIssuesData] = useState<PagedResponse<GithubIssue> | null>(null);
  const [prsData, setPrsData] = useState<PagedResponse<GithubPr> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<GithubEvent | null>(null);
  const [selectedIssueOrPr, setSelectedIssueOrPr] = useState<GithubIssue | GithubPr | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (repoFilter) params.set('repo', repoFilter);
      if (eventTypeFilter) params.set('event_type', eventTypeFilter);
      params.set('page', String(eventsPage));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`/api/github/events?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEventsData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [repoFilter, eventTypeFilter, eventsPage]);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (repoFilter) params.set('repo', repoFilter);
      if (stateFilter) params.set('state', stateFilter);
      params.set('page', String(issuesPage));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`/api/github/issues?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIssuesData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [repoFilter, stateFilter, issuesPage]);

  const fetchPrs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (repoFilter) params.set('repo', repoFilter);
      if (stateFilter) params.set('state', stateFilter);
      params.set('page', String(prsPage));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`/api/github/prs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrsData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load PRs');
    } finally {
      setLoading(false);
    }
  }, [repoFilter, stateFilter, prsPage]);

  useEffect(() => {
    if (activeTab === 'events') fetchEvents();
  }, [activeTab, fetchEvents]);

  useEffect(() => {
    if (activeTab === 'issues') fetchIssues();
  }, [activeTab, fetchIssues]);

  useEffect(() => {
    if (activeTab === 'prs') fetchPrs();
  }, [activeTab, fetchPrs]);

  function handleRefresh() {
    if (activeTab === 'events') fetchEvents();
    else if (activeTab === 'issues') fetchIssues();
    else fetchPrs();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'issues', label: 'Issues' },
    { key: 'prs', label: 'Pull Requests' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[var(--brand)]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">GitHub Activity</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Webhook events, issues and pull requests received via PRD-040
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-[var(--brand)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={repoFilter}
            onChange={e => { setRepoFilter(e.target.value); setEventsPage(1); setIssuesPage(1); setPrsPage(1); }}
            placeholder="Filter by repo..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--brand)]/50"
          />
        </div>
        {activeTab === 'events' && (
          <select
            value={eventTypeFilter}
            onChange={e => { setEventTypeFilter(e.target.value); setEventsPage(1); }}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]/50"
          >
            <option value="">All event types</option>
            <option value="push">push</option>
            <option value="pull_request">pull_request</option>
            <option value="issues">issues</option>
            <option value="release">release</option>
            <option value="create">create</option>
            <option value="delete">delete</option>
            <option value="workflow_run">workflow_run</option>
          </select>
        )}
        {(activeTab === 'issues' || activeTab === 'prs') && (
          <select
            value={stateFilter}
            onChange={e => { setStateFilter(e.target.value); setIssuesPage(1); setPrsPage(1); }}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]/50"
          >
            <option value="">All states</option>
            <option value="open">open</option>
            <option value="closed">closed</option>
            {activeTab === 'prs' && <option value="merged">merged</option>}
          </select>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive-muted)] px-4 py-3 text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !eventsData && !issuesData && !prsData && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin" />
        </div>
      )}

      {/* Events tab */}
      {activeTab === 'events' && eventsData && (
        <>
          {eventsData.items.length === 0 ? (
            <EmptyState icon={<GitBranch className="h-8 w-8 text-[var(--text-muted)]" />} message="No webhook events yet" sub="Events appear here once the receiver processes incoming GitHub webhooks." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
                    <Th>Repo</Th>
                    <Th>Event Type</Th>
                    <Th>Action</Th>
                    <Th>Received</Th>
                  </tr>
                </thead>
                <tbody>
                  {eventsData.items.map(ev => (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <Td mono>{ev.repo}</Td>
                      <Td>
                        <StatusBadge label={ev.event_type} tone={eventTypeTone(ev.event_type)} />
                      </Td>
                      <Td>{ev.action ?? '—'}</Td>
                      <Td muted>{formatDate(ev.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {eventsData.total > 0 && (
            <Pagination
              page={eventsPage}
              total={eventsData.total}
              limit={PAGE_SIZE}
              onPrev={() => setEventsPage(p => Math.max(1, p - 1))}
              onNext={() => setEventsPage(p => p + 1)}
            />
          )}
        </>
      )}

      {/* Issues tab */}
      {activeTab === 'issues' && issuesData && (
        <>
          {issuesData.items.length === 0 ? (
            <EmptyState icon={<GitBranch className="h-8 w-8 text-[var(--text-muted)]" />} message="No issues yet" sub="Issues appear here once webhooks with issue events are received." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
                    <Th>Repo</Th>
                    <Th>#</Th>
                    <Th>Title</Th>
                    <Th>State</Th>
                    <Th>Author</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {issuesData.items.map(issue => (
                    <tr
                      key={issue.id}
                      onClick={() => setSelectedIssueOrPr(issue)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <Td mono>{issue.repo}</Td>
                      <Td mono>#{issue.github_number}</Td>
                      <Td>
                        <span className="truncate max-w-[280px] block">{issue.title}</span>
                      </Td>
                      <Td>
                        <StatusBadge label={issue.state} tone={stateTone(issue.state)} />
                      </Td>
                      <Td muted>{issue.author ?? '—'}</Td>
                      <Td muted>{formatDate(issue.updated_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {issuesData.total > 0 && (
            <Pagination
              page={issuesPage}
              total={issuesData.total}
              limit={PAGE_SIZE}
              onPrev={() => setIssuesPage(p => Math.max(1, p - 1))}
              onNext={() => setIssuesPage(p => p + 1)}
            />
          )}
        </>
      )}

      {/* PRs tab */}
      {activeTab === 'prs' && prsData && (
        <>
          {prsData.items.length === 0 ? (
            <EmptyState icon={<GitBranch className="h-8 w-8 text-[var(--text-muted)]" />} message="No pull requests yet" sub="PRs appear here once webhooks with pull_request events are received." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
                    <Th>Repo</Th>
                    <Th>#</Th>
                    <Th>Title</Th>
                    <Th>State</Th>
                    <Th>Author</Th>
                    <Th>Updated</Th>
                    <Th>Merged</Th>
                  </tr>
                </thead>
                <tbody>
                  {prsData.items.map(pr => (
                    <tr
                      key={pr.id}
                      onClick={() => setSelectedIssueOrPr(pr)}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <Td mono>{pr.repo}</Td>
                      <Td mono>#{pr.github_number}</Td>
                      <Td>
                        <span className="truncate max-w-[240px] block">{pr.title}</span>
                      </Td>
                      <Td>
                        <StatusBadge label={pr.state} tone={stateTone(pr.state)} />
                      </Td>
                      <Td muted>{pr.author ?? '—'}</Td>
                      <Td muted>{formatDate(pr.updated_at)}</Td>
                      <Td muted>{pr.merged_at ? formatDate(pr.merged_at) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {prsData.total > 0 && (
            <Pagination
              page={prsPage}
              total={prsData.total}
              limit={PAGE_SIZE}
              onPrev={() => setPrsPage(p => Math.max(1, p - 1))}
              onNext={() => setPrsPage(p => p + 1)}
            />
          )}
        </>
      )}

      {/* Modals */}
      {selectedEvent && (
        <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      {selectedIssueOrPr && (
        <IssueOrPrDetail item={selectedIssueOrPr} onClose={() => setSelectedIssueOrPr(null)} />
      )}
    </div>
  );
}

// ----- Small primitives -----

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub: string }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-10 text-center">
      <div className="mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-sm text-[var(--text-primary)] font-semibold">{message}</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, mono, muted }: { children: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <td className={`px-4 py-3 ${mono ? 'font-mono text-xs' : 'text-sm'} ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
      {children}
    </td>
  );
}
