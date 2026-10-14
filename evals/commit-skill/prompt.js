// Builds the chat prompt for every test: the REAL, current commit skill is loaded
// from .claude/skills/commit/SKILL.md at eval time (frontmatter stripped) and sent as
// the system prompt; the scenario (branch, git status, diff, request) is the user turn.
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/commit/SKILL.md');

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

// Everything returned is Nunjucks-rendered by promptfoo; {% raw %} keeps file text literal.
const raw = (s) => `{% raw %}${s}{% endraw %}`;

module.exports = async function ({ vars }) {
  const skill = stripFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8')).trim();
  const user = [
    `I'm on branch \`${vars.branch}\`. You can't run commands here, so here is my repo state.`,
    '',
    '`git status`:',
    '```',
    String(vars.git_status).trim(),
    '```',
    '',
    '`git diff` (and untracked file contents):',
    '```diff',
    String(vars.git_diff).trim(),
    '```',
    '',
    String(vars.request).trim(),
  ].join('\n');

  return [
    { role: 'system', content: raw(skill) },
    { role: 'user', content: raw(user) },
  ];
};
