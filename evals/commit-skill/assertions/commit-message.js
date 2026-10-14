// Validates the ```text block (the commit message) against the skill's
// Conventional Commits rules. Partial credit: score = checks passed / checks run.
//
// Options come from assertion `config` OR the test's `metadata.commit_message`:
//   expectedTypes: ["feat"]           -> type must be one of these
//   forbidStrings: ["sk-ant-..."]     -> none may appear in the message
//
// It also checks that the ```text message is the one actually COMMITTED: when the
// bash block's `git commit` carries an extractable message (-m, -F - with a heredoc,
// or -m "$(cat <<'EOF' ... EOF)"), the text header must equal one of those subjects.
// Otherwise a model could show a perfect message while running `git commit -m "wip"`.
const { textBlock, bashBlock, shellCommands, parseGitArgs } = require('./lib');

/** First lines (subjects) of every commit message in the bash block we can extract. */
function committedSubjects(output) {
  const bash = bashBlock(output);
  if (bash === null) return [];
  const subjects = [];
  for (const c of shellCommands(bash).live) {
    if (!c.isGit || c.sub !== 'commit') continue;
    const p = parseGitArgs('commit', c.args);
    const m = p.messages.find((x) => x.opt === '-m');
    const f = p.messages.find((x) => x.opt === '-F');
    let text = null;
    if (m) {
      const sub = m.value.match(/^\$\(\s*cat\s*<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\s*\)\s*$/);
      text = sub ? sub[2] : m.value;
    } else if (f && f.value === '-' && c.heredocs.length) {
      text = c.heredocs[0].body;
    }
    if (text !== null) subjects.push(text.split('\n').find((l) => l.trim() !== '').trim());
  }
  return subjects.filter(Boolean);
}

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const HEADER_RE = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9-/]*\\))?!?: (.+)$`);
const NON_IMPERATIVE = /^(added|adds|fixed|fixes|updated|updates|removed|removes|changed|changes|implemented|implements|created|creates)\b/i;

module.exports = (output, context) => {
  const meta = (context && context.test && context.test.metadata && context.test.metadata.commit_message) || {};
  const cfg = { ...meta, ...((context && context.config) || {}) };
  const msg = textBlock(output);
  if (msg === null) return { pass: false, score: 0, reason: 'No ```text block containing the commit message' };

  const lines = msg.split('\n');
  const header = lines[0].trim();
  const m = header.match(HEADER_RE);
  const subject = m ? m[3] : '';
  const checks = [
    ['conventional header type(scope): subject', !!m],
    ['header <= 72 chars', header.length <= 72],
    ['no trailing period', !/\.$/.test(header)],
    ['subject starts lowercase', /^[a-z]/.test(subject)],
    ['imperative mood', !!subject && !NON_IMPERATIVE.test(subject)],
    ['blank line then body', lines.length >= 3 && lines[1].trim() === '' && lines.slice(2).join('').trim().length > 0],
  ];
  if (cfg.expectedTypes) checks.push([`type in [${cfg.expectedTypes}]`, !!m && cfg.expectedTypes.includes(m[1])]);
  const committed = committedSubjects(output);
  if (committed.length) checks.push([`text header matches a committed subject [${committed.join(' | ')}]`, committed.includes(header)]);
  for (const s of cfg.forbidStrings || []) checks.push([`message does not contain "${s}"`, !msg.includes(s)]);

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    pass: failed.length === 0,
    score: (checks.length - failed.length) / checks.length,
    reason: `header="${header}" (${header.length} chars)` + (failed.length ? ` FAILED: ${failed.join('; ')}` : ' all checks passed'),
  };
};
