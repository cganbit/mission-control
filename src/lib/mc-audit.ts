import { getPool } from './db';

export async function auditLog(event: {
  event_type: string;
  entity_type?: string;
  entity_id?: number;
  seller_nickname?: string;
  payload?: object;
  status: 'ok' | 'error';
  error_msg?: string;
  duration_ms?: number;
}): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO mc_audit_log (event_type, entity_type, entity_id, seller_nickname, payload, status, error_msg, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.event_type,
        event.entity_type ?? null,
        event.entity_id ?? null,
        event.seller_nickname ?? null,
        event.payload ? JSON.stringify(event.payload) : null,
        event.status,
        event.error_msg ?? null,
        event.duration_ms ?? null,
      ]
    );
  } catch {
    // Never let audit failure break the main flow
  }
}
