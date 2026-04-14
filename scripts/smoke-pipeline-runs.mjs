#!/usr/bin/env node
// Smoke test for Phase 2 pipeline-runs endpoints.
// Reads MC_WORKER_KEY from .env.local at runtime (does not print it).
// Usage: node scripts/smoke-pipeline-runs.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcRoot = join(__dirname, '..');

function loadEnvFile(path, env) {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // missing file is ok
  }
}

// Load both like Next.js: .env first, .env.local overrides
const env = {};
loadEnvFile(join(mcRoot, '.env'), env);
loadEnvFile(join(mcRoot, '.env.local'), env);
const WORKER_KEY = env.MC_WORKER_KEY;
if (!WORKER_KEY) {
  console.error('MC_WORKER_KEY not found in .env.local');
  process.exit(1);
}

const BASE = process.env.MC_BASE_URL || 'http://localhost:3000';
const H_WORKER = { 'x-worker-key': WORKER_KEY, 'Content-Type': 'application/json' };

let passed = 0;
let failed = 0;
const results = [];

async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`✓ ${name}`);
    if (result !== undefined) console.log(`  →`, typeof result === 'string' ? result : JSON.stringify(result));
    passed++;
    return result;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  →`, err.message);
    failed++;
    return null;
  }
}

async function req(method, path, body) {
  const opts = { method, headers: H_WORKER };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${res.status} ${msg}`);
  }
  return json;
}

console.log(`\n🧪 Smoke test: pipeline-runs endpoints @ ${BASE}\n`);

// 1. Setup (creates tables)
await step('POST /api/pipeline-runs/setup', async () => {
  const r = await req('POST', '/api/pipeline-runs/setup');
  if (!r.ok) throw new Error('Setup did not return ok');
  return r.message;
});

// 2. Create a run
const run = await step('POST /api/pipeline-runs (create)', async () => {
  const r = await req('POST', '/api/pipeline-runs', {
    run_type: 'close-sprint',
    title: 'Smoke test sprint 999',
    sprint_number: 999,
    prd_id: 'PRD-031',
    epic_id: 'A',
    triggered_by: 'smoke-test',
    metadata: { test: true },
    steps: [
      { step_id: 'doc-updater', agent: 'doc-updater' },
      { step_id: 'retro-learner', agent: 'retro-learner', parallel_group: 1 },
      { step_id: 'rules-auditor', agent: 'rules-auditor', parallel_group: 1 },
      { step_id: 'git-closer', agent: 'git-closer' },
      { step_id: 'harness-analyst', agent: 'harness-analyst' },
      { step_id: 'report-builder', agent: 'report-builder-mechanical' },
    ],
  });
  if (!r.id) throw new Error('No id returned');
  return `id=${r.id}`;
});

if (!run) {
  console.log('\n❌ Cannot continue without run id. Aborting.');
  process.exit(1);
}

// Extract id from the printed "id=..."
const runId = run.replace('id=', '');

// 3. GET detail
await step('GET /api/pipeline-runs/[id] (after create)', async () => {
  const r = await req('GET', `/api/pipeline-runs/${runId}`);
  if (!r.run) throw new Error('run missing');
  if (!Array.isArray(r.steps) || r.steps.length !== 6) throw new Error(`expected 6 steps, got ${r.steps?.length}`);
  const pending = r.steps.filter(s => s.status === 'pending').length;
  if (pending !== 6) throw new Error(`expected 6 pending, got ${pending}`);
  return `status=${r.run.status} steps=${r.steps.length} pending=${pending}`;
});

// 4. PATCH step running
await step('PATCH step doc-updater running', async () => {
  const r = await req('PATCH', `/api/pipeline-runs/${runId}/steps`, {
    step_id: 'doc-updater',
    status: 'running',
    started_at: new Date().toISOString(),
  });
  return r.ok ? 'ok' : 'failed';
});

// 5. PATCH step ok with tokens
await step('PATCH step doc-updater ok + tokens', async () => {
  await req('PATCH', `/api/pipeline-runs/${runId}/steps`, {
    step_id: 'doc-updater',
    status: 'ok',
    finished_at: new Date().toISOString(),
    duration_ms: 102200,
    input_tokens: 3421,
    output_tokens: 892,
    cache_read_tokens: 1820,
    cache_create_tokens: 0,
    output_summary: 'Updated 7 docs',
  });
  return 'ok';
});

