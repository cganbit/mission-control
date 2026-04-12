#!/usr/bin/env node

/**
 * bootstrap-harness-health.js
 *
 * Parses HARNESS_HEALTH_HISTORY.md and syncs scores to MC API.
 * Run once after MC deployment to populate harness_health_scores table.
 *
 * Usage: node bootstrap-harness-health.js [MC_BASE_URL] [MC_WORKER_KEY]
 * Example: node bootstrap-harness-health.js http://localhost:3001 test-key-123
 */

const fs = require('fs');
const path = require('path');

// Config
const MC_BASE_URL = process.env.MC_BASE_URL || process.argv[2] || 'http://localhost:3001';
const MC_WORKER_KEY = process.env.MC_WORKER_KEY || process.argv[3] || '';

if (!MC_WORKER_KEY) {
  console.error('❌ MC_WORKER_KEY não definido. Use: node bootstrap-harness-health.js <url> <key>');
  process.exit(1);
}

// Parse markdown table
function parseHistoryFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Find the table rows (skip header and separators)
  const lines = content.split('\n');
  const rows = [];

  for (const line of lines) {
    // Match table rows starting with |
    if (!line.startsWith('|') || line.includes('---')) continue;

    // Split by | and clean
    const cells = line.split('|').map(c => c.trim()).filter(c => c);

    // Expect: Sprint | Data | Pipeline | Enforcement | Arquitetura | SRE/Security | Alerta | Conclusão
    if (cells.length >= 8) {
      const sprint = parseInt(cells[0], 10);
      const date = cells[1];
      const pipeline = parseInt(cells[2], 10);
      const enforcement = parseInt(cells[3], 10);
      const architecture = parseInt(cells[4], 10);
      const sre = parseInt(cells[5], 10);
      const alerts = cells[6] !== 'Nenhum' ? cells[6] : null;
      const conclusion = cells[7];

      if (!isNaN(sprint) && date) {
        rows.push({
          sprint_number: sprint,
          sprint_date: date,
          pipeline_pct: pipeline,
          enforcement_pct: enforcement,
          architecture_pct: architecture,
          sre_security_pct: sre,
          alerts,
          conclusion
        });
      }
    }
  }

  return rows;
}

// POST to MC API
async function syncToMC(records) {
  console.log(`📊 Syncing ${records.length} sprint records to ${MC_BASE_URL}...`);

  let success = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const response = await fetch(`${MC_BASE_URL}/api/analytics/harness-health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-key': MC_WORKER_KEY
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`  ❌ Sprint ${record.sprint_number}: ${response.status} ${error}`);
        failed++;
      } else {
        const result = await response.json();
        console.log(`  ✅ Sprint ${record.sprint_number}: synced`);
        success++;
      }
    } catch (err) {
      console.error(`  ❌ Sprint ${record.sprint_number}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📈 Result: ${success} success, ${failed} failed`);
  return failed === 0;
}

// Main
async function main() {
  try {
    const historyPath = path.join(__dirname, '..', '..', 'docs', 'HARNESS_HEALTH_HISTORY.md');

    if (!fs.existsSync(historyPath)) {
      console.error(`❌ File not found: ${historyPath}`);
      process.exit(1);
    }

    console.log(`📖 Reading ${historyPath}...`);
    const records = parseHistoryFile(historyPath);

    if (records.length === 0) {
      console.warn('⚠️  No records parsed from file');
      process.exit(0);
    }

    console.log(`✅ Parsed ${records.length} sprint records\n`);

    const success = await syncToMC(records);
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  }
}

main();
