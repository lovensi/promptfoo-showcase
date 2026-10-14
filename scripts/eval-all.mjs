#!/usr/bin/env node
// Runs the fast, cheap suites one after another and prints a summary.
// promptfoo exits non-zero whenever ANY test fails (by design, for CI), so a plain
// `a && b && c` chain would stop at the first suite with a legitimate failure
// (e.g. select-best in analyze-command fails 2/3 by design). This runner keeps going.
//
// Excluded on purpose (slow / costlier): agent-sdk-e2e (`npm run eval:e2e`) and
// redteam (`npm run eval:redteam`).
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pf = join(root, 'scripts', 'pf.mjs');
const suites = ['commit-skill', 'changelog-skill', 'test-writer-agent', 'analyze-command', 'compare-versions'];
const extra = process.argv.slice(2); // e.g. --filter-providers haiku

const results = [];
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [pf, 'eval', '-c', `evals/${s}/promptfooconfig.yaml`, '--no-cache', ...extra], {
    cwd: root,
    stdio: 'inherit',
  });
  results.push({ suite: s, code: r.status ?? 1, secs: Math.round((Date.now() - t0) / 1000) });
}

console.log('\n=== summary (exit 0 = every test passed) ===');
for (const r of results) console.log(`${r.suite.padEnd(20)} exit ${String(r.code).padEnd(4)} ${r.secs}s`);
console.log('Open the results with: npm run eval:view');
process.exit(results.every((r) => r.code === 0) ? 0 : 1);
