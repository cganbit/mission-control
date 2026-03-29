import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  hasRole,
  getSessionFromRequest,
  type SessionPayload,
} from '../auth';

const SAMPLE_PAYLOAD: SessionPayload = {
  sub: 'user-123',
  sid: 'session-abc',
  username: 'cleiton',
  name: 'Cleiton',
  role: 'admin',
};

// ─── hashPassword / verifyPassword ───────────────────────────────────────────

describe('hashPassword / verifyPassword', () => {
  it('round-trip: verifica senha correta', () => {
    const stored = hashPassword('minha-senha');
    expect(verifyPassword('minha-senha', stored)).toBe(true);
  });

  it('rejeita senha errada', () => {
    const stored = hashPassword('minha-senha');
    expect(verifyPassword('senha-errada', stored)).toBe(false);
  });

  it('dois hashes do mesmo password são diferentes (salt aleatório)', () => {
    expect(hashPassword('abc')).not.toBe(hashPassword('abc'));
  });

  it('retorna false se stored não tiver salt:hash', () => {
    expect(verifyPassword('qualquer', 'semformato')).toBe(false);
  });
});

// ─── signToken / verifyToken ──────────────────────────────────────────────────

describe('signToken / verifyToken', () => {
  it('round-trip: token assinado é verificado corretamente', async () => {
    const token = await signToken(SAMPLE_PAYLOAD);
    const session = await verifyToken(token);
    expect(session?.sub).toBe(SAMPLE_PAYLOAD.sub);
    expect(session?.username).toBe(SAMPLE_PAYLOAD.username);
    expect(session?.role).toBe(SAMPLE_PAYLOAD.role);
    expect(session?.sid).toBe(SAMPLE_PAYLOAD.sid);
  });

  it('retorna null para token inválido', async () => {
    expect(await verifyToken('token.invalido.aqui')).toBeNull();
  });

  it('retorna null para string vazia', async () => {
    expect(await verifyToken('')).toBeNull();
  });

  it('retorna null para token com campos faltando (formato antigo)', async () => {
    // JWT válido mas sem campo "sid" — deve ser rejeitado
    const { SignJWT } = await import('jose');
    const SECRET = new TextEncoder().encode('mission-control-dev-secret-change-in-prod');
    const oldToken = await new SignJWT({ sub: 'u1', username: 'x', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(SECRET);
    expect(await verifyToken(oldToken)).toBeNull();
  });
});

// ─── hasRole ─────────────────────────────────────────────────────────────────

describe('hasRole', () => {
  const admin: SessionPayload   = { ...SAMPLE_PAYLOAD, role: 'admin' };
  const member: SessionPayload  = { ...SAMPLE_PAYLOAD, role: 'member' };
  const viewer: SessionPayload  = { ...SAMPLE_PAYLOAD, role: 'viewer' };

  it('admin tem acesso a tudo', () => {
    expect(hasRole(admin, 'admin')).toBe(true);
    expect(hasRole(admin, 'member')).toBe(true);
    expect(hasRole(admin, 'viewer')).toBe(true);
  });

  it('member não tem acesso a admin', () => {
    expect(hasRole(member, 'admin')).toBe(false);
    expect(hasRole(member, 'member')).toBe(true);
    expect(hasRole(member, 'viewer')).toBe(true);
  });

  it('viewer só tem acesso a viewer', () => {
    expect(hasRole(viewer, 'admin')).toBe(false);
    expect(hasRole(viewer, 'member')).toBe(false);
    expect(hasRole(viewer, 'viewer')).toBe(true);
  });

  it('session null retorna false', () => {
    expect(hasRole(null, 'viewer')).toBe(false);
  });
});

// ─── getSessionFromRequest ────────────────────────────────────────────────────

describe('getSessionFromRequest', () => {
  it('retorna null quando não há token', async () => {
    const req = new NextRequest('http://localhost/api/test');
    expect(await getSessionFromRequest(req)).toBeNull();
  });

  it('lê token do cookie mc_token', async () => {
    const token = await signToken(SAMPLE_PAYLOAD);
    const req = new NextRequest('http://localhost/api/test', {
      headers: { cookie: `mc_token=${token}` },
    });
    const session = await getSessionFromRequest(req);
    expect(session?.sub).toBe(SAMPLE_PAYLOAD.sub);
  });

  it('lê token do header Authorization Bearer', async () => {
    const token = await signToken(SAMPLE_PAYLOAD);
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const session = await getSessionFromRequest(req);
    expect(session?.username).toBe(SAMPLE_PAYLOAD.username);
  });

  it('retorna null com token inválido no cookie', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { cookie: 'mc_token=token.invalido' },
    });
    expect(await getSessionFromRequest(req)).toBeNull();
  });
});
