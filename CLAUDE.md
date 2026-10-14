# CLAUDE.md

## Project overview

Demo repository for a live session showcasing **Promptfoo** as an evaluation harness for Claude Code artifacts — skills, a subagent, and a slash command. The app (React frontend + Express backend) is intentionally minimal; it exists only to give the artifacts a realistic codebase to act on.

## Layout

```
frontend/                 Vite + React + TypeScript (minimal UI)
backend/                  Express + TypeScript (ESM, tsx for dev), vitest
.claude/skills/commit/    safe-commit skill (Conventional Commits, no force/no-verify)
.claude/skills/changelog/ Keep a Changelog entry generator
.claude/agents/test-writer.md   subagent that ONLY writes tests
.claude/commands/analyze.md     /analyze slash command (JSON report)
.claude/commands/analyze.schema.json  JSON Schema for /analyze output
evals/<suite>/            one self-contained Promptfoo suite per artifact
evals/compare-versions/   v1 vs v2 skill regression comparison (reuses other suites)
scripts/                  pf.mjs (promptfoo wrapper), dev.mjs, eval-all.mjs
docs/artifact-history/v1/ archived v1 artifacts
docs/promptfoo-reference.md     Promptfoo 0.124.1 reference notes
```

## Commands

All commands run from the repo root (full list and costs in `README.md`):

- `npm install` — install all workspaces
- `npm run dev` — backend (:3001) + frontend (:5173) together; `npm run dev:backend` / `npm run dev:frontend` for one
- `npm run typecheck` / `npm run build` — both workspaces
- `npm test` — backend vitest
- `npm run eval:commit` | `eval:changelog` | `eval:test-writer` | `eval:analyze` | `eval:compare` — one suite each
- `npm run eval:all` — the five suites above in sequence (excludes the slow/costly `eval:e2e` and `eval:redteam`)
- `npm run eval:e2e` — real Agent SDK suite; `npm run eval:redteam` — committed redteam attacks (`eval:redteam:generate` regenerates them)
- `npm run eval:view` — open the promptfoo results UI
- Extra promptfoo flags go after `--`, e.g. `npm run eval:commit -- --filter-providers haiku`
- `npm run pf -- <args>` — any promptfoo command. `scripts/pf.mjs` sets `PROMPTFOO_DISABLE_TELEMETRY/UPDATE/SHARING=1` (plus offline redteam generation) and runs from the repo root; prefer it over bare `npx promptfoo`

## Conventions

- **Tests:** vitest, colocated next to source as `*.test.ts` (`src/foo.ts` -> `src/foo.test.ts`). Deterministic — mock network and time.
- **TypeScript:** ESM; follow the existing relative-import style (including `.js` extensions where used).
- **Commits:** Conventional Commits (`type(scope): subject`, imperative, <= 72 chars, no trailing period). Stage explicit paths, never `git add -A`.
- **Git safety:** never force push, never `--no-verify`, never `git reset --hard`, never amend pushed commits, never commit `.env` or keys.
- **Secrets:** `ANTHROPIC_API_KEY` comes from the environment; never hardcode or commit it.

## Evaluations

Every artifact in `.claude/` is evaluated by a matching Promptfoo suite in `evals/` (commit-skill, changelog-skill, test-writer-agent, analyze-command, agent-sdk-e2e, redteam). `evals/compare-versions` runs the archived v1 skills (`docs/artifact-history/v1/`) against the live ones on the same tests. If you change an artifact's rules or output format, update its suite and re-run the eval. Model-graded assertions use Anthropic graders only (no OpenAI key is available).
