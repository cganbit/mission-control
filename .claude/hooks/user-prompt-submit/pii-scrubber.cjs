#!/usr/bin/env node
/**
 * @wingx-app/platform — pii-scrubber
 *
 * Tipo: Claude Code UserPromptSubmit hook
 * Protocolo: https://docs.claude.com/en/docs/claude-code/hooks
 *
 * Bloqueia prompts que contêm PII (dados pessoais identificáveis) para evitar
 * vazamento pra LLMs externos ou logs de telemetria.
 *
 * Origem conceitual: Agent-SmithV6 `backend/app/agents/guardrails.py` Layer 3
 * (Presidio analyzer). Re-implementado em JS puro (zero deps, language-agnostic,
 * sem Python runtime dependency).
 *
 * Padrões detectados (fail-close):
 *   - Email (genérico)
 *   - CPF (formatado e não-formatado 11 dígitos)
 *   - CNPJ (formatado e não-formatado 14 dígitos)
 *   - Telefone BR (+55, (DD), celular 9 dígitos)
 *   - Cartão de crédito (16 dígitos em padrão 4-4-4-4)
 *   - SSN US (XXX-XX-XXXX)
 *
 * Escape hatch: env var WINGX_ALLOW_PII=1 (documentar motivo — ex: dado
 * sintético, teste de integração, dado já público).
 *
 * NÃO detecta (delegar pra skill `security-guardrails`):
 *   - API keys, tokens, passwords → secrets scanning
 *   - Prompt injection → pattern scanning
 *
 * Zero deps — só Node stdlib.
 */

const PII_PATTERNS = [
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    mask: (m) => {
      const [local, domain] = m.split('@');
      const head = local.slice(0, 2);
      return `${head}***@${domain}`;
    },
  },
  {
    name: 'cpf',
    pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    mask: () => '***.***.***-**',
  },
  {
    name: 'cnpj',
    pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    mask: () => '**.***.***/****-**',
  },
  {
    name: 'phone_br',
    pattern: /\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g,
    mask: () => '(**) *****-****',
  },
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    mask: () => '****-****-****-****',
  },
  {
    name: 'ssn_us',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    mask: () => '***-**-****',
  },
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
  for (const { name, pattern, mask } of PII_PATTERNS) {
    const matches = prompt.match(pattern);
    if (matches) {
      for (const m of matches) {
        hits.push({ type: name, match: m, masked: mask(m) });
      }
    }
  }
  return hits;
}

async function main() {
  if (process.env.WINGX_ALLOW_PII === '1') {
    process.exit(0);
  }

  const raw = await readStdin();
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const prompt = input.prompt || '';
  if (!prompt) process.exit(0);

  const hits = detect(prompt);
  if (hits.length === 0) process.exit(0);

  const byType = hits.reduce((acc, h) => {
    acc[h.type] = (acc[h.type] || 0) + 1;
    return acc;
  }, {});

  const summary = Object.entries(byType)
    .map(([t, n]) => `  - ${t}: ${n} match(es)`)
    .join('\n');

  const preview = hits.slice(0, 3)
    .map((h) => `  - ${h.type}: "${h.match}" → "${h.masked}"`)
    .join('\n');

  const reason = [
    '⛔ PII detected — blocked by pii-scrubber hook.',
    '',
    'Summary:',
    summary,
    '',
    'Preview (first 3):',
    preview,
    '',
    'Princípio: dados pessoais identificáveis não devem vazar pra LLMs externos',
    'ou logs de telemetria sem intenção explícita.',
    '',
    'Se o dado é legítimo (sintético, teste, já público, consentimento explícito):',
    '  1. Documente o motivo por escrito (PR description, spike doc).',
    '  2. Reenvie com `WINGX_ALLOW_PII=1` no env.',
    '  3. Prefira mascarar antes de submeter quando possível.',
  ].join('\n');

  const response = {
    decision: 'block',
    reason,
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`pii-scrubber error: ${err.message}\n`);
  process.exit(0);
});
