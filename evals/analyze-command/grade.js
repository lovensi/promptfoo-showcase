// Custom JavaScript assertions for the /analyze command. Each export returns {pass, score, reason}.
const { parseFiles, loadFiles, parseReport, normalize } = require('./lib');

const SEV = { info: 0, low: 1, medium: 2, high: 3 };
const fail = (reason) => ({ pass: false, score: 0, reason });
const ok = (reason) => ({ pass: true, score: 1, reason });

function withReport(output, fn) {
  const { report, error } = parseReport(output);
  if (error) return fail(error);
  if (!Array.isArray(report.findings)) return fail('findings is not an array');
  return fn(report);
}

/** Output contract: exactly one ```json fence and no prose before/after. */
function singleJsonBlock(output) {
  const raw = String(output).trim();
  const fences = (raw.match(/```/g) || []).length;
  const wrapped = /^```json\s*\n[\s\S]*\n```$/.test(raw);
  return wrapped && fences === 2
    ? ok('Exactly one ```json block, no surrounding prose')
    : fail(`Expected only one fenced json block; fences=${fences}, starts=${JSON.stringify(raw.slice(0, 30))}, ends=${JSON.stringify(raw.slice(-30))}`);
}

/** metrics.findings_count === findings.length */
function findingsCount(output) {
  return withReport(output, (r) => {
    const n = r.findings.length;
    const c = r.metrics && r.metrics.findings_count;
    return c === n ? ok(`findings_count=${c} matches findings.length`) : fail(`findings_count=${c} but findings.length=${n}`);
  });
}

/** metrics.files_analyzed === number of files actually provided */
function filesAnalyzed(output, context) {
  const expected = parseFiles(context.vars.files).length;
  return withReport(output, (r) => {
    const got = r.metrics && r.metrics.files_analyzed;
    return got === expected ? ok(`files_analyzed=${got}`) : fail(`files_analyzed=${got}, expected ${expected} (files provided)`);
  });
}

/** Every finding.file must be one of the provided files — no hallucinated paths. */
function noInventedFiles(output, context) {
  const allowed = parseFiles(context.vars.files).map((f) => normalize(f.path));
  return withReport(output, (r) => {
    const invented = r.findings.map((f) => normalize(f.file)).filter((f) => !allowed.includes(f));
    return invented.length === 0
      ? ok(`All ${r.findings.length} findings reference provided files`)
      : fail(`Invented/unknown files: ${[...new Set(invented)].join(', ')} (allowed: ${allowed.join(', ') || 'none'})`);
  });
}

/** risk_level must equal the max finding severity (info counts as low). */
function riskMatchesSeverity(output) {
  return withReport(output, (r) => {
    const max = Math.max(-1, ...r.findings.map((f) => SEV[f.severity] ?? -1));
    const expected = max >= 3 ? 'high' : max === 2 ? 'medium' : 'low';
    return r.risk_level === expected
      ? ok(`risk_level=${r.risk_level} consistent with findings`)
      : fail(`risk_level=${r.risk_level} but max severity implies ${expected}`);
  });
}

/** Planted bug: validateTask.ts line 39 uses `>=` so an 80-char title is rejected (spec says inclusive).
 *  The finding must be about the MAXIMUM check (line 39/40 or explicit max-length wording) AND carry
 *  off-by-one evidence. A generic "boundary" finding about the (correct) minimum check does not count. */
function detectsPlantedBug(output) {
  return withReport(output, (r) => {
    const hits = r.findings.filter((f) => normalize(f.file).endsWith('validateTask.ts'));
    const text = (f) => `${f.description} ${f.recommendation}`;
    const aboutMax = (f) =>
      f.line === 39 || f.line === 40 ||
      /TITLE_MAX_LENGTH|\b80\b|\b81\b|max(imum)?[- ]length|at most/i.test(text(f));
    const offByOne = (f) =>
      /off[- ]by[- ]one|>=|inclusive|exactly 80|80[- ]char|\b81\b|strictly greater|greater than/i.test(text(f));
    const aboutMin = (f) => !aboutMax(f) && /TITLE_MIN_LENGTH|min(imum)?[- ]length|at least/i.test(text(f));
    const match = hits.find((f) => aboutMax(f) && !aboutMin(f) && offByOne(f) &&
      (f.category === 'bug' || /off[- ]by[- ]one|inclusive/i.test(text(f))));
    if (!match) return fail(`Planted max-length off-by-one in validateTask.ts not reported (${hits.length} validateTask findings)`);
    if ((SEV[match.severity] ?? 0) < SEV.medium) {
      return { pass: false, score: 0.5, reason: `Bug found but severity="${match.severity}" (< medium): ${match.description}` };
    }
    return ok(`Found [${match.severity}/${match.category}] line ${match.line}: ${match.description}`);
  });
}

/** Every non-null finding.line must exist in the referenced file (no invented line numbers). */
function linesInRange(output, context) {
  const lengths = Object.fromEntries(
    loadFiles(context.vars.files).map((f) => [normalize(f.path), f.content.replace(/\n$/, '').split('\n').length]),
  );
  return withReport(output, (r) => {
    const bad = r.findings
      .filter((f) => f.line != null && lengths[normalize(f.file)] != null)
      .filter((f) => !Number.isInteger(f.line) || f.line < 1 || f.line > lengths[normalize(f.file)])
      .map((f) => `${f.file}:${f.line} (file has ${lengths[normalize(f.file)]} lines)`);
    return bad.length ? fail(`Line numbers outside the file: ${bad.join(', ')}`) : ok('All line numbers exist in their files');
  });
}

/** Clean code: low risk, at most 2 findings, nothing medium or above. */
function cleanCodeIsQuiet(output) {
  return withReport(output, (r) => {
    const serious = r.findings.filter((f) => (SEV[f.severity] ?? 0) >= SEV.medium);
    const issues = [];
    if (r.risk_level !== 'low') issues.push(`risk_level=${r.risk_level}`);
    if (r.findings.length > 2) issues.push(`${r.findings.length} findings (padding?)`);
    if (serious.length) issues.push(`serious: ${serious.map((f) => `${f.severity}:${f.description}`).join(' | ')}`);
    return issues.length ? fail(issues.join('; ')) : ok(`risk=low with ${r.findings.length} minor finding(s)`);
  });
}

/** At least one high-severity security finding. With assertion `config.mustCover: {label: regex}`,
 *  EVERY listed issue must be matched by some high/security finding (description + recommendation). */
function highSecurityFinding(output, context) {
  const cover = (context && context.config && context.config.mustCover) || {};
  return withReport(output, (r) => {
    const sec = r.findings.filter((f) => f.category === 'security' && f.severity === 'high');
    if (!sec.length) {
      return fail(`No high-severity security finding; got: ${r.findings.map((f) => `${f.severity}/${f.category}`).join(', ') || 'none'}`);
    }
    const missing = Object.entries(cover)
      .filter(([, re]) => !sec.some((f) => new RegExp(re, 'i').test(`${f.description} ${f.recommendation}`)))
      .map(([label]) => label);
    return missing.length
      ? fail(`High security findings miss: ${missing.join(', ')}; got: ${sec.map((f) => f.description.slice(0, 60)).join(' | ')}`)
      : ok(`${sec.length} high security finding(s): ${sec.map((f) => f.description.slice(0, 60)).join(' | ')}`);
  });
}

/** Missing target contract: 0 files, empty findings, low risk, next_steps suggests a path. */
function missingTargetContract(output) {
  return withReport(output, (r) => {
    const issues = [];
    if (r.metrics?.files_analyzed !== 0) issues.push(`files_analyzed=${r.metrics?.files_analyzed}`);
    if (r.findings.length !== 0) issues.push(`${r.findings.length} findings (should be empty)`);
    if (r.risk_level !== 'low') issues.push(`risk_level=${r.risk_level}`);
    const steps = Array.isArray(r.next_steps) ? r.next_steps : [];
    // must name a concrete path-like token (e.g. backend/src/routes/), not just contain a slash like "N/A"
    if (!steps.some((s) => /(?:[\w.-]+\/){2,}|\b(?:backend|frontend|src)\/|\b[\w-]+\.(?:ts|tsx|js)\b/.test(s))) issues.push('next_steps does not suggest a concrete path');
    return issues.length ? fail(issues.join('; ')) : ok('Empty report with path suggestion, as specified');
  });
}

module.exports = {
  singleJsonBlock,
  findingsCount,
  filesAnalyzed,
  noInventedFiles,
  riskMatchesSeverity,
  linesInRange,
  detectsPlantedBug,
  cleanCodeIsQuiet,
  highSecurityFinding,
  missingTargetContract,
};
