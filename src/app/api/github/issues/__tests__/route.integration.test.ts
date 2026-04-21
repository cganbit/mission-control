import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

describe('GET /api/github/issues', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/github/issues');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns paginated items with total', async () => {
    const fakeRows = [{ id: 'i1', number: 42, title: 'Bug', state: 'open' }];
    vi.mocked(query).mockResolvedValue(fakeRows);
    vi.mocked(queryOne).mockResolvedValue({ count: '1' });

    const req = new NextRequest('http://localhost/api/github/issues?page=1&limit=20');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(fakeRows);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('filters by repo', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/issues?repo=wingx-app%2Fplatform');
    await GET(req);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('repo = $1');
    expect(params).toContain('wingx-app/platform');
  });

  it('filters by state=open', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/issues?state=open');
    await GET(req);

    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain('state = $1');
    expect(params).toContain('open');
  });

  it('rejects invalid state values silently (no filter applied)', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/issues?state=invalid');
    await GET(req);

    const [sql] = vi.mocked(query).mock.calls[0];
    expect(sql).not.toContain('state =');
  });

  it('passes project scope for RLS isolation', async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(queryOne).mockResolvedValue({ count: '0' });

    const req = new NextRequest('http://localhost/api/github/issues');
    await GET(req);

    const scopeArg = vi.mocked(query).mock.calls[0][2];
    expect(scopeArg).toEqual(mockScope);
  });
});
