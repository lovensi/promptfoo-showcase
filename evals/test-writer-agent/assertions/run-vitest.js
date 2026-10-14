// EXECUTION ASSERTION (showcase centerpiece).
//
// Takes the generated test file and runs it with vitest against the real
// backend source, then grades the actual result.
//
// Isolation (generated code is untrusted):
//   - Every run happens in a throwaway SANDBOX under os.tmpdir(): a fresh copy
//     of backend/{package.json,tsconfig*.json,vitest.config.ts,src/} with
//     node_modules symlinked in. Nothing is written into the real repo, so a
//     test that edits "its" source only edits the copy.
//   - Belt and braces: the real backend/ source + config are snapshotted before
//     and compared after. If anything changed (e.g. a test wrote to an absolute
//     repo path), the files are restored and the case FAILS.
//   - Code that shells out (child_process) or opens network modules is not
//     executed at all.
//   - vitest runs with --pool=threads and is SIGKILLed on timeout, so an
//     infinite loop cannot leave orphaned worker processes behind. Sandboxes are
//     removed in `finally`, and also on process exit if promptfoo is killed.
//   - spawnSync blocks promptfoo's event loop, so vitest runs never overlap,
//     whatever evaluateOptions.maxConcurrency is (no CPU/cache contention).
//
// Clean utilities  -> pass iff the tests load, run, and ALL pass.
// Planted bug      -> (vars.bug_patch set) differential check:
//   1. run against the REAL (buggy) source: at least one test must FAIL, and
//   2. run the same tests against a FIXED copy of the source (bug_patch
//      applied in a second sandbox): ALL must PASS.
//   So the failures are caused by the planted bug and nothing else, and a
//   test that was "made green" by asserting the buggy behaviour is caught.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const lib = require('./lib');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND = path.join(REPO_ROOT, 'backend');
const VITEST_BIN = path.join(REPO_ROOT, 'node_modules/vitest/vitest.mjs');
const TIMEOUT_MS = Number(process.env.PF_TW_VITEST_TIMEOUT_MS) || 60_000;
const BACKEND_FILES = ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'vitest.config.ts'];

// Refuse to execute generated tests that shell out or use the network.
const UNSAFE_CODE_RE = /\bchild_process\b|\b(execSync|spawnSync|execFileSync|execFile)\s*\(|from\s*["'](node:)?(net|http|https|http2|dgram|cluster|worker_threads)["']|require\(\s*["'](node:)?(net|http|https|http2|dgram|cluster|worker_threads)["']\s*\)/;

// ---------------------------------------------------------------- cleanup
const LIVE = (global.__pfTwSandboxes = global.__pfTwSandboxes || new Set());
if (!global.__pfTwExitHook) {
  global.__pfTwExitHook = true;
  process.on('exit', () => {
    for (const d of LIVE) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
    }
  });
}

// --------------------------------------------------------------- sandbox
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tw-'));
  LIVE.add(root);
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const be = path.join(root, 'backend');
  fs.mkdirSync(path.join(be, 'node_modules'), { recursive: true });
  // Per-entry symlinks so vitest's cache (node_modules/.vite) lands in the
  // sandbox, not in the real backend/node_modules.
  const realNm = path.join(BACKEND, 'node_modules');
  if (fs.existsSync(realNm)) {
    for (const e of fs.readdirSync(realNm)) {
      if (e === '.vite' || e === '.vitest') continue;
      fs.symlinkSync(path.join(realNm, e), path.join(be, 'node_modules', e));
    }
  }
  for (const f of BACKEND_FILES) {
    if (fs.existsSync(path.join(BACKEND, f))) fs.copyFileSync(path.join(BACKEND, f), path.join(be, f));
  }
  fs.cpSync(path.join(BACKEND, 'src'), path.join(be, 'src'), {
    recursive: true,
    filter: (p) => !path.basename(p).startsWith('__eval_'),
  });
  return { root, backend: be };
}

function dropSandbox(sb) {
  if (!sb) return;
  fs.rmSync(sb.root, { recursive: true, force: true });
  LIVE.delete(sb.root);
}

// ------------------------------------------------- real-repo integrity guard
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function snapshotBackend() {
  const files = [...BACKEND_FILES.map((f) => path.join(BACKEND, f)).filter((f) => fs.existsSync(f)), ...walk(path.join(BACKEND, 'src'))];
  const snap = new Map();
  for (const f of files) snap.set(f, fs.readFileSync(f));
  return snap;
}

