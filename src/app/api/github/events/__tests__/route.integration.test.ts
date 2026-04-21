import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock dependencies (no docker DB available in CI) ────────────────────────

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

import { GET } from '../route';
import { getSessionFromRequest } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getProjectScopeFromSession } from '@/lib/session-scope';

const mockSession = { sub: 'u1', sid: 's1', username: 'alice', name: 'Alice', role: 'admin' as const, projectId: 'proj-uuid' };
const mockScope = { projectId: 'proj-uuid' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionFromRequest).mockResolvedValue(mockSession);
  vi.mocked(getProjectScopeFromSession).mockReturnValue(mockScope);
});

describe('GET /api/github/events', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/github/events');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns paginated items with total', async () => {
    const fakeRows = [{ id: 'e1', event_type: 'push', delivery_id: 'd1', received_at: new Date().toISOString() }];
    vi.mocked(query).mockResolvedValue(fakeRows);
    vi.mocked(queryOne).mockResolvedValue({ count: '1' });

    const req = new NextRequest('http://localhost/api/github/events?page=1&limit=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(fakeRows);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
  });

  it('passes repo filter to query', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/events?repo=wingx-app%2Fplatform');
    await GET(req);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('repo = $1');
    expect(params).toContain('wingx-app/platform');
  });

  it('passes event_type filter to query', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/events?event_type=push');
    await GET(req);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('event_type = $1');
    expect(params).toContain('push');
  });

  it('passes project scope for RLS isolation', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/events');
    await GET(req);

    const scopeArg = vi.mocked(query).mock.calls[0][2];
    expect(scopeArg).toEqual(mockScope);
  });

  it('caps limit at 100', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/events?limit=9999');
    const res = await GET(req);
    const body = await res.json();
    expect(body.limit).toBe(100);
  });
});
