// Prompt builders for the v1-vs-v2 regression showcase.
//
// Nothing here is a pasted copy of a skill. Each builder calls the REAL prompt
// function of the artifact's own suite (evals/commit-skill/prompt.js,
// evals/changelog-skill/prompt.js), so the user turn is byte-identical to what
// those suites send. The v1 builders then swap the system-prompt skill text for
// the archived v1 file in docs/artifact-history/v1/. The only variable between
// the two columns in the viewer is the skill text itself.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const commitPrompt = require('../commit-skill/prompt.js');
const changelogPrompt = require('../changelog-skill/prompt.js');

const SKILLS = {
  commit: {
    v1: path.join(ROOT, 'docs/artifact-history/v1/skills/commit/SKILL.md'),
    v2: path.join(ROOT, '.claude/skills/commit/SKILL.md'),
  },
  changelog: {
    v1: path.join(ROOT, 'docs/artifact-history/v1/skills/changelog/SKILL.md'),
    v2: path.join(ROOT, '.claude/skills/changelog/SKILL.md'),
  },
};

function body(file) {
  const md = fs.readFileSync(file, 'utf8');
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

// Replace the live (v2) skill text inside the system message with the v1 text.
// Both suites embed the stripped body (commit-skill also .trim()s it), so try both.
function swapSkill(messages, skill) {
  const sys = messages.find((m) => m.role === 'system');
  const v2 = body(SKILLS[skill].v2);
  const v1 = body(SKILLS[skill].v1);
  for (const [from, to] of [[v2.trim(), v1.trim()], [v2, v1]]) {
    if (sys.content.includes(from)) {
      sys.content = sys.content.replace(from, () => to);
      return messages;
    }
  }
  throw new Error(`compare-versions: could not locate the live ${skill} skill text in the system prompt`);
}

module.exports.commitV1 = async (ctx) => swapSkill(await commitPrompt(ctx), 'commit');
module.exports.commitV2 = async (ctx) => commitPrompt(ctx);
module.exports.changelogV1 = async (ctx) => swapSkill(await changelogPrompt(ctx), 'changelog');
module.exports.changelogV2 = async (ctx) => changelogPrompt(ctx);
