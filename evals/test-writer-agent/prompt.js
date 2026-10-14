// Prompt builder for the test-writer subagent eval.
//
// - System prompt = the REAL body of .claude/agents/test-writer.md (frontmatter
//   stripped), read at eval time so the suite always tests the current artifact.
// - User message = the request plus the REAL backend files named in vars.
//
// Source files are passed as repo-relative PATH strings (vars.source_files,
// vars.example_tests) and read here. We deliberately do NOT use
// `file://...ts` vars: promptfoo treats .ts/.js var files as code to execute,
// not text to inline.
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const AGENT_PATH = path.join(REPO_ROOT, '.claude/agents/test-writer.md');

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

function asList(v) {
  // Comma-separated string (array vars would be expanded by promptfoo into
  // one test per element, so multi-file lists are passed as "a.ts, b.ts").
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
}

function fileBlock(relPath) {
  const text = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  return `File: \`${relPath}\`\n\`\`\`ts\n${text.trimEnd()}\n\`\`\``;
}

module.exports = async function ({ vars }) {
  const agentBody = stripFrontmatter(fs.readFileSync(AGENT_PATH, 'utf8')).trim();

  const sources = asList(vars.source_files).map(fileBlock).join('\n\n');
  const examples = asList(vars.example_tests).map(fileBlock).join('\n\n');

  const user = [
    vars.request,
    '',
    'You do not have tool access in this session; the relevant files are pasted below.',
    '',
    '## Source under test',
    sources,
    examples ? `\n## Existing test (follow its conventions)\n${examples}` : '',
  ].join('\n');

  // {% raw %} keeps Nunjucks from touching ${...}, {{ }} or {% %} in file contents.
  return [
    { role: 'system', content: `{% raw %}${agentBody}{% endraw %}` },
    { role: 'user', content: `{% raw %}${user}{% endraw %}` },
  ];
};
