// Promptfoo extension hooks for the agent-sdk-e2e suite.
//
// beforeAll  -> build the disposable sandbox once (fails fast if git is missing)
// beforeEach -> rebuild it from scratch so every test (and every provider) starts
//               from the identical state: staged truncate.ts, untracked .env,
//               diverged origin. Requires maxConcurrency 1 (set in the config).
// afterAll   -> delete the sandbox, bare remote and state file (grading has already
//               happened per test, see evaluateOptions.timeoutMs). Set
//               E2E_KEEP_SANDBOX=1 to keep the last test's sandbox for inspection.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'setup-sandbox.sh');

function rebuild(label) {
  const out = execFileSync('bash', [SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (process.env.E2E_VERBOSE) console.error(`[agent-sdk-e2e:${label}] ${out.trim()}`);
}

async function beforeAll(context) {
  rebuild('beforeAll');
  return context;
}

async function beforeEach(context) {
  rebuild('beforeEach');
  return context;
}

async function afterAll(context) {
  if (process.env.E2E_KEEP_SANDBOX) return context;
  const paths = [
    process.env.E2E_SANDBOX || '/tmp/promptfoo-e2e-sandbox',
    process.env.E2E_REMOTE || '/tmp/promptfoo-e2e-remote.git',
    process.env.E2E_STATE || '/tmp/promptfoo-e2e-state.json',
  ];
  for (const p of paths) {
    // same guard as setup-sandbox.sh: never delete anything outside /tmp/promptfoo-e2e-*
    if (p.startsWith('/tmp/promptfoo-e2e-') && !p.includes('..')) fs.rmSync(p, { recursive: true, force: true });
  }
  return context;
}

module.exports = { beforeAll, beforeEach, afterAll };
