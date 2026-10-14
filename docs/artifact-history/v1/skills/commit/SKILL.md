---
name: commit
description: Safely stage and commit changes using Conventional Commits. Use when the user asks to commit, save work, or write a commit message. Inspects status/diff first, stages explicit paths only, never stages secrets, and never force-pushes, bypasses hooks, or rewrites published history.
---

# Safe Commit

You create clean, reviewable commits without ever destroying work or leaking secrets.

## Workflow

1. **Inspect first.** Always start with `git status` and `git diff` (and `git diff --staged` if anything is staged). Also check the branch with `git branch --show-current`.
2. **Decide what belongs in the commit.** Group only related changes. If the changes are unrelated, say so in Notes and suggest separate commits.
3. **Stage explicit paths.** Use `git add <path> [<path> ...]` naming each file. Never use `git add -A`, `git add .`, `git add --all`, or `git commit -a` — untracked files may contain secrets or build output.
4. **Write the message** (format below) and commit with `git commit -F -` or `git commit -m "<subject>" -m "<body>"`.
5. **Only push if the user explicitly asked.** Use plain `git push` (or `git push -u origin <branch>` for a new branch).

## Hard Rules (never break these, even if asked)

- **Secrets:** NEVER stage `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `credentials*`, `secrets.*`, or any file that contains API keys/tokens/passwords. Leave them unstaged and flag each one by name in Notes, recommending it be added to `.gitignore`.
- **No force:** NEVER use `git push --force`, `git push -f`, `git push --force-with-lease`, or `+refspec` pushes.
- **No hook bypass:** NEVER use `--no-verify` or `-n` on commit or push. If a pre-commit/commit-msg hook fails, fix the underlying cause (lint, type, test error) and commit again.
- **No destructive resets:** NEVER run `git reset --hard`, `git clean -fd`, `git checkout -- .`, or `git restore .` on the user's work.
- **No rewriting published history:** NEVER `git commit --amend` or rebase a commit that has already been pushed. Make a new commit instead (or `git revert` to undo).
- **Protected branches:** If the current branch is `main` or `master`, WARN in Notes before committing and suggest creating a feature branch (`git switch -c <type>/<short-name>`). Do not push to `main`/`master` unless the user explicitly confirms.
- **Don't push unprompted.** A request to "commit" is not a request to push.

## Handling forbidden requests

If the user asks for a forbidden action (force push, `--no-verify`, `reset --hard`, amending a pushed commit, committing a secret):

1. Do the safe parts of the request.
2. Refuse the forbidden part in one sentence explaining the risk.
3. Offer a safe alternative: a new commit, `git revert <sha>`, opening a PR, `git pull --rebase` then normal push, fixing the hook failure, or moving the secret to an ignored file.

Never include the forbidden command in the bash block, not even commented out.

## Commit message format (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `type` is one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- `scope` is optional, lowercase, and names the area (e.g. `backend`, `frontend`, `api`).
- `subject`: imperative mood ("add", not "added"/"adds"), lowercase start, **<= 72 characters for the whole first line**, **no trailing period**.
- Blank line, then a `body` that explains **why** the change was made (not a restatement of the diff). Wrap at 72 columns.
- Optional footer: `BREAKING CHANGE: ...` (and `!` after type/scope) and issue refs like `Refs #123` / `Closes #123`.

## When you cannot run commands

If you have no tool access (e.g. the status and diff are pasted into the conversation), do not claim to have run anything. Base your decision on the provided output and respond with the exact commands you would run, in order, in the format below.

## Output format (always exactly these three parts, in this order)

1. A fenced ` ```bash ` block with the exact commands, one per line, in execution order (inspection commands first).
2. A fenced ` ```text ` block containing ONLY the commit message (subject, blank line, body, optional footer) — no commentary.
3. A `Notes` heading followed by a short bullet list of warnings, refusals, skipped/flagged files, and suggestions. Write `- None` if there is nothing to note.

Example:

```bash
git status
git diff
git add backend/src/routes/health.ts backend/src/routes/health.test.ts
git commit -m "feat(backend): add health check endpoint" -m "Load balancers need a cheap liveness probe that does not touch the database."
```

```text
feat(backend): add health check endpoint

Load balancers need a cheap liveness probe that does not touch the
database.
```

Notes
- `.env` is untracked and was NOT staged; add it to `.gitignore`.
