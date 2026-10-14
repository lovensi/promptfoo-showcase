// Builds the prompt from the REAL, current .claude/commands/analyze.md on every run.
//  - frontmatter is stripped (it is Claude Code metadata, not instructions)
//  - $ARGUMENTS is substituted with the test's `target` var, exactly like Claude Code does
//  - the targeted files are pasted into the user message (the command's "no tools" path)
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, loadFiles } = require('./lib');

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

// Prefix line numbers the way Claude Code's Read tool does, so reported `line` values are checkable.
const numberLines = (text) =>
  text.replace(/\n$/, '').split('\n').map((l, i) => `${String(i + 1).padStart(4)}\t${l}`).join('\n');

module.exports = async function ({ vars }) {
  const commandPath = path.join(REPO_ROOT, '.claude/commands/analyze.md');
  const target = vars.target || '';
  const body = stripFrontmatter(fs.readFileSync(commandPath, 'utf8')).replaceAll('$ARGUMENTS', target);

  const files = loadFiles(vars.files);
  const fileBlocks = files.length
    ? files.map((f) => `<file path="${f.path}">\n${numberLines(f.content)}\n</file>`).join('\n\n')
    : '(no files were provided — the target did not match any file in the repository)';

  const user = [
    `/analyze ${target}`,
    '',
    'You do not have tool access in this session. These are the contents of every file that matched the target (line numbers prefixed, as the Read tool shows them):',
    '',
    fileBlocks,
    vars.extra ? `\n${vars.extra}` : '',
  ].join('\n');

  // {% raw %} stops promptfoo's Nunjucks pass from touching code like `${...}` or `{{ }}`.
  return [
    { role: 'system', content: `{% raw %}${body}{% endraw %}` },
    { role: 'user', content: `{% raw %}${user}{% endraw %}` },
  ];
};
