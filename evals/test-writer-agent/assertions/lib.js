// Shared helpers for parsing the test-writer's output contract:
//   ### `path/to/file.test.ts`
//   ```ts  ...complete test file...  ```
//   ## Findings  (bullets or exactly "None")
const path = require('path');

const FENCE_RE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;

function fencedBlocks(output) {
  const blocks = [];
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(output)) !== null) {
    blocks.push({ lang: (m[1] || '').toLowerCase(), code: m[2], index: m.index, end: m.index + m[0].length });
  }
  return blocks;
}

function isTsLang(lang) {
  return ['ts', 'typescript', 'tsx'].includes(lang);
}

function testBlocks(output) {
  return fencedBlocks(output).filter((b) => isTsLang(b.lang));
}

/** The complete test file (first ```ts block), or null. */
function extractTestCode(output) {
  const b = testBlocks(output)[0];
  return b ? b.code : null;
}

/** Path from the first `### \`path\`` heading, or null. */
function extractHeading(output) {
  const m = output.match(/^#{1,6}\s+`([^`]+)`\s*$/m);
  return m ? { path: m[1].trim(), index: m.index } : null;
}

/** Text of the "## Findings" section, or null if missing. */
function extractFindings(output) {
  const m = output.match(/^#{1,6}\s*\**Findings\**\s*:?\s*$/im);
  if (!m) return null;
  const rest = output.slice(m.index + m[0].length);
  const next = rest.search(/^#{1,6}\s/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

/** True when Findings says "None", lists no bullets, and no trailing prose line
 *  claims a bug (a note such as "I did not run these tests" is not a finding). */
function findingsIsNone(findings) {
  if (findings == null) return false;
  const lines = findings.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!(lines.length > 0 && /^[*_`]*none\.?[*_`]*$/i.test(lines[0]))) return false;
  if (lines.some((l) => /^([-*+]|\d+\.)\s/.test(l))) return false;
  // A prose "None. However, X has a bug..." is still a bug report.
  return !lines.slice(1).some((l) => /\b(bugs?|defects?|incorrect(ly)?|wrong(ly)?|broken)\b/i.test(l) &&
    !/\bno (suspected )?(bugs?|defects?)\b|\bnot (a )?bugs?\b/i.test(l));
}

const TEST_FILE_RE = /(\.(test|spec)\.tsx?$)|(\/__tests__\/)/;

function isTestPath(p) {
  return TEST_FILE_RE.test(p);
}

function asList(v) {
  // Comma-separated string (array vars would be expanded by promptfoo into
  // one test per element, so multi-file lists are passed as "a.ts, b.ts").
  if (!v) return [];
  return (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
}

/** Directory (repo-relative) where the colocated test for the first source file should live. */
function expectedTestDir(vars) {
  const src = asList(vars.source_files)[0];
  return src ? path.posix.dirname(src) : null;
}

module.exports = {
  fencedBlocks,
  testBlocks,
  extractTestCode,
  extractHeading,
  extractFindings,
  findingsIsNone,
  isTestPath,
  isTsLang,
  asList,
  expectedTestDir,
};
