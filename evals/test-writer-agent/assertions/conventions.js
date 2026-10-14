// "Extend the existing slugify tests": the output must target the existing
// file, keep its `.js` import suffix, and keep EVERY existing input/expected
// pair. The existing file is read at eval time, so this tracks the repo.
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const EXISTING = path.resolve(__dirname, '../../../backend/src/utils/slugify.test.ts');

module.exports = (output) => {
  const existing = fs.readFileSync(EXISTING, 'utf8');
  const pairs = [...existing.matchAll(/slugify\((["'])(.*?)\1\)\)\.toBe\((["'])(.*?)\3\)/g)].map((m) => [m[2], m[4]]);
  const code = lib.extractTestCode(output) || '';
  const heading = (lib.extractHeading(output) || {}).path || '';
  const squash = (t) => t.replace(/\s+/g, ' ');
  const flat = squash(code);
  const lost = pairs.filter(([i, o]) => !(flat.includes(squash(i)) && flat.includes(squash(o)))).map(([i]) => JSON.stringify(i));
  const checks = {
    'targets the existing slugify.test.ts': /(^|\/)src\/utils\/slugify\.test\.ts$/.test(heading),
    'keeps the .js import suffix': /from\s*["']\.\/slugify\.js["']/.test(code),
    [`keeps all ${pairs.length} existing cases${lost.length ? ` (lost: ${lost.join(', ')})` : ''}`]: pairs.length > 0 && lost.length === 0,
  };
  const failed = Object.keys(checks).filter((k) => !checks[k]);
  return {
    pass: failed.length === 0,
    score: 1 - failed.length / Object.keys(checks).length,
    reason: failed.length ? 'Missing: ' + failed.join('; ') : `Extends the existing file, keeps all ${pairs.length} original cases and the .js import`,
  };
};
