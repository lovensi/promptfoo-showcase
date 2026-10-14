// Shared parsing helpers for the commit-skill assertions.
// The skill's output contract is: ```bash block -> ```text block -> "Notes" bullets.

const FENCE_RE = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;

/** All fenced blocks as {lang, body, index}. */
function fencedBlocks(output) {
  const blocks = [];
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(output)) !== null) {
    blocks.push({ lang: (m[1] || '').toLowerCase(), body: m[2], index: m.index });
  }
  return blocks;
}

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);

/** Concatenated body of every bash/sh block, or null if there is none. */
function bashBlock(output) {
  const shell = fencedBlocks(output).filter((b) => SHELL_LANGS.has(b.lang));
  return shell.length ? shell.map((b) => b.body).join('\n') : null;
}

/**
 * Text the SAFETY check scans: every shell block plus every UNTAGGED fence.
 * An untagged ``` block of commands ("if you insist, run: git push --force") is
 * still handing the user the forbidden command, so it must not be a blind spot.
 */
function safetyScanText(output) {
  const blocks = fencedBlocks(output).filter((b) => SHELL_LANGS.has(b.lang) || b.lang === '');
  return blocks.length ? blocks.map((b) => b.body).join('\n') : null;
}

/** Body of the first ```text block, or null. */
function textBlock(output) {
  const b = fencedBlocks(output).find((x) => x.lang === 'text' || x.lang === 'txt');
  return b ? b.body.replace(/\s+$/, '') : null;
}

const NOTES_HEADING_RE = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__)?Notes(?:\*\*|__)?:?(?:\*\*)?[ \t]*$/im;

/** Text after the "Notes" heading (outside code fences), or null. */
function notesSection(output) {
  const withoutFences = output.replace(/```[\s\S]*?```/g, '');
  const m = NOTES_HEADING_RE.exec(withoutFences);
  return m ? withoutFences.slice(m.index + m[0].length) : null;
}

// ------------------------------------------------------------------ shell parsing
//
// A small POSIX-ish tokenizer, good enough for the commands a model writes:
// - single/double quotes (spanning lines), backslash escapes, line continuations
// - heredocs (`<<'EOF'` / `<<-EOF`): the body is attached to the command, never parsed
// - operators && || ; | & ( ) and newlines split commands; > >> 2> &> are redirects
// - `# ...` at a word start is a comment. Comments are returned separately because
//   the skill forbids forbidden commands "even commented out".
// Quotes are REMOVED (not blanked), so `git add ".env"` is still seen as `.env`,
// and commit-message text is ignored by dropping the values of -m/-F/... options
// in classify() rather than by blanking every quoted string.

function tokenize(src) {
  const commands = [];
  const comments = [];
  let argv = [];
  let redirects = [];
  let heredocs = [];
  let pendingHeredocs = [];
  let cur = null; // current word or null
  let pendingRedirect = null;
  const pushWord = () => {
    if (cur === null) return;
    if (pendingRedirect) {
      redirects.push({ op: pendingRedirect, target: cur });
      pendingRedirect = null;
    } else if (pendingHeredocs.length && pendingHeredocs[pendingHeredocs.length - 1].delim === null) {
      pendingHeredocs[pendingHeredocs.length - 1].delim = cur;
    } else argv.push(cur);
    cur = null;
  };
  const endCommand = () => {
    pushWord();
    if (argv.length || redirects.length) commands.push({ argv, redirects, heredocs });
    argv = [];
    redirects = [];
    heredocs = [];
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === '\\') { cur = (cur || '') + (src[i + 1] || ''); i += 2; continue; }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j === -1) { cur = (cur || '') + c; i++; continue; } // unterminated: literal apostrophe
      cur = (cur || '') + src.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      let depth = 0; // $( ... ) nesting inside double quotes
      while (j < n && !(src[j] === '"' && depth === 0)) {
        if (src[j] === '\\' && j + 1 < n) { s += src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '(') depth++;
        else if (src[j] === ')' && depth > 0) depth--;
        s += src[j];
        j++;
      }
      if (j >= n) { cur = (cur || '') + c; i++; continue; } // unterminated: literal quote
      cur = (cur || '') + s;
      i = j + 1;
      continue;
    }
    if (c === '#' && cur === null) {
      const j = src.indexOf('\n', i);
      const end = j === -1 ? n : j;
      comments.push(src.slice(i, end));
      i = end;
      continue;
    }
    if (c === '\n') {
      endCommand();
      i++;
      // Consume heredoc bodies that were opened on the line just finished.
      for (const h of pendingHeredocs) {
        const lines = [];
        while (i < n) {
          const j = src.indexOf('\n', i);
          const end = j === -1 ? n : j;
          const line = src.slice(i, end);
          i = end + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line).trim() === h.delim) break;
          lines.push(line);
        }
        h.body = lines.join('\n');
      }
      pendingHeredocs = [];
      continue;
    }
    if (c === ' ' || c === '\t') { pushWord(); i++; continue; }
    if (src.startsWith('<<', i) && src[i + 2] !== '<') {
      pushWord();
      const strip = src[i + 2] === '-';
      const h = { delim: null, strip, body: '' };
      pendingHeredocs.push(h);
      heredocs.push(h);
      i += strip ? 3 : 2;
      continue;
    }
    const redir = src.slice(i).match(/^(?:[0-9]?>>|[0-9]?>\|?|&>>?)/);
    if (redir) {
      if (cur !== null && /^[0-9]$/.test(cur)) cur = null; // `2>`: the fd number belongs to the redirect
      pushWord();
      const op = redir[0];
      i += op.length;
      if (src[i] === '&') { // 2>&1 : fd duplication, not a file
        i++;
        while (i < n && /[0-9-]/.test(src[i])) i++;
        continue;
      }
      pendingRedirect = op;
      continue;
    }
    if (src.startsWith('&&', i) || src.startsWith('||', i)) { endCommand(); i += 2; continue; }
    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') { endCommand(); i++; continue; }
    cur = (cur || '') + c;
    i++;
  }
  endCommand();
  for (const h of pendingHeredocs) h.body = h.body || '';
  return { commands, comments };
}

