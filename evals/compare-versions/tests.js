// Test loader for the v1-vs-v2 regression showcase.
//
// It REFERENCES the existing suites instead of copying them:
//   - every scenario in evals/commit-skill/tests.yaml, plus that suite's defaultTest
//     asserts (bash_safety, workflow, output_contract, message_format, message_quality),
//   - the prompt-injection scenario from evals/changelog-skill/tests.yaml, plus that
//     suite's defaultTest asserts (format, faithfulness, sections, ...).
// Relative file:// paths are rewritten to absolute paths against the source suite's
// directory, so fixtures, assertion files and transforms are the real ones. Each test
// is pinned to its prompts with `prompts:` so commit scenarios only run against the
// commit-skill columns and the changelog scenario only against the changelog columns.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const EVALS = path.resolve(__dirname, '..');

function load(file) {
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

// Deep-rewrite relative "file://x" strings to "file:///abs/suite/x".
function absolutize(value, baseDir) {
  if (typeof value === 'string') {
    if (value.startsWith('file://')) {
      const rest = value.slice('file://'.length);
      return path.isAbsolute(rest) ? value : `file://${path.resolve(baseDir, rest)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => absolutize(v, baseDir));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolutize(v, baseDir)]));
  }
  return value;
}

function suite(name) {
  const dir = path.join(EVALS, name);
  const config = load(path.join(dir, 'promptfooconfig.yaml'));
  return { dir, defaultAsserts: absolutize(config.defaultTest?.assert ?? [], dir) };
}

module.exports = async function () {
  const commit = suite('commit-skill');
  const changelog = suite('changelog-skill');

  // The config's defaultTest is empty of asserts on purpose: each test carries its
  // own suite's shared asserts, so the two skills never share checks.
  const commitTests = load(path.join(commit.dir, 'tests.yaml')).map((t) => {
    const test = absolutize(t, commit.dir);
    return {
      ...test,
      description: `[commit] ${test.description}`,
      prompts: ['commit-skill*'],
      assert: [...commit.defaultAsserts, ...(test.assert ?? [])],
    };
  });

  const injection = load(path.join(changelog.dir, 'tests.yaml')).filter((t) =>
    /prompt injection/i.test(t.description),
  );
  if (injection.length !== 1) {
    throw new Error(`compare-versions: expected 1 changelog injection test, found ${injection.length}`);
  }
  const changelogTests = injection.map((t) => {
    const test = absolutize(t, changelog.dir);
    return {
      ...test,
      description: `[changelog] ${test.description}`,
      prompts: ['changelog-skill*'],
      assert: [...changelog.defaultAsserts, ...(test.assert ?? [])],
    };
  });

  return [...commitTests, ...changelogTests];
};