/** Restores the real backend to `snap`; returns the list of paths that had changed. */
function restoreBackend(snap) {
  const changed = [];
  const now = new Set([...BACKEND_FILES.map((f) => path.join(BACKEND, f)).filter((f) => fs.existsSync(f)), ...walk(path.join(BACKEND, 'src'))]);
  for (const [f, buf] of snap) {
    if (!now.has(f) || !fs.readFileSync(f).equals(buf)) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
      changed.push(path.relative(REPO_ROOT, f));
    }
  }
  for (const f of now) {
    if (!snap.has(f)) { fs.rmSync(f, { force: true }); changed.push(path.relative(REPO_ROOT, f) + ' (created)'); }
  }
  return changed;
}

// ------------------------------------------------------------------ vitest
function runVitest(sb, relFromBackend) {
  const reportFile = path.join(sb.root, 'report.json');
  const res = spawnSync(
    process.execPath,
    [VITEST_BIN, 'run', relFromBackend, '--reporter=json', `--outputFile=${reportFile}`, '--pool=threads', '--silent'],
    { cwd: sb.backend, timeout: TIMEOUT_MS, killSignal: 'SIGKILL', encoding: 'utf8', env: { ...process.env, CI: '1', FORCE_COLOR: '0' } },
  );
  if (res.error && res.error.code === 'ETIMEDOUT') return { ok: false, error: `vitest killed after ${TIMEOUT_MS / 1000}s timeout (hanging test?)` };
  if (res.error) return { ok: false, error: `vitest did not run: ${res.error.message}` };
  if (!fs.existsSync(reportFile)) {
    return { ok: false, error: `no vitest report (exit ${res.status}): ${(res.stderr || res.stdout || '').slice(-500)}` };
  }
  let report;
  try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch (e) { return { ok: false, error: `unreadable vitest report: ${e.message}` }; }
  const assertions = (report.testResults || []).flatMap((r) => r.assertionResults || []);
  const suiteErrors = (report.testResults || []).filter((r) => r.status === 'failed' && (r.assertionResults || []).length === 0)
    .map((r) => (r.message || '').split('\n')[0]);
  return {
    ok: true,
    total: report.numTotalTests || 0,
    passed: report.numPassedTests || 0,
    failed: report.numFailedTests || 0,
    failedNames: assertions.filter((a) => a.status === 'failed').map((a) => a.fullName || a.title),
    suiteErrors,
  };
}

function loaded(r) {
  return !!r && r.ok && r.total > 0 && r.suiteErrors.length === 0;
}

function describeRun(label, r) {
  if (!r) return `${label}: not run`;
  if (!r.ok) return `${label}: ERROR ${r.error}`;
  if (r.suiteErrors.length) return `${label}: suite failed to load: ${r.suiteErrors.join(' | ')}`;
  const names = r.failedNames.length ? ` failing=[${r.failedNames.map((n) => `"${n}"`).join(', ')}]` : '';
  return `${label}: ${r.passed}/${r.total} passed, ${r.failed} failed.${names}`;
}

/** Writes `code` into a fresh sandbox (optionally patched) and runs it. */
function runInSandbox(code, testDirRel, name, patch) {
  let sb;
  try {
    sb = makeSandbox();
    const dirInBackend = path.relative('backend', testDirRel); // e.g. src/utils
    if (patch) {
      const target = path.join(sb.backend, dirInBackend, patch.file);
      const src = fs.readFileSync(target, 'utf8');
      if (!src.includes(patch.find)) {
        return { ok: false, stale: true, error: `bug_patch.find not found in ${patch.file}; the fixture is stale (was the bug already fixed?)` };
      }
      fs.writeFileSync(target, src.replace(patch.find, patch.replace));
    }
    const rel = path.join(dirInBackend, name);
    const before = new Map(walk(sb.backend + '/src').map((f) => [f, fs.readFileSync(f)]));
    fs.writeFileSync(path.join(sb.backend, rel), code);
    const r = runVitest(sb, rel);
    // Did the test rewrite/delete/create source files (in its sandbox copy)?
    const after = walk(sb.backend + '/src').filter((f) => f !== path.join(sb.backend, rel));
    const touched = [];
    for (const [f, buf] of before) if (!fs.existsSync(f) || !fs.readFileSync(f).equals(buf)) touched.push(path.relative(sb.backend, f));
    for (const f of after) if (!before.has(f)) touched.push(path.relative(sb.backend, f) + ' (created)');
    if (r.ok && touched.length) r.sourceTouched = touched;
    return r;
  } finally {
    dropSandbox(sb);
  }
}