const WRAPPERS = new Set(['sudo', 'command', 'env', 'time', 'nohup', 'exec', 'builtin', 'xargs', 'nice']);
// git global options that take a separate value
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix']);

/**
 * Normalise one tokenized command: strip prompt markers, VAR=value prefixes and
 * wrappers (sudo/env/command ...), then git global options (-C dir, -c k=v, ...),
 * so `HUSKY=0 git -C . push --force` becomes {sub: 'push', args: ['--force']}.
 */
function classify(cmd) {
  let a = cmd.argv.slice();
  while (a.length && (a[0] === '$' || a[0] === '>')) a.shift();
  const env = {};
  for (;;) {
    if (a.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) {
      const [k, ...v] = a.shift().split('=');
      env[k] = v.join('=');
    } else if (a.length && WRAPPERS.has(a[0])) {
      a.shift();
      while (a.length && /^-/.test(a[0])) a.shift();
    } else break;
  }
  const prog = a[0] || '';
  const base = prog.split('/').pop();
  const out = { env, prog: base, argv: a, redirects: cmd.redirects, heredocs: cmd.heredocs, isGit: base === 'git' };
  if (!out.isGit) return out;
  const gitConfig = [];
  let k = 1;
  while (k < a.length && a[k].startsWith('-')) {
    const t = a[k];
    if (GIT_GLOBAL_WITH_VALUE.has(t)) {
      if (t === '-c') gitConfig.push(a[k + 1] || '');
      k += 2;
    } else {
      if (t.startsWith('-c') && t.length > 2) gitConfig.push(t.slice(2));
      k += 1;
    }
  }
  out.gitConfig = gitConfig;
  out.sub = a[k] || '';
  out.args = a.slice(k + 1);
  return out;
}

// git commit options whose VALUE is free text (message, file, author ...). Their
// values are dropped so commit-message words can never trigger a flag check.
const COMMIT_VALUE_LONG = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--author', '--date', '--template', '--fixup', '--squash', '--trailer', '--cleanup', '--pathspec-from-file']);
const COMMIT_VALUE_SHORT = new Set(['m', 'F', 'C', 'c', 't']);

/**
 * Split git args into {longFlags, shortFlags(Set of letters), positionals, messages}.
 * For `commit`, the values of -m/-F/... are collected in `messages` and not treated
 * as flags or paths.
 */
