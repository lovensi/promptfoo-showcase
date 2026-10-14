// Shared helpers for the analyze-command suite (used by prompt.js and grade.js).
const fs = require('fs');
const path = require('path');

const SUITE_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Parse the `files` test var.
 * Format: comma/newline separated entries. Each entry is either
 *   "backend/src/utils/validateTask.ts"            -> real repo file, read at runtime
 *   "backend/src/routes/users.ts=fixtures/users.ts" -> shown to the model as the left path,
 *                                                     content read from the suite fixture on the right
 *   "backend/src/utils/*"                            -> every file directly inside that repo directory,
 *                                                     listed at runtime (so new files are never missed)
 * (A string is used instead of a YAML list because promptfoo expands array vars into a test matrix.)
 */
function parseFiles(filesVar) {
  if (!filesVar) return [];
  return String(filesVar)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      if (entry.endsWith('/*')) {
        const dir = entry.slice(0, -2);
        return fs
          .readdirSync(path.resolve(REPO_ROOT, dir), { withFileTypes: true })
          .filter((d) => d.isFile())
          .map((d) => d.name)
          .sort()
          .map((name) => ({ path: `${dir}/${name}`, abs: path.resolve(REPO_ROOT, dir, name) }));
      }
      const [display, source] = entry.split('=').map((s) => s.trim());
      const abs = source ? path.resolve(SUITE_DIR, source) : path.resolve(REPO_ROOT, display);
      return [{ path: display, abs }];
    });
}

function loadFiles(filesVar) {
  return parseFiles(filesVar).map((f) => ({ path: f.path, content: fs.readFileSync(f.abs, 'utf8') }));
}

/** Extract the first ```json fenced block (or fall back to the raw text). */
function extractJson(output) {
  const m = String(output).match(/```json\s*\n([\s\S]*?)\n?```/);
  return (m ? m[1] : String(output)).trim();
}

function parseReport(output) {
  try {
    return { report: JSON.parse(extractJson(output)) };
  } catch (e) {
    return { error: `Output is not parseable JSON: ${e.message}` };
  }
}

const normalize = (p) => String(p || '').replace(/^\.?\//, '').trim();

module.exports = { REPO_ROOT, SUITE_DIR, parseFiles, loadFiles, extractJson, parseReport, normalize };
