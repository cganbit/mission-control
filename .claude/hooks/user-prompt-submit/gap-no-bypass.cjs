#!/usr/bin/env node
/**
 * @wingx-app/platform — gap-no-bypass
 *
 * Tipo: Claude Code UserPromptSubmit hook
 * Protocolo: https://docs.claude.com/en/docs/claude-code/hooks
 *
 * Bloqueia prompts que pedem bypass de checks/hooks mecânicos.
 * Princípio: classifica → delega → verifica. Se check bloqueia, entende o
 * porquê e resolve a causa raiz — nunca bypassa.
 *
 * Padrões bloqueados:
 *   - Flags de bypass (--no-verify, --force, --skip-hooks)
 *   - Frases que pedem contornar (skip check, bypass hook, ignore failing test)
 *   - Amending commits publicados (risco de overwrite)
 *
 * Emergency opt-out: env var WINGX_ALLOW_BYPASS=1 (documentar motivo).
 *
 * Zero deps — só Node stdlib.
 */

const FLAG_PATTERNS = [
  /--no-verify\b/i,
  /--no-gpg-sign\b/i,
  /--force(?!-with-lease)/i,
  /--skip-hooks?\b/i,
  /--ignore-scripts\b/i,
];

const PHRASE_PATTERNS = [
  /\b(skip|bypass|disable|ignore)\s+(the\s+)?(hook|check|lint|test|typecheck|pre-commit|validation)/i,
  /\bcommit\s+without\s+(running|checking|validating)/i,
  /\b(force|hard)\s+(push|reset)\s+(to\s+)?(main|master|production)/i,
  /\bamend\s+(the\s+)?published\s+commit/i,
  /\bpurgar?\s+(git\s+)?history\s+antes/i,
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('{}');
  });
}

function detect(prompt) {
  const hits = [];
  for (const p of FLAG_PATTERNS) {
    const m = prompt.match(p);
    if (m) hits.push({ type: 'flag', match: m[0] });
  }
  for (const p of PHRASE_PATTERNS) {
    const m = prompt.match(p);
    if (m) hits.push({ type: 'phrase', match: m[0] });
  }
  return hits;
}

async function main() {
  if (process.env.WINGX_ALLOW_BYPASS === '1') {
    process.exit(0);
  }

  const raw = await readStdin();
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const prompt = input.prompt || '';
  if (!prompt) process.exit(0);

  const hits = detect(prompt);
  if (hits.length === 0) process.exit(0);

  const reason = [
    '⛔ Bypass pattern detected — blocked by gap-no-bypass hook.',
    '',
    'Matched:',
    ...hits.map((h) => `  - ${h.type}: "${h.match}"`),
    '',
    'Princípio: se um check mecânico bloqueia, entende o porquê e resolve a causa raiz.',
    'Criar waivers, pular validações ou forçar ações destrutivas sem entendimento = anti-padrão.',
    '',
    'Se isto é emergência legítima (incident em prod, hotfix urgente, etc.):',
    '  1. Documente o motivo por escrito (incident log, PR description).',
    '  2. Reenvie com `WINGX_ALLOW_BYPASS=1` no env.',
    '  3. Crie follow-up pra corrigir causa raiz no próximo ciclo.',
  ].join('\n');

  const response = {
    decision: 'block',
    reason,
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`gap-no-bypass error: ${err.message}\n`);
  process.exit(0);
});
