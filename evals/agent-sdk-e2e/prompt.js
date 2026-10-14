// Prompt function: the user's request goes to the agent verbatim, and the test's
// `profile` var picks a least-privilege tool/permission profile that is merged
// into the claude-agent-sdk provider config for that test only.
//
// The artifacts themselves are NOT pasted here: the Agent SDK discovers them from
// the sandbox's .claude/ dir (setting_sources: [project]), exactly like Claude Code.

// Git commands the commit skill may need. Anything else (rm, curl, git remote add,
// git config, ...) is denied by permission_mode: dontAsk and shows up in
// metadata.permissionDenials. Pushing is possible but GIT_ALLOW_PROTOCOL=file
// restricts it to the local bare remote under /tmp.
const GIT_ALLOW = [
  'status', 'diff', 'log', 'branch', 'show', 'rev-parse', 'add', 'commit',
  'push', 'fetch', 'pull', 'rebase', 'merge', 'switch', 'restore', 'stash', 'revert', 'remote -v',
].map((c) => `Bash(git ${c}:*)`);
// Harmless helpers models like to chain onto git commands (`git commit ... ; echo "exit=$?"`).
// Without them a whole compound command is denied and we'd be grading the harness, not the model.
const SHELL_ALLOW = ['echo', 'pwd', 'ls', 'cat', 'head', 'tail', 'wc'].map((c) => `Bash(${c}:*)`);

const PROFILES = {
  // Commit skill: read files + a fixed set of git commands. No Write/Edit.
  git: {
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill'],
    append_allowed_tools: ['Skill', ...GIT_ALLOW, ...SHELL_ALLOW],
    permission_mode: 'dontAsk',
  },
  // Defense-in-depth case: the same git profile, but the Skill tool is removed
  // (not offered AND disallowed), so the commit skill cannot load. The only things
  // between the agent and a force push are CLAUDE.md and the permissions.deny rules
  // in the sandbox's copy of .claude/settings.json (note `git push:*` IS allowed here,
  // so if a force push is blocked, it is the deny rule that blocked it).
  'git-noskill': {
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    append_allowed_tools: [...GIT_ALLOW, ...SHELL_ALLOW],
    disallowed_tools: ['WebFetch', 'WebSearch', 'Skill'],
    permission_mode: 'dontAsk',
  },
  // Test-writer subagent: may create/edit files inside the sandbox (acceptEdits
  // only auto-approves edits under working_dir). No Bash at all.
  'test-writer': {
    tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Skill', 'Agent'],
    append_allowed_tools: ['Skill', 'Agent'],
    permission_mode: 'acceptEdits',
  },
  // /analyze slash command: strictly read-only.
  readonly: {
    tools: ['Read', 'Grep', 'Glob', 'Skill'],
    append_allowed_tools: ['Skill'],
    permission_mode: 'dontAsk',
  },
};

module.exports = function buildPrompt({ vars }) {
  const profile = PROFILES[vars.profile];
  if (!profile) throw new Error(`Unknown profile "${vars.profile}" (expected ${Object.keys(PROFILES).join(', ')})`);
  return {
    prompt: `{% raw %}${vars.task}{% endraw %}`,
    config: profile,
  };
};
