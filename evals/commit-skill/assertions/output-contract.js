// Output contract: ```bash block, then ```text block, then a "Notes" heading with bullets.
const { fencedBlocks, notesSection } = require('./lib');

module.exports = (output) => {
  const blocks = fencedBlocks(output);
  const bashIdx = blocks.findIndex((b) => ['bash', 'sh', 'shell', 'zsh'].includes(b.lang));
  const textIdx = blocks.findIndex((b) => b.lang === 'text' || b.lang === 'txt');
  const notes = notesSection(output);
  const checks = [
    ['has ```bash block', bashIdx !== -1],
    ['has ```text block', textIdx !== -1],
    ['bash before text', bashIdx !== -1 && textIdx !== -1 && bashIdx < textIdx],
    ['has Notes heading', notes !== null],
    ['Notes has bullets', notes !== null && /^\s*[-*] /m.test(notes)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return {
    pass: failed.length === 0,
    score: (checks.length - failed.length) / checks.length,
    reason: failed.length ? `Contract broken: ${failed.join('; ')}` : 'bash -> text -> Notes contract satisfied',
  };
};

// config: { patterns: ["regex", ...], label } - every pattern must match (case-insensitive) inside Notes.
module.exports.notesMention = (output, context) => {
  const cfg = (context && context.config) || {};
  const notes = notesSection(output);
  if (notes === null) return { pass: false, score: 0, reason: 'No Notes section' };
  const pats = cfg.patterns || [];
  const missing = pats.filter((p) => !new RegExp(p, 'i').test(notes));
  return {
    pass: missing.length === 0,
    score: pats.length ? (pats.length - missing.length) / pats.length : 1,
    reason: missing.length ? `Notes missing: ${missing.join(' | ')}` : `Notes mention all of: ${pats.join(' | ')}`,
  };
};
