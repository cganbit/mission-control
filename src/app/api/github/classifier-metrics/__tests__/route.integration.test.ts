import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('@/lib/session-scope', () => ({
  getProjectScopeFromSession: vi.fn(),
}));

import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

const mockGetSession = vi.mocked(getSessionFromRequest);
const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockGetScope = vi.mocked(getProjectScopeFromSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url = 'http://localhost/api/github/classifier-metrics') {
  return new NextRequest(url);
}

function fakeSession() {
  return { userId: 'u1', projectId: 'p1' };
}

function fakeScope() {
  return { projectId: 'p1' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/github/classifier-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 200 with correct shape on empty DB', async () => {
    mockGetSession.mockResolvedValue(fakeSession() as ReturnType<typeof fakeSession>);
    mockGetScope.mockReturnValue(fakeScope() as ReturnType<typeof fakeScope>);

    // All queries return empty / zero results
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ total: '0', classified: '0' });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);

    // Shape checks
    expect(body).toHaveProperty('totals');
    expect(body).toHaveProperty('last_7_days');
    expect(body).toHaveProperty('top_repos');
    expect(body).toHaveProperty('classified_pct');

    // Empty DB values
    expect(body.totals).toEqual({ trivial_fix: 0, needs_human: 0, noise: 0, unclassified: 0 });
    expect(body.last_7_days).toEqual([]);
    expect(body.top_repos).toEqual([]);
    expect(body.classified_pct).toBe(0);
  });

  it('returns 200 with aggregated data when DB has events', async () => {
    mockGetSession.mockResolvedValue(fakeSession() as ReturnType<typeof fakeSession>);
    mockGetScope.mockReturnValue(fakeScope() as ReturnType<typeof fakeScope>);

    // query is called 3 times: totals, last_7_days, top_repos
    mockQuery
      .mockResolvedValueOnce([
        { classification: 'trivial_fix', cnt: '5' },
        { classification: 'needs_human', cnt: '3' },
        { classification: 'noise', cnt: '2' },
        { classification: null, cnt: '1' },
      ])
      .mockResolvedValueOnce([
        { day: '2026-04-15', classification: 'trivial_fix', cnt: '2' },
        { day: '2026-04-15', classification: 'noise', cnt: '1' },
        { day: '2026-04-16', classification: 'needs_human', cnt: '3' },
      ])
      .mockResolvedValueOnce([
        { repo: 'wingx-app/mission-control', classification: 'trivial_fix', cnt: '4' },
        { repo: 'wingx-app/mission-control', classification: 'needs_human', cnt: '2' },
        { repo: 'wingx-app/wingx-platform', classification: 'noise', cnt: '1' },
      ]);

    mockQueryOne.mockResolvedValue({ total: '11', classified: '10' });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);

    // Totals
    expect(body.totals.trivial_fix).toBe(5);
    expect(body.totals.needs_human).toBe(3);
    expect(body.totals.noise).toBe(2);
    expect(body.totals.unclassified).toBe(1);

    // last_7_days sorted ascending
    expect(body.last_7_days).toHaveLength(2);
    expect(body.last_7_days[0].day).toBe('2026-04-15');
    expect(body.last_7_days[0].trivial_fix).toBe(2);
    expect(body.last_7_days[0].noise).toBe(1);
    expect(body.last_7_days[1].day).toBe('2026-04-16');
    expect(body.last_7_days[1].needs_human).toBe(3);

    // top_repos
    expect(body.top_repos).toHaveLength(2);
    expect(body.top_repos[0].repo).toBe('wingx-app/mission-control');
    expect(body.top_repos[0].trivial_fix).toBe(4);
    expect(body.top_repos[0].needs_human).toBe(2);

    // classified_pct = 10/11 ≈ 90.91
    expect(body.classified_pct).toBeCloseTo(90.91, 1);
  });
});
