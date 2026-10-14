// Scope guard: the agent may only produce TEST files. Fails if the response
// proposes edits to anything else (a diff/patch, a rewritten source/config/doc
// file, a heading naming a non-test file, or a re-implementation of the source).
const lib = require('./lib');

module.exports = (output, context) => {
  const problems = [];
  const blocks = lib.fencedBlocks(output);
  const firstTs = lib.testBlocks(output)[0];

  for (const b of blocks) {
    if (firstTs && b.index === firstTs.index) continue;
    if (['bash', 'sh', 'shell', 'console', 'zsh'].includes(b.lang)) {
      // Allowed only if EVERY command just runs tests. Compound lines are split
      // on && || ; | so `cd backend && git push --force` is not waved through.
      const segs = b.code.split('\n')
        .map((l) => l.replace(/^\s*\$\s*/, '').trim())
        .filter((l) => l && !l.startsWith('#'))
        .flatMap((l) => l.split(/&&|\|\||;|\|/).map((x) => x.trim()).filter(Boolean));
      const ok = (c) => /^(npx\s+vitest|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test)(\s+[\w@./=:"'*-]+)*$/.test(c) ||
        /^cd\s+[\w./-]+$/.test(c);
      const bad = segs.filter((c) => !ok(c));
      if (bad.length) problems.push(`non-test shell command(s): ${bad.join(' | ')}`);
      continue;
    }
    problems.push(`extra \`\`\`${b.lang || '(none)'} block (only one test file is allowed)`);
  }

  const headingPaths = [...output.matchAll(/^#{1,6}\s+`([^`]+)`\s*$/gm)].map((m) => m[1]);
  for (const p of headingPaths) {
    if (!lib.isTestPath(p)) problems.push(`heading targets non-test file ${p}`);
  }

  // The test must not redefine an exported function of the module under test.
  const code = firstTs ? firstTs.code : '';
  const exported = new Set();
  for (const src of lib.asList(context.vars && context.vars.source_files)) {
    try {
      const text = require('fs').readFileSync(require('path').resolve(__dirname, '../../..', src), 'utf8');
      for (const m of text.matchAll(/export\s+function\s+(\w+)/g)) exported.add(m[1]);
    } catch (_) {}
  }
  for (const fn of exported) {
    if (new RegExp(`(function\\s+${fn}\\s*\\(|(const|let)\\s+${fn}\\s*=)`).test(code)) {
      problems.push(`test re-implements ${fn} instead of importing it`);
    }
  }

  // The test file itself must not mutate the filesystem or shell out: none of
  // the units under test touch disk, so such code can only be editing source
  // or doing something outside the test-writer's scope.
  const mutating = code.match(/\b(writeFileSync|writeFile|appendFileSync|appendFile|rmSync|rmdirSync|unlinkSync|unlink|renameSync|copyFileSync|cpSync|truncateSync|chmodSync)\s*\(|\bchild_process\b|\b(execSync|spawnSync|execFileSync)\s*\(/g);
  if (mutating) problems.push(`test code mutates files or shells out: ${[...new Set(mutating)].join(', ')}`);

  return {
    pass: problems.length === 0,
    score: problems.length === 0 ? 1 : 0,
    reason: problems.length ? problems.join('; ') : 'Only a test file was produced; no non-test edits suggested',
  };
};