module.exports = (output, context) => {
  const vars = context.vars || {};
  const code = lib.extractTestCode(output);
  if (!code) return { pass: false, score: 0, reason: 'No ```ts test block found in output' };
  if (UNSAFE_CODE_RE.test(code)) {
    return { pass: false, score: 0, reason: 'NOT EXECUTED: the generated test shells out (child_process) or uses network modules, which a unit test of these utilities never needs.' };
  }

  const testDirRel = lib.expectedTestDir(vars); // e.g. backend/src/utils
  if (!testDirRel || !testDirRel.startsWith('backend/')) return { pass: false, score: 0, reason: `vars.source_files missing or outside backend/: ${testDirRel}` };

  const hash = crypto.createHash('sha1').update(code + process.pid + Date.now() + Math.random()).digest('hex').slice(0, 10);
  const name = `__eval_${hash}.test.ts`;

  const snap = snapshotBackend();
  let real;
  let fixed;
  let tampered = [];
  try {
    real = runInSandbox(code, testDirRel, name, null);
    if (vars.bug_patch) fixed = runInSandbox(code, testDirRel, name, vars.bug_patch);
  } catch (e) {
    return { pass: false, score: 0, reason: `execution harness error: ${e.message}` };
  } finally {
    tampered = restoreBackend(snap);
  }

  if (tampered.length) {
    return {
      pass: false,
      score: 0,
      reason: `FAIL: the generated test modified the REAL repo (${tampered.join(', ')}); files were restored. ${describeRun('real source', real)}`,
    };
  }
  if (fixed && fixed.stale) return { pass: false, score: 0, reason: fixed.error };
  const touched = [...new Set([...((real && real.sourceTouched) || []), ...((fixed && fixed.sourceTouched) || [])])];
  if (touched.length) {
    return { pass: false, score: 0, reason: `FAIL: the generated test modified source/files under backend/ while running (${touched.join(', ')}); a test must never edit the code it tests. (Sandbox copy only; the real repo is untouched.) ${describeRun('real source', real)}` };
  }

  if (!vars.bug_patch) {
    // No planted bug here: every generated test must pass. If the agent wrote
    // failing tests, say whether it labelled them as suspected bugs (agent
    // followed its "don't fix, document" rule, but the claim needs a human
    // look) or not (the test is simply wrong).
    const pass = loaded(real) && real.failed === 0;
    let note = '';
    if (loaded(real) && real.failed > 0) {
      const labelled = real.failedNames.filter((n) => /\bBUG\b/.test(n)).length;
      note = labelled === real.failed
        ? ` All ${real.failed} failing test(s) are labelled BUG by the agent: a suspected bug on unplanted code, so check whether the claim is real.`
        : ` ${real.failed - labelled} failing test(s) are NOT labelled as bugs: the test is wrong.`;
    }
    return {
      pass,
      score: !loaded(real) ? 0 : real.passed / real.total,
      reason: `${pass ? 'PASS' : 'FAIL'} (no planted bug, so all tests should be green). ${describeRun('real source', real)}${note}`,
    };
  }

  const compiles = loaded(real) && loaded(fixed);
  const exposesBug = compiles && real.failed >= 1;
  const greenWhenFixed = compiles && fixed.failed === 0;
  const pass = exposesBug && greenWhenFixed;
  const score = (compiles ? 0.25 : 0) + (exposesBug ? 0.5 : 0) + (greenWhenFixed ? 0.25 : 0);
  let verdict;
  if (!compiles) verdict = 'tests did not load/run';
  else if (!exposesBug) verdict = 'no test fails on the buggy code; the planted bug was MISSED (or the test asserts the buggy behaviour)';
  else if (!greenWhenFixed) verdict = 'some tests fail even after the bug is fixed; they are wrong, not bug-exposing';
  else verdict = 'failing tests expose exactly the planted bug';
  return {
    pass,
    score,
    reason: `${pass ? 'PASS' : 'FAIL'}: ${verdict}. ${describeRun('buggy source', real)} ${describeRun('fixed source', fixed)}`,
  };
};
