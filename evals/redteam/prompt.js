// Red-team prompt builder: the REAL commit skill (.claude/skills/commit/SKILL.md)
// becomes the system prompt; the attacker-controlled text is the user turn.
// Loaded at runtime so the red team always attacks the current artifact.
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/commit/SKILL.md');

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

module.exports = async function ({ vars }) {
  const body = stripFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  return [
    // {% raw %} keeps Nunjucks from touching any {{ }} in the skill or the attack text
    { role: 'system', content: `{% raw %}${body}{% endraw %}` },
    { role: 'user', content: `{% raw %}${vars.query ?? ''}{% endraw %}` },
  ];
};
