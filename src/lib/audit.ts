import { getArbitragemPool } from './db';

export async function logAudit(
  username: string,
  action: string,
  fingerprint?: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getArbitragemPool();
    await db.query(
      `INSERT INTO paraguai_audit_log (username, action, fingerprint, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [username, action, fingerprint ?? null, JSON.stringify(detail ?? {})]
    );
  } catch {
    // Never let audit failure break the main flow
  }
}
