import { describe, test, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getSessionFromRequest,
  hasRole,
  type SessionPayload,
} from './auth';

// ─── hashPassword / verifyPassword ───────────────────────────────────────────

describe('hashPassword / verifyPassword', () => {
  test('verifica senha correta', () => {
    const hash = hashPassword('senha123');
    expect(verifyPassword('senha123', hash)).toBe(true);
  });

  test('rejeita senha errada', () => {
    const hash = hashPassword('senha123');
    expect(verifyPassword('senhaErrada', hash)).toBe(false);
  });

  test('dois hashes da mesma senha são diferentes (salt aleatório)', () => {
    expect(hashPassword('senha')).not.toBe(hashPassword('senha'));
  });

  test('retorna false para hash malformado', () => {
    expect(verifyPassword('senha', 'semcolons')).toBe(false);
  });
});

// ─── signToken / verifyToken ──────────────────────────────────────────────────

const mockPayload: SessionPayload = {
  sub: 'user-123',
  sid: 'session-abc',
  username: 'cleiton',
  name: 'Cleiton',
  role: 'admin',
};

describe('signToken / verifyToken', () => {
  test('verifica token válido e retorna payload', async () => {
    const token = await signToken(mockPayload);
    const result = await verifyToken(token);
    expect(result?.sub).toBe('user-123');
    expect(result?.role).toBe('admin');
    expect(result?.username).toBe('cleiton');
  });

  test('retorna null para token inválido', async () => {
    expect(await verifyToken('token.invalido.aqui')).toBeNull();
  });

  test('retorna null para string vazia', async () => {
    expect(await verifyToken('')).toBeNull();
  });
});

// ─── getSessionFromRequest ────────────────────────────────────────────────────

describe('getSessionFromRequest', () => {
  test('extrai sessão do header Authorization Bearer', async () => {
    const token = await signToken(mockPayload);
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const session = await getSessionFromRequest(req);
    expect(session?.sub).toBe('user-123');
  });

  test('retorna null sem token', async () => {
    const req = new NextRequest('http://localhost/api/test');
    expect(await getSessionFromRequest(req)).toBeNull();
  });

  test('retorna null com Bearer inválido', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer token.invalido' },
    });
    expect(await getSessionFromRequest(req)).toBeNull();
  });
});

// ─── hasRole ──────────────────────────────────────────────────────────────────

describe('hasRole', () => {
  test('admin tem acesso a tudo', () => {
    const s = { ...mockPayload, role: 'admin' as const };
    expect(hasRole(s, 'admin')).toBe(true);
    expect(hasRole(s, 'member')).toBe(true);
    expect(hasRole(s, 'viewer')).toBe(true);
  });

  test('member não tem acesso a admin', () => {
    const s = { ...mockPayload, role: 'member' as const };
    expect(hasRole(s, 'admin')).toBe(false);
    expect(hasRole(s, 'member')).toBe(true);
  });

  test('viewer só tem acesso a viewer', () => {
    const s = { ...mockPayload, role: 'viewer' as const };
    expect(hasRole(s, 'admin')).toBe(false);
    expect(hasRole(s, 'member')).toBe(false);
    expect(hasRole(s, 'viewer')).toBe(true);
  });

  test('retorna false para sessão null', () => {
    expect(hasRole(null, 'viewer')).toBe(false);
  });
});
