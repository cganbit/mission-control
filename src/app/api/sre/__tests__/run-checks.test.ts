import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WORKER_KEY = 'test-worker-key';

// MC_WORKER_KEY precisa estar no process.env ANTES do módulo carregar
vi.stubEnv('MC_WORKER_KEY', WORKER_KEY);

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  getPool: () => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ([{ name: 'cleiton', connectionStatus: 'open' }]),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(
    'Filesystem      1024-blocks   Used Available Capacity Mounted on\n/dev/sda1        10000000  4000000   6000000      40% /'
  ),
}));

// ─── Importar handler após mocks ─────────────────────────────────────────────

const { POST } = await import('../run-checks/route');

// ─── Testes de autorização ────────────────────────────────────────────────────

describe('POST /api/sre/run-checks — autorização', () => {
  it('retorna 401 sem x-worker-key', async () => {
    const req = new NextRequest('http://localhost/api/sre/run-checks', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('retorna 401 com key errada', async () => {
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': 'chave-errada' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ─── Testes de resposta ───────────────────────────────────────────────────────

describe('POST /api/sre/run-checks — resposta', () => {
  it('retorna 200 com estrutura correta', async () => {
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('tasks_created');
    expect(Array.isArray(body.checks)).toBe(true);
  });

  it('retorna 6 checks (um por serviço monitorado)', async () => {
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.checks).toHaveLength(6);
  });

  it('cada check tem service, check_name e status', async () => {
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    const body = await res.json();
    for (const check of body.checks) {
      expect(check).toHaveProperty('service');
      expect(check).toHaveProperty('check_name');
      expect(['ok', 'warning', 'error']).toContain(check.status);
    }
  });
});

// ─── Lógica de classificação do disk_usage ────────────────────────────────────

describe('checkDiskUsage — classificação de status via df -P', () => {
  it('status ok quando uso < 70%', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValueOnce(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1  10000000  3000000  7000000   30% /'
    );
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    const body = await res.json();
    const disk = body.checks.find((c: any) => c.check_name === 'disk_usage');
    expect(disk?.status).toBe('ok');
  });

  it('status warning quando uso entre 70% e 84%', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValueOnce(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1  10000000  7500000  2500000   75% /'
    );
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    const body = await res.json();
    const disk = body.checks.find((c: any) => c.check_name === 'disk_usage');
    expect(disk?.status).toBe('warning');
  });

  it('status error quando uso >= 85%', async () => {
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValueOnce(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1  10000000  9000000  1000000   90% /'
    );
    const req = new NextRequest('http://localhost/api/sre/run-checks', {
      method: 'POST',
      headers: { 'x-worker-key': WORKER_KEY },
    });
    const res = await POST(req);
    const body = await res.json();
    const disk = body.checks.find((c: any) => c.check_name === 'disk_usage');
    expect(disk?.status).toBe('error');
  });
});
