import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'mission-control-dev-secret-change-in-prod'
);

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'REDACTED_ADMIN_PASS';

// Session idle timeout in hours (default 24h — override with SESSION_HOURS env var)
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);

// ─── Password hashing (PBKDF2 — no extra deps) ──────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const toVerify = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(toVerify, 'hex'));
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface SessionPayload {
  sub: string;         // user id
  sid: string;         // session id (for access log pairing)
  username: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  projectId?: string;       // active project uuid — optional for backwards-compat (D37 fallback)
  organizationId?: string;  // owner org of active project
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Reject old token format (pre-multi-user)
    const p = payload as Record<string, unknown>;
    if (!p.sub || !p.username || !p.role || !p.sid) return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('mc_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get('mc_token')?.value
    ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(token);
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_LEVEL: Record<string, number> = { admin: 3, member: 2, viewer: 1 };

export function hasRole(session: SessionPayload | null, minRole: 'admin' | 'member' | 'viewer'): boolean {
  if (!session) return false;
  return (ROLE_LEVEL[session.role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 99);
}

// ─── Worker Key verification (M1 security fix) ────────────────────────────────
// Centralizado para evitar bypass por MC_WORKER_KEY vazio em cada rota

export function verifyWorkerKey(req: NextRequest): boolean {
  const envKey = process.env.MC_WORKER_KEY ?? '';
  if (!envKey) return false; // vazio = sempre nega (não permite bypass acidental)
  return req.headers.get('x-worker-key') === envKey;
}
