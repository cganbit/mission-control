import { getPool } from '@/lib/db';

/**
 * Sends a WhatsApp message via Evolution API.
 * Reads credentials from connector_configs (evolution_url, evolution_api_key, whatsapp_number).
 * Never throws — alert failure must not break the caller.
 */
export async function sendWhatsApp(message: string): Promise<void> {
  try {
    const db = getPool();
    const cfgs = await db.query(
      `SELECT key, value FROM connector_configs WHERE key IN ('evolution_url','evolution_api_key','whatsapp_number')`
    );
    const cfg: Record<string, string> = {};
    for (const r of cfgs.rows) cfg[r.key] = r.value.trim();

    if (!cfg['evolution_url'] || !cfg['evolution_api_key'] || !cfg['whatsapp_number']) return;

    await fetch(`${cfg['evolution_url']}/message/sendText/Cleiton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg['evolution_api_key'] },
      body: JSON.stringify({ number: cfg['whatsapp_number'], text: message }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* never break the caller */ }
}