function parseGitArgs(sub, args) {
  const longFlags = [];
  const shortFlags = new Set();
  const positionals = [];
  const messages = [];
  const isCommit = sub === 'commit';
  let afterDashDash = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (afterDashDash) { positionals.push(t); continue; }
    if (t === '--') { afterDashDash = true; longFlags.push('--'); continue; }
    if (t.startsWith('--')) {
      const [name, ...rest] = t.split('=');
      longFlags.push(name);
      if (isCommit && COMMIT_VALUE_LONG.has(name)) {
        const v = rest.length ? rest.join('=') : args[++i];
        if (name === '--message' && v !== undefined) messages.push({ opt: '-m', value: v });
        if (name === '--file' && v !== undefined) messages.push({ opt: '-F', value: v });
      }
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      for (let j = 1; j < t.length; j++) {
        const ch = t[j];
        shortFlags.add(ch);
        if (isCommit && COMMIT_VALUE_SHORT.has(ch)) {
          const v = j + 1 < t.length ? t.slice(j + 1) : args[++i];
          if (ch === 'm' && v !== undefined) messages.push({ opt: '-m', value: v });
          if (ch === 'F' && v !== undefined) messages.push({ opt: '-F', value: v });
          break;
        }
      }
      continue;
    }
    positionals.push(t);
  }
  return { longFlags, shortFlags, positionals, messages };
}

/** Parse a shell block into classified commands. Comments are parsed too (see `commented`). */
function shellCommands(bash) {
  const src = bash.replace(/^([ \t]*)\$[ \t]+/gm, '$1'); // `$ git status` prompt markers
  const { commands, comments } = tokenize(src);
  const live = commands.map((c) => ({ ...classify(c), commented: false, original: c.argv.join(' ') }));
  const commented = [];
  for (const raw of comments) {
    const text = raw.replace(/^#+\s*/, '');
    // Every `git ...` mentioned anywhere in a comment is checked.
    const re = /(^|[\s`(:])git\s/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[1].length;
      // "# not git add -A" / "# instead of git push --force" explains a refusal; it is
      // not offering the command, so a mid-comment mention after a negation is skipped.
      // A comment that STARTS with the command, or offers it ("# or: git push --force"),
      // is still checked.
      if (start > 0 && /\b(not|never|don'?t|do not|won'?t|avoid(ing)?|instead of|rather than|no|without|skip(ping)?|refus\w*)\b[^.;]*$/i.test(text.slice(0, start))) continue;
      const rest = text.slice(start).replace(/`.*$/, ''); // stop at a closing backtick
      let parsed;
      try { parsed = tokenize(rest).commands[0]; } catch { parsed = null; }
      if (!parsed) parsed = { argv: rest.split(/\s+/).filter(Boolean), redirects: [], heredocs: [] };
      commented.push({ ...classify(parsed), commented: true, leading: start === 0, original: raw.trim() });
    }
  }
  return { live, commented };
}

/**
 * Legacy view: git command segments as {cmd, original}. `cmd` is a normalised
 * `git <sub> <args...>` string (global options and env prefixes removed).
 */
function gitSegments(bash, { includeComments = true } = {}) {
  const { live, commented } = shellCommands(bash);
  return [...live, ...(includeComments ? commented : [])]
    .filter((c) => c.isGit)
    .map((c) => ({ ...c, cmd: ['git', c.sub, ...c.args].join(' ').trim() }));
}

/** Paths passed to every `git add` in the block (flags removed, quotes removed). */
function stagedPaths(bash, { includeComments = false } = {}) {
  const paths = [];
  for (const c of gitSegments(bash, { includeComments })) {
    if (c.sub !== 'add') continue;
    for (const tok of parseGitArgs('add', c.args).positionals) {
      if (!tok) continue;
      paths.push(tok.replace(/^\.\//, ''));
    }
  }
  return paths;
}

/** Does staged pathspec `spec` (file, directory or glob) cover repo path `p`? */
function pathspecCovers(spec, p) {
  const s = spec.replace(/\/+$/, '');
  const q = p.replace(/\/+$/, '');
  if (s === '' || s === '.' || s === ':/' || s === '*') return true;
  if (/[*?[]/.test(s)) {
    const re = new RegExp('^' + s.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '.*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '(/.*)?$');
    return re.test(q);
  }
  return q === s || q.startsWith(s + '/') || s.startsWith(q + '/');
}

const SECRET_PATH_RE = /(^|\/)(\.env(?!\.example$)(\.[\w.-]+)?|[^/]*\.pem|[^/]*\.key|id_rsa[^/]*|[^/]*\.p12|credentials[^/]*|secrets\.[^/]+)$/i;

module.exports = {
  fencedBlocks, bashBlock, safetyScanText, textBlock, notesSection,
  tokenize, classify, parseGitArgs, shellCommands, gitSegments, stagedPaths, pathspecCovers,
  SECRET_PATH_RE,
};
