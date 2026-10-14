// Deterministic check of the test-writer OUTPUT CONTRACT and test-quality rules.
// Score = fraction of checks passed; pass only if every check passes.
const path = require('path');
const lib = require('./lib');

module.exports = (output, context) => {
  const vars = context.vars || {};
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

  const heading = lib.extractHeading(output);
  const blocks = lib.testBlocks(output);
  const code = blocks[0] ? blocks[0].code : '';
  const findings = lib.extractFindings(output);

  add('exactly one ```ts block', blocks.length === 1, `found ${blocks.length}`);
  add('heading with backticked path', !!heading);
  add('heading path is a *.test.ts file', heading && /\.test\.tsx?$/.test(heading.path), heading && heading.path);

  const dir = lib.expectedTestDir(vars);
  if (dir && heading) {
    // Accept repo-relative (backend/src/x.test.ts, as in the agent's output
    // format) and backend-relative (src/x.test.ts, as in its colocation rule).
    const hd = path.posix.dirname(heading.path.replace(/^\.\//, ''));
    add('test is colocated with source', hd === dir || `backend/${hd}` === dir,
      `expected dir ${dir}, got ${heading.path}`);
  }
  add('heading comes before the code block', heading && blocks[0] && heading.index < blocks[0].index);

  add('imports from "vitest"', /import\s*\{[^}]*\}\s*from\s*["']vitest["']/.test(code));
  add('uses describe()', /\bdescribe\s*\(/.test(code));
  add('uses it()/test()', /\b(it|test)\s*\(/.test(code));
  const expectCount = (code.match(/\bexpect\s*\(/g) || []).length;
  add('has explicit expect() assertions', expectCount >= 3, `expect count ${expectCount}`);
  const snapshotCount = (code.match(/toMatch(Inline)?Snapshot/g) || []).length;
  add('not snapshot-only', snapshotCount < expectCount, `snapshots ${snapshotCount}/${expectCount}`);
  add('no .only / .skip / .todo', !/\b(describe|it|test)\.(only|skip|todo)\b|\b(xit|xdescribe|fit|fdescribe)\s*\(/.test(code));

  // Must import the real module, not re-implement the function inside the test.
  const src = lib.asList(vars.source_files)[0];
  if (src) {
    const base = path.posix.basename(src).replace(/\.tsx?$/, '');
    add(`imports ./${base} relatively`, new RegExp(`from\\s*["']\\./${base}(\\.js|\\.ts)?["']`).test(code));
  }

  add('has a "## Findings" section', findings !== null);
  add('Findings comes after the code block', findings !== null && blocks[0] &&
    output.search(/^#{1,6}\s*\**Findings/im) > blocks[0].index);

  const failed = checks.filter((c) => !c.ok);
  return {
    pass: failed.length === 0,
    score: checks.length ? (checks.length - failed.length) / checks.length : 0,
    reason: failed.length
      ? 'Failed: ' + failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')
      : `All ${checks.length} contract checks passed`,
  };
};
