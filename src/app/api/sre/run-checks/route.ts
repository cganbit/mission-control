import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp } from '@/lib/whatsapp';

const WORKER_KEY      = process.env.WORKER_KEY ?? '';
const SRE_GROUP       = process.env.SRE_WHATSAPP_GROUP ?? '';
const EVOLUTION_URL   = process.env.EVOLUTION_URL ?? 'http://evolution-api-h4pg-api-1:8080';
const EVOLUTION_KEY   = process.env.EVOLUTION_API_KEY ?? '';
const N8N_URL         = process.env.N8N_URL ?? 'http://evolution-api-h4pg-n8n-1:5678';
const N8N_API_KEY     = process.env.N8N_API_KEY ?? '';
const N8N_WORKFLOW_ID = process.env.N8N_WORKFLOW_ID ?? 'okizEwONJrJ8M6vI';

// Squad SRE — buscado dinamicamente por nome
async function getSreSquadId(db: ReturnType<typeof getPool>): Promise<string | null> {
  const r = await db.query(`SELECT id FROM squads WHERE name = 'SRE' LIMIT 1`);
  return r.rows[0]?.id ?? null;
}

interface CheckResult {
  service: string;
  check_name: string;
  status: 'ok' | 'error' | 'warning';
  error?: string;
}

// ─── Checks individuais ───────────────────────────────────────────────────────

async function checkEvolution(): Promise<CheckResult> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const instances: any[] = Array.isArray(data) ? data : Object.values(data);
    const cleiton = instances.find(
      (i: any) => (i.name ?? i.instance?.instanceName ?? i.instanceName ?? '').toLowerCase() === 'cleiton'
    );
    // Evolution API v2: connectionStatus (flat); v1: instance.state
    const state = cleiton?.connectionStatus ?? cleiton?.instance?.state ?? cleiton?.state ?? 'unknown';
    if (state !== 'open') {
      return { service: 'evolution', check_name: 'whatsapp_connected', status: 'error', error: `Instância state=${state}` };
    }
    return { service: 'evolution', check_name: 'whatsapp_connected', status: 'ok' };
  } catch (e: any) {
    return { service: 'evolution', check_name: 'whatsapp_connected', status: 'error', error: e.message };
  }
}

async function checkMlTokens(db: ReturnType<typeof getPool>): Promise<CheckResult> {
  try {
    const row = await db.query(`SELECT value FROM connector_configs WHERE key = 'ml_tokens_json' LIMIT 1`);
    if (!row.rows[0]) return { service: 'ml_tokens', check_name: 'token_expiry_24h', status: 'warning', error: 'ml_tokens_json não encontrado' };
    const accounts: any[] = JSON.parse(row.rows[0].value)?.accounts ?? JSON.parse(row.rows[0].value);
    const threshold = Date.now() + 24 * 60 * 60 * 1000;
    const expiring = accounts.filter((a: any) => a.expires_at && new Date(a.expires_at).getTime() < threshold);
    if (expiring.length > 0) {
      const names = expiring.map((a: any) => a.nickname ?? a.seller_id).join(', ');
      return { service: 'ml_tokens', check_name: 'token_expiry_24h', status: 'warning', error: `Expirando em 24h: ${names}` };
    }
    return { service: 'ml_tokens', check_name: 'token_expiry_24h', status: 'ok' };
  } catch (e: any) {
    return { service: 'ml_tokens', check_name: 'token_expiry_24h', status: 'error', error: e.message };
  }
}

async function checkPrintQueue(db: ReturnType<typeof getPool>): Promise<CheckResult> {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM print_queue
       WHERE status = 'error'`
    );
    const cnt = r.rows[0]?.cnt ?? 0;
    if (cnt > 0) return { service: 'print_queue', check_name: 'jobs_in_error', status: 'error', error: `${cnt} job(s) em erro` };
    return { service: 'print_queue', check_name: 'jobs_in_error', status: 'ok' };
  } catch (e: any) {
    return { service: 'print_queue', check_name: 'jobs_in_error', status: 'error', error: e.message };
  }
}

async function checkN8n(): Promise<CheckResult> {
  try {
    const res = await fetch(`${N8N_URL}/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.active) return { service: 'n8n', check_name: 'workflow_active', status: 'error', error: 'Workflow inativo' };
    return { service: 'n8n', check_name: 'workflow_active', status: 'ok' };
  } catch (e: any) {
    return { service: 'n8n', check_name: 'workflow_active', status: 'error', error: e.message };
  }
}

async function checkDb(db: ReturnType<typeof getPool>): Promise<CheckResult> {
  try {
    await db.query('SELECT 1');
    return { service: 'db', check_name: 'connectivity', status: 'ok' };
  } catch (e: any) {
    return { service: 'db', check_name: 'connectivity', status: 'error', error: e.message };
  }
}

