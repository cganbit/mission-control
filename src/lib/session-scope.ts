import { NextRequest } from 'next/server';
import { getSessionFromRequest, type SessionPayload } from './auth';
import type { QueryOptions } from './db';

/**
 * Extracts project scope from JWT session cookie for RLS-aware queries.
 * Returns empty QueryOptions (permissive fallback per PRD-035 D37) when
 * session has no projectId — policy `tenant_isolation` allows NULL via
 * `app.current_project_id() IS NULL`.
 *
 * Usage in API route:
 *   const scope = await getProjectScopeFromRequest(req);
 *   const rows = await query('SELECT * FROM squads', [], scope);
 */
export async function getProjectScopeFromRequest(req: NextRequest): Promise<QueryOptions> {
  const session = await getSessionFromRequest(req);
  if (!session?.projectId) return {};
  return { projectId: session.projectId };
}

/**
 * Same as above but from already-verified session (avoids re-parsing JWT when
 * caller already has it). Returns {} when projectId missing.
 */
export function getProjectScopeFromSession(session: SessionPayload | null): QueryOptions {
  if (!session?.projectId) return {};
  return { projectId: session.projectId };
}
