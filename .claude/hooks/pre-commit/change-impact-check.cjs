#!/usr/bin/env node
/**
 * @wingx-app/platform — change-impact-check
 *
 * Tipo: git pre-commit hook (standalone Node.js executable)
 * Uso:
 *   - Via husky: adicionar em .husky/pre-commit
 *   - Standalone: chmod +x + linkar em .git/hooks/pre-commit
 *   - Via wingx CLI: `wingx register` (Week 3)
 *
 * Valida que mudanças em arquivos críticos disparam atualização de docs
 * relacionados. Config via `knowledge/change-impact.yaml` ou
 * `.wingx/change-impact.yaml`.
 *
 * Formato da config (YAML-lite — parser próprio, só subset suportado):
 *
 *   rules:
 *     - when: "src/lib/auth/**"
 *       require: ["knowledge/concepts/auth.md", "docs/api/auth.md"]
 *       reason: "Auth changes must update auth concepts + API docs"
 *       severity: block            # default — fails the commit
 *     - when: "drizzle/schema.ts"
 *       require: ["knowledge/domains/database.md"]
 *       reason: "Schema changes must update DB domain doc"
 *       severity: warn             # prints to stderr but allows commit
 *
 * Se zero config → skip silent (projeto novo).
 * Se config inválida → warning + skip (não bloqueia commit).
 * Se arquivo staged bate em `when` mas nenhum `require` staged → BLOCK.
 *
 * Zero deps — só Node stdlib.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATHS = [
  'knowledge/change-impact.yaml',
  '.wingx/change-impact.yaml',
];

function findConfig(cwd) {
  for (const rel of CONFIG_PATHS) {
    const abs = path.join(cwd, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function parseYamlLite(text) {
  const rules = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  let inRequire = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^rules:\s*$/.test(line)) continue;
    const dashMatch = line.match(/^\s*-\s+when:\s*"?([^"]+)"?\s*$/);
    if (dashMatch) {
      if (current) rules.push(current);
      current = { when: dashMatch[1], require: [], reason: '', severity: 'block' };
      inRequire = false;
      continue;
    }
    if (!current) continue;
    const reqStart = line.match(/^\s+require:\s*\[(.*)\]\s*$/);
    if (reqStart) {
      current.require = reqStart[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      inRequire = false;
      continue;
    }
    if (/^\s+require:\s*$/.test(line)) { inRequire = true; continue; }
    if (inRequire) {
      const item = line.match(/^\s+-\s+"?([^"]+)"?\s*$/);
      if (item) { current.require.push(item[1]); continue; }
      inRequire = false;
    }
    const reasonMatch = line.match(/^\s+reason:\s*"?([^"]*)"?\s*$/);
    if (reasonMatch) { current.reason = reasonMatch[1]; continue; }
    const sevMatch = line.match(/^\s+severity:\s*(block|warn)\s*$/);
    if (sevMatch) { current.severity = sevMatch[1]; continue; }
  }
  if (current) rules.push(current);
  return rules;
}

function globToRegex(glob) {
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (glob[i] === '/') i += 1;
    } else if (c === '*') {
      re += '[^/]*';
      i += 1;
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  re += '$';
  return new RegExp(re);
}

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const cwd = process.cwd();
  const configPath = findConfig(cwd);
  if (!configPath) process.exit(0);

  let rules;
  try {
    const text = fs.readFileSync(configPath, 'utf8');
    rules = parseYamlLite(text);
  } catch (err) {
    process.stderr.write(`change-impact-check: config parse warning (${err.message}) — skipping\n`);
    process.exit(0);
  }
  if (!rules.length) process.exit(0);

  const staged = getStagedFiles();
  if (!staged.length) process.exit(0);

  const violations = [];
  for (const rule of rules) {
    const re = globToRegex(rule.when);
    const triggering = staged.filter((f) => re.test(f));
    if (!triggering.length) continue;
    const missing = rule.require.filter((req) => {
      const reqRe = globToRegex(req);
      return !staged.some((f) => f === req || reqRe.test(f));
    });
    if (missing.length) {
      violations.push({
        pattern: rule.when,
        triggering,
        missing,
        reason: rule.reason || 'docs must be updated alongside code',
        severity: rule.severity || 'block',
      });
    }
  }

  if (!violations.length) process.exit(0);

  const blocks = violations.filter((v) => v.severity === 'block');
  const warns = violations.filter((v) => v.severity === 'warn');

  const fmt = (label, items) => {
    const out = ['', `${label} — docs missing for staged changes`, ''];
    for (const v of items) {
      out.push(`Rule: ${v.pattern}  [${v.severity}]`);
      out.push(`  Triggered by: ${v.triggering.join(', ')}`);
      out.push(`  Missing docs: ${v.missing.join(', ')}`);
      out.push(`  Reason: ${v.reason}`);
      out.push('');
    }
    return out;
  };

  let output = [];
  if (blocks.length) output = output.concat(fmt('⛔ change-impact-check', blocks));
  if (warns.length) output = output.concat(fmt('⚠️  change-impact-check (warn)', warns));

  output.push('Options:');
  output.push('  1. Stage the required docs and commit again.');
  output.push(`  2. If docs are genuinely not applicable, update ${path.basename(configPath)} to narrow the rule.`);
  output.push('  3. Emergency bypass: WINGX_ALLOW_BYPASS=1 git commit ... (documente o motivo).');
  output.push('');

  if (process.env.WINGX_ALLOW_BYPASS === '1' && blocks.length) {
    process.stderr.write(output.join('\n') + '(bypassed via WINGX_ALLOW_BYPASS=1)\n');
    process.exit(0);
  }

  process.stderr.write(output.join('\n'));
  process.exit(blocks.length ? 1 : 0);
}

main();