// 6. POST log events
await step('POST /logs/events (batch of 3)', async () => {
  const r = await req('POST', `/api/pipeline-runs/${runId}/logs/events`, {
    events: [
      { step_id: 'doc-updater', event_type: 'step_start', level: 'info', message: 'Step started' },
      { step_id: 'doc-updater', event_type: 'prompt_sent', level: 'debug', message: 'Sending prompt', payload: { tokens: 3421 } },
      { step_id: 'doc-updater', event_type: 'step_end', level: 'info', message: 'Step ended · status: ok' },
    ],
  });
  if (r.inserted !== 3) throw new Error(`expected 3 inserted, got ${r.inserted}`);
  return `inserted=${r.inserted}`;
});

// 7. GET logs
await step('GET /logs/events', async () => {
  const r = await req('GET', `/api/pipeline-runs/${runId}/logs/events`);
  if (!Array.isArray(r.events) || r.events.length !== 3) throw new Error(`expected 3 events, got ${r.events?.length}`);
  return `events=${r.events.length}`;
});

// 8. Finalize remaining steps quickly as ok
for (const sid of ['retro-learner', 'rules-auditor', 'git-closer', 'harness-analyst']) {
  await step(`PATCH step ${sid} ok`, async () => {
    await req('PATCH', `/api/pipeline-runs/${runId}/steps`, {
      step_id: sid,
      status: 'ok',
      finished_at: new Date().toISOString(),
      duration_ms: 50000,
      input_tokens: 2000,
      output_tokens: 500,
    });
    return 'ok';
  });
}

// 9. Final PATCH closes the run via report-builder
await step('PATCH final step (closes run)', async () => {
  await req('PATCH', `/api/pipeline-runs/${runId}/steps`, {
    step_id: 'report-builder',
    status: 'ok',
    finished_at: new Date().toISOString(),
    duration_ms: 20000,
    run_status: 'ok',
  });
  return 'ok';
});

// 10. POST report
await step('POST /report (with harness_health)', async () => {
  const r = await req('POST', `/api/pipeline-runs/${runId}/report`, {
    report: {
      pipeline: { score: 92, notes: 'stable' },
      enforcement: { score: 95 },
      arquitetura: { score: 88 },
      sre: { score: 91 },
      llm_efficiency: { score: 85, notes: 'sonnet everywhere' },
      comparativos: { delta_n1: '+2', delta_n3: '+5' },
    },
    harness_health: {
      sprint_date: '2026-04-13',
      pipeline_pct: 92,
      enforcement_pct: 95,
      architecture_pct: 88,
      sre_security_pct: 91,
      llm_efficiency_pct: 85,
      alerts: null,
      conclusion: 'All green, smoke test',
    },
  });
  return r.ok ? 'ok' : 'failed';
});

// 11. GET detail after close
await step('GET /api/pipeline-runs/[id] (after close)', async () => {
  const r = await req('GET', `/api/pipeline-runs/${runId}`);
  if (r.run.status !== 'ok') throw new Error(`expected ok, got ${r.run.status}`);
  if (!r.run.finished_at) throw new Error('finished_at missing');
  if (!r.run.estimated_cost_usd) throw new Error('estimated_cost_usd missing');
  if (!r.run.metadata?.report) throw new Error('metadata.report missing');
  return `status=${r.run.status} cost=$${r.run.estimated_cost_usd} total_tokens=${r.run.total_tokens}`;
});

// 12. GET list with filters (should contain our run)
await step('GET list filtered by PRD-031', async () => {
  const r = await req('GET', '/api/pipeline-runs?prd=PRD-031&limit=10');
  if (!Array.isArray(r.runs)) throw new Error('runs array missing');
  const found = r.runs.find(x => x.id === runId);
  if (!found) throw new Error('new run not in filtered list');
  if (!r.facets) throw new Error('facets missing');
  return `total=${r.total} facets.prd=${r.facets.prd_ids.length}`;
});

// 13. GET report
await step('GET /report', async () => {
  const r = await req('GET', `/api/pipeline-runs/${runId}/report`);
  if (!r.report?.pipeline) throw new Error('report.pipeline missing');
  return 'ok';
});

// 14. DELETE (worker-key auth is not allowed for DELETE — should 401)
await step('DELETE with worker-key (should 401)', async () => {
  const res = await fetch(`${BASE}/api/pipeline-runs/${runId}`, {
    method: 'DELETE',
    headers: H_WORKER,
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return '401 as expected';
});

console.log(`\n📊 Result: ${passed} passed · ${failed} failed\n`);
console.log(`ℹ️  Run id ${runId} left in DB. To clean up:`);
console.log(`    DELETE FROM pipeline_runs WHERE id = '${runId}';`);
console.log(`    DELETE FROM harness_health_scores WHERE sprint_number = 999;`);

process.exit(failed > 0 ? 1 : 0);
