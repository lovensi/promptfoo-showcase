// Checks on the "## Findings" section.
const lib = require('./lib');

/** Clean utilities: Findings must be exactly "None" (no invented bugs). */
function expectNone(output) {
  const f = lib.extractFindings(output);
  if (f === null) return { pass: false, score: 0, reason: 'No Findings section' };
  const ok = lib.findingsIsNone(f);
  return { pass: ok, score: ok ? 1 : 0, reason: ok ? 'Findings: None' : `Reported findings on clean code: ${f.slice(0, 300)}` };
}

/** Planted bug: Findings must name validateTask + the max-length / 80-char issue,
 *  and the test file must contain a clearly-labelled BUG test for it. */
function expectMaxLengthBug(output) {
  const f = lib.extractFindings(output);
  if (f === null) return { pass: false, score: 0, reason: 'No Findings section' };
  const code = lib.extractTestCode(output) || '';
  const checks = {
    'Findings is not None': !lib.findingsIsNone(f),
    'Findings names validateTask': /validateTask/.test(f),
    'Findings mentions the 80-char / max-length limit': /\b80\b|TITLE_MAX_LENGTH|max(imum)?[ -]?length|at most/i.test(f),
    'a test name is labelled BUG': /\b(it|test)\s*\(\s*(["'`])[^"'`]*\bBUG\b/.test(code),
  };
  const failed = Object.keys(checks).filter((k) => !checks[k]);
  return {
    pass: failed.length === 0,
    score: 1 - failed.length / Object.keys(checks).length,
    reason: failed.length ? 'Missing: ' + failed.join('; ') : 'Bug reported in Findings and labelled in the test name',
  };
}

module.exports = { expectNone, expectMaxLengthBug };
