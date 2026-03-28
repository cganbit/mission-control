import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendWhatsApp } from '@/lib/whatsapp';

const WORKER_KEY    = process.env.WORKER_KEY ?? '';
const MC_URL        = process.env.NEXT_PUBLIC_APP_URL ?? 'http://187.77.43.141:3001';
const SRE_WA_GROUP  = process.env.SRE_WHATSAPP_GROUP ?? undefined; // ex: '5511999999999-1234567890@g.us'

function formatAge(createdAt: Date): string {
  const mins = Math.floor((Date.now() - createdAt.getTime()) / 60000);
  if (mins < 60) return `${mins}min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

// ─── POST /api/sre/escalate — notifica WhatsApp para tasks SRE não resolvidas ─

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-worker-key');
  if (!WORKER_KEY || key !== WORKER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getPool();

  // Busca tasks SRE abertas que precisam de escalação:
  // urgent (escalation=0) → escala na primeira rodada após criação
  // outros → escala após N minutos sem resolução
  const result = await db.query(`
    SELECT t.id, t.title, t.description, t.priority, t.created_at, t.updated_at,
           sc.service, sc.check_name, sc.escalation_minutes
    FROM tasks t
    JOIN sre_checks sc ON t.sre_check_id = sc.id
    WHERE t.status != 'done'
      AND t.auto_created = true
      AND t.notified_at IS NULL
      AND (
        (sc.escalation_minutes = 0)
        OR (sc.escalation_minutes > 0
            AND t.updated_at < NOW() - (sc.escalation_minutes || ' minutes')::interval)
      )
    ORDER BY t.priority DESC, t.created_at ASC
  `);

  if (result.rows.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  let notified = 0;
  for (const task of result.rows) {
    const age = formatAge(new Date(task.created_at));
    const priorityIcon = task.priority === 'urgent' ? '🔴' : '🟠';
    const message = [
      `${priorityIcon} *[SRE] ${task.service.toUpperCase()}*`,
      ``,
      `*Problema:* ${task.check_name.replace(/_/g, ' ')}`,
      task.description ? `*Detalhe:* ${task.description}` : null,
      `*Aberto há:* ${age}`,
      `*Prioridade:* ${task.priority}`,
      ``,
      `→ ${MC_URL}/tasks`,
    ].filter(l => l !== null).join('\n');

    try {
      await sendWhatsApp(message, SRE_WA_GROUP);
      await db.query(
        `UPDATE tasks SET notified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
      notified++;
    } catch (e: any) {
      console.error(`[SRE Escalate] Erro ao notificar task ${task.id}:`, e.message);
    }
  }

  return NextResponse.json({ notified, tasks: result.rows.map((t: any) => ({ id: t.id, service: t.service, priority: t.priority })) });
}