async function checkDiskUsage(): Promise<CheckResult> {
  try {
    const { execSync } = await import('child_process');
    const output = execSync('df -P /', { encoding: 'utf8' });
    const pct = parseInt(output.split('\n')[1].trim().split(/\s+/)[4].replace('%', ''), 10);
    if (pct >= 85) return { service: 'vps', check_name: 'disk_usage', status: 'error', error: `Disco em ${pct}%` };
    if (pct >= 70) return { service: 'vps', check_name: 'disk_usage', status: 'warning', error: `Disco em ${pct}%` };
    return { service: 'vps', check_name: 'disk_usage', status: 'ok' };
  } catch (e: any) {
    return { service: 'vps', check_name: 'disk_usage', status: 'error', error: e.message };
  }
}

// ─── Upsert check + criar task se falha ──────────────────────────────────────

async function persistCheck(db: ReturnType<typeof getPool>, result: CheckResult, sreSquadId: string | null): Promise<boolean> {
  const isError = result.status !== 'ok';

  // Atualiza último estado do check
  await db.query(
    `UPDATE sre_checks
     SET last_status = $1, last_error = $2, last_checked_at = NOW()
     WHERE service = $3 AND check_name = $4`,
    [result.status, result.error ?? null, result.service, result.check_name]
  );

  if (!isError) {
    // Resolve tasks abertas para esse check (se voltou ao normal)
    const checkRow = await db.query(
      `SELECT id FROM sre_checks WHERE service = $1 AND check_name = $2`,
      [result.service, result.check_name]
    );
    if (checkRow.rows[0]) {
      await db.query(
        `UPDATE tasks SET status = 'done', updated_at = NOW()
         WHERE sre_check_id = $1 AND status != 'done' AND auto_created = true`,
        [checkRow.rows[0].id]
      );
    }
    return false;
  }

  // Busca o sre_check id
  const checkRow = await db.query(
    `SELECT id, escalation_minutes FROM sre_checks WHERE service = $1 AND check_name = $2`,
    [result.service, result.check_name]
  );
  if (!checkRow.rows[0]) return false;
  const { id: checkId, escalation_minutes } = checkRow.rows[0];

  // Verifica se já existe task aberta para esse check
  const existing = await db.query(
    `SELECT id FROM tasks WHERE sre_check_id = $1 AND status != 'done'`,
    [checkId]
  );
  if (existing.rows.length > 0) return false; // Já tem task aberta — não duplica

  if (!sreSquadId) return false; // Squad SRE não encontrado

  const priority = escalation_minutes === 0 ? 'urgent' : 'high';
  const title = `[SRE] ${result.service} — ${result.check_name.replace(/_/g, ' ')}`;

  await db.query(
    `INSERT INTO tasks (squad_id, title, description, status, priority, sre_check_id, auto_created, created_by)
     VALUES ($1, $2, $3, 'backlog', $4, $5, true, 'sre-monitor')`,
    [sreSquadId, title, result.error ?? null, priority, checkId]
  );

  return true;
}

// ─── POST /api/sre/run-checks ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-worker-key');
  if (!WORKER_KEY || key !== WORKER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();

  const [evolution, mlTokens, printQueue, n8n, dbCheck, diskUsage] = await Promise.allSettled([
    checkEvolution(),
    checkMlTokens(db),
    checkPrintQueue(db),
    checkN8n(),
    checkDb(db),
    checkDiskUsage(),
  ]);

  const results: CheckResult[] = [evolution, mlTokens, printQueue, n8n, dbCheck, diskUsage].map(r =>
    r.status === 'fulfilled' ? r.value : { service: 'unknown', check_name: 'unknown', status: 'error', error: String((r as PromiseRejectedResult).reason) }
  );

  const sreSquadId = await getSreSquadId(db);

  let tasks_created = 0;
  const newFailures: CheckResult[] = [];

  for (const result of results) {
    try {
      const created = await persistCheck(db, result, sreSquadId);
      if (created) {
        tasks_created++;
        newFailures.push(result);
      }
    } catch (e: any) {
      console.error(`[SRE] Erro ao persistir check ${result.service}/${result.check_name}:`, e.message);
    }
  }

  // Notificar grupo SRE apenas para novas falhas (task recém-criada)
  if (newFailures.length > 0 && SRE_GROUP) {
    const emoji: Record<string, string> = { error: '🔴', warning: '🟡', ok: '✅' };
    const lines = newFailures.map(f =>
      `${emoji[f.status] ?? '⚠️'} *${f.service}* — ${f.check_name.replace(/_/g, ' ')}\n   ${f.error ?? ''}`
    ).join('\n\n');
    const msg = `🚨 *SRE Alert — Mission Control*\n\n${lines}\n\n_Verifique o painel: https://mc.wingx.app.br/sre_`;
    await sendWhatsApp(msg, SRE_GROUP).catch(() => {});
  }

  return NextResponse.json({ checks: results, tasks_created });
}
