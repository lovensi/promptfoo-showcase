// Prompt builder for the changelog-skill suite.
// Loads the REAL skill from .claude/skills/changelog/SKILL.md at runtime (frontmatter stripped),
// so the eval always tests the current artifact - never a pasted copy.
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/changelog/SKILL.md');

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

module.exports = async function ({ vars }) {
  const skill = stripFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  const request =
    vars.request || 'Write the changelog entry for these commits (git log --oneline v1.3.0..HEAD):';
  const commits = vars.commits || '';
  return [
    {
      role: 'system',
      // {% raw %} keeps Nunjucks from touching any {{ }} inside the skill text.
      content:
        'You are Claude Code running the "changelog" skill below. You have NO tool access in this ' +
        'session; work only from the commits the user provides.\n\n' +
        `{% raw %}${skill}{% endraw %}`,
    },
    {
      role: 'user',
      content: `{% raw %}${request}\n\n${commits}{% endraw %}`.trim(),
    },
  ];
};
