#!/usr/bin/env node
/**
 * @wingx-app/platform — memory-load-check
 *
 * Tipo: Claude Code SessionStart hook
 * Protocolo: https://docs.claude.com/en/docs/claude-code/hooks
 *
 * Checa se o projeto tem `knowledge/` estruturado (second brain).
 * Se existir, lista categorias descobertas e injeta como additionalContext
 * pra a sessão já começar ciente das fontes canônicas.
 * Se não existir, emite warning com sugestão de estrutura (non-blocking).
 *
 * Zero deps — só Node stdlib.
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = 'knowledge';
const RECOMMENDED_SUBDIRS = ['concepts', 'decisions', 'prds', 'lessons', 'domains', 'runbooks'];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('{}');
  });
}

function scanKnowledge(cwd) {
  const kdir = path.join(cwd, KNOWLEDGE_DIR);
  if (!fs.existsSync(kdir) || !fs.statSync(kdir).isDirectory()) {
    return { exists: false };
  }
  const found = {};
  let totalFiles = 0;
  for (const sub of RECOMMENDED_SUBDIRS) {
    const subdir = path.join(kdir, sub);
    if (fs.existsSync(subdir) && fs.statSync(subdir).isDirectory()) {
      const files = fs.readdirSync(subdir).filter((f) => f.endsWith('.md'));
      if (files.length > 0) {
        found[sub] = files.length;
        totalFiles += files.length;
      }
    }
  }
  return { exists: true, categories: found, totalFiles };
}

function buildContext(scan) {
  if (!scan.exists) {
    return [
      '⚠️  knowledge/ directory not found.',
      '',
      'Recommended structure for @wingx-app/platform consumers:',
      '  knowledge/',
      '    concepts/    — architecture, domain models',
      '    decisions/   — ADRs',
      '    prds/        — product requirements',
      '    lessons/     — gotchas, post-mortems',
      '    domains/     — business rules per domain',
      '    runbooks/    — operational procedures',
      '',
      'Run `wingx bootstrap` to scaffold (when CLI is available).',
    ].join('\n');
  }
  const lines = [`📚 knowledge/ loaded (${scan.totalFiles} docs across ${Object.keys(scan.categories).length} categories):`];
  for (const [cat, count] of Object.entries(scan.categories)) {
    lines.push(`  - ${cat}/ (${count} files)`);
  }
  lines.push('', 'Read relevant files before making changes that touch their domain.');
  return lines.join('\n');
}

async function main() {
  const raw = await readStdin();
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { /* non-JSON input — accept */ }
  const cwd = input.cwd || process.cwd();
  const scan = scanKnowledge(cwd);
  const context = buildContext(scan);
  const response = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`memory-load-check error: ${err.message}\n`);
  process.exit(0);
});
