---
description: Analyze a file, directory, or topic and return a structured JSON report of bugs, security, performance, maintainability, and testing issues
argument-hint: <path-or-topic>
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git diff:*), Bash(wc:*)
---

# /analyze

Analyze **$ARGUMENTS** and report findings as a single JSON object.

## Steps

1. Resolve the target. If `$ARGUMENTS` is a path, read it (for a directory, use `Glob` to list source files and read the relevant ones). If it is a topic (e.g. "error handling in backend"), use `Grep`/`Glob` to locate the relevant files. If `$ARGUMENTS` is empty, analyze the current git diff.
2. Review the code for these categories only: `bug`, `security`, `performance`, `maintainability`, `testing`.
3. Record each concrete issue as a finding with a file, line (if known), description, and actionable recommendation.
4. Derive `risk_level` from the findings (rules below) and emit the report.

If you cannot use tools (e.g. the files are pasted into the conversation), analyze only the provided content and do not claim to have read anything else.

## Rules

- **Never invent files, lines, or code.** Every `file` must be a path you actually read or that was provided in the conversation. If you don't know the exact line, use `null`.
- `metrics.findings_count` MUST equal the number of items in `findings`.
- `metrics.files_analyzed` MUST equal the number of distinct files you actually read/were given.
- An empty `findings` array is valid and expected for clean code — do not pad with trivial findings.
- `risk_level`: `"high"` if any finding has severity `high`; else `"medium"` if any has severity `medium`; else `"low"`.
- Hardcoded secrets, injection, auth bypass, and unvalidated input reaching dangerous sinks are category `security`, severity `high`.
- If the target does not exist or no files match, return `files_analyzed: 0`, empty `findings`, `risk_level: "low"`, a `summary` stating that nothing was found, and a `next_steps` entry suggesting a correct path.
- `next_steps`: 0-5 short, prioritized actions.
- Use only the enum values listed in the schema. No extra keys.

## Output format

Respond with exactly ONE fenced ` ```json ` block containing ONE JSON object and nothing else — no prose before or after. It must validate against this schema (also stored at `.claude/commands/analyze.schema.json`):

```json
{
  "target": "string — the path or topic analyzed",
  "summary": "string — 1-3 sentence overall assessment",
  "risk_level": "low | medium | high",
  "findings": [
    {
      "severity": "info | low | medium | high",
      "category": "bug | security | performance | maintainability | testing",
      "file": "string — path relative to repo root",
      "line": "number | null",
      "description": "string — what is wrong and why it matters",
      "recommendation": "string — concrete fix"
    }
  ],
  "metrics": {
    "files_analyzed": "number",
    "findings_count": "number — must equal findings.length"
  },
  "next_steps": ["string"]
}
```

## Example

```json
{
  "target": "backend/src/routes/users.ts",
  "summary": "Route handler builds SQL from user input and has no tests.",
  "risk_level": "high",
  "findings": [
    {
      "severity": "high",
      "category": "security",
      "file": "backend/src/routes/users.ts",
      "line": 14,
      "description": "req.query.id is concatenated into a SQL string, allowing SQL injection.",
      "recommendation": "Use a parameterized query and validate id as an integer."
    },
    {
      "severity": "low",
      "category": "testing",
      "file": "backend/src/routes/users.ts",
      "line": null,
      "description": "No tests cover this route.",
      "recommendation": "Add backend/src/routes/users.test.ts covering valid, missing, and malicious ids."
    }
  ],
  "metrics": { "files_analyzed": 1, "findings_count": 2 },
  "next_steps": ["Parameterize the SQL query", "Add route tests"]
}
```
