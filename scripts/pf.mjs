#!/usr/bin/env node
// Cross-platform promptfoo wrapper used by the root npm `eval:*` scripts.
//
//   node scripts/pf.mjs <promptfoo args...>
//
// It sets the recommended env vars (docs/promptfoo-reference.md, section 0) unless
// you already set them, then runs the promptfoo CLI installed in node_modules with
// the current Node binary. No shell, so it works the same on macOS, Linux and Windows.
// Promptfoo is always run from the repo root, as the reference requires.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const defaults = {
  PROMPTFOO_DISABLE_TELEMETRY: '1',
  PROMPTFOO_DISABLE_UPDATE: '1',
  PROMPTFOO_DISABLE_SHARING: '1',
};
const args = process.argv.slice(2);
// Redteam generation/eval must stay offline (the remote generator needs a promptfoo account).
if (args[0] === 'redteam') {
  defaults.PROMPTFOO_DISABLE_REMOTE_GENERATION = 'true';
  defaults.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
}
const env = { ...defaults, ...process.env };

if (!env.ANTHROPIC_API_KEY && !['view', 'validate', '--help', '-h', '--version'].includes(args[0])) {
  console.warn('[pf] warning: ANTHROPIC_API_KEY is not set; model calls and graders will fail.');
}

const pkgDir = join(root, 'node_modules', 'promptfoo');
let entry;
try {
  const { bin } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  entry = join(pkgDir, typeof bin === 'string' ? bin : bin.promptfoo);
} catch {
  console.error('[pf] promptfoo is not installed. Run `npm install` from the repo root.');
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...args], { cwd: root, env, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
