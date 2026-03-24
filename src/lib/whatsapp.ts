import { getPool } from '@/lib/db';

async function getEvoCfg(): Promise<Record<string, string> | null> {
  const db = getPool();
  const cfgs = await db.query(
    `SELECT key, value FROM connector_configs WHERE key IN ('evolution_url','evolution_api_key','whatsapp_number')`
  );
  const cfg: Record<string, string> = {};
  for (const r of cfgs.rows) cfg[r.key] = r.value.trim();
  if (!cfg['evolution_url'] || !cfg['evolution_api_key'] || !cfg['whatsapp_number']) return null;
  return cfg;
}

/**
 * Envia mensagem de texto via Evolution API.
 * Nunca lança erro — falha de alerta não deve quebrar o caller.
 */
export async function sendWhatsApp(message: string, to?: string): Promise<void> {
  try {
    const cfg = await getEvoCfg();
    if (!cfg) return;
    await fetch(`${cfg['evolution_url']}/message/sendText/Cleiton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg['evolution_api_key'] },
      body: JSON.stringify({ number: to ?? cfg['whatsapp_number'], text: message }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* never break the caller */ }
}

/**
 * Envia imagem com legenda via Evolution API.
 * Se falhar, cai para envio de texto simples.
 */
export async function sendWhatsAppMedia(imageUrl: string, caption: string, to?: string): Promise<void> {
  try {
    const cfg = await getEvoCfg();
    if (!cfg) return;
    const res = await fetch(`${cfg['evolution_url']}/message/sendMedia/Cleiton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg['evolution_api_key'] },
      body: JSON.stringify({
        number: to ?? cfg['whatsapp_number'],
        mediatype: 'image',
        mimetype: 'image/jpeg',
        media: imageUrl,
        caption,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Evolution ${res.status}`);
  } catch {
    await sendWhatsApp(caption, to);
  }
}
