# Eval improve-codebase/05: nine weak candidates, no cap

## Prompt

```
/improve-codebase
```

## Setup

- A fresh git repo with the stack installed and one setup commit.
- Nine small files in `src/`, each with one weak sign.
- Three files: a `utils` name, an unbounded cache, and a fetch with no timeout.
- Three files: a `catch` that only logs, an unmeasured limit, and a `get` that changes state.
- Three files: positional boolean flags, a pass-through mail module, and an old path kept beside the new one.
- Allowed tools: `Skill`, `Agent`, `Read`, `Glob`, `Grep`, `Write`, `Edit`, and the two scripts of the skill.

## Expected behaviors

- [ ] The agent hands the scan to one fresh subagent before it writes the report.
- [ ] The report lists each candidate that passes the filter, with no cap. Each has a rank, and the strongest comes first.
- [ ] `survey-lint` passes on the report.
- [ ] No source file changes.

## Failure looks like

- The report drops candidates to meet a cap, or says that it has a cap.
- A candidate has no rank.
- The agent fixes the files.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/utils.mjs",
        "content": "export function pad(n) {\n  return String(n).padStart(2, \"0\");\n}\n"
      },
      {
        "path": "src/cache.mjs",
        "content": "const seen = new Map();\n\nexport function remember(key, value) {\n  seen.set(key, value);\n  return value;\n}\n"
      },
      {
        "path": "src/fetch-user.mjs",
        "content": "export async function fetchUser(id) {\n  const res = await fetch(`https://example.invalid/users/${id}`);\n  return res.json();\n}\n"
      },
      {
        "path": "src/audit.mjs",
        "content": "export function audit(write, event) {\n  try {\n    write(JSON.stringify(event));\n  } catch (e) {\n    console.log(\"audit failed\");\n  }\n}\n"
      },
      {
        "path": "src/limits.mjs",
        "content": "export const MAX_ROWS = 1000;\n\nexport function clip(rows) {\n  return rows.slice(0, MAX_ROWS);\n}\n"
      },
      {
        "path": "src/counter.mjs",
        "content": "let count = 0;\n\nexport function getCount() {\n  count += 1;\n  return count;\n}\n"
      },
      {
        "path": "src/export-csv.mjs",
        "content": "export function exportCsv(rows, header, quote) {\n  const lines = rows.map((r) => r.map((c) => (quote ? `\"${c}\"` : c)).join(\",\"));\n  return (header ? [\"id,name\", ...lines] : lines).join(\"\\n\");\n}\n"
      },
      {
        "path": "src/mail.mjs",
        "content": "import { sendMail } from \"./mailer.mjs\";\n\nexport function send(to, subject, body) {\n  return sendMail(to, subject, body);\n}\n"
      },
      {
        "path": "src/mailer.mjs",
        "content": "export function sendMail(to, subject, body) {\n  return { to, subject, body, sent: true };\n}\n"
      },
      {
        "path": "src/old-total.mjs",
        "content": "// Old path. The new one is in src/total.mjs.\nexport function oldTotal(items) {\n  return items.reduce((s, i) => s + i, 0);\n}\n"
      },
      {
        "path": "src/total.mjs",
        "content": "export function total(items) {\n  return items.reduce((s, i) => s + i, 0);\n}\n"
      }
    ]
  },
  "prompt": "/improve-codebase",
  "allowedTools": [
    "Skill",
    "Agent",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/improve-codebase/scripts/churn.mjs:*)",
    "Bash(node .claude/skills/improve-codebase/scripts/survey-lint.mjs:*)"
  ],
  "budgetUsd": 2.5,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "improve-codebase"
    ],
    "fileExists": [
      ".artifacts/improve-codebase/report.md"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/improve-codebase/report.md",
        "pattern": "\\nRank: (Strong|Worth a look|Speculative)"
      }
    ],
    "scriptPasses": [
      {
        "skill": "improve-codebase",
        "script": "survey-lint",
        "file": ".artifacts/improve-codebase/report.md"
      }
    ],
    "onlyFilesChanged": [
      ".artifacts/improve-codebase/**"
    ],
    "toolCalled": [
      {
        "name": "Agent",
        "inputMatches": "You scan code and report"
      }
    ],
    "toolOrder": [
      {
        "before": "Agent",
        "after": {
          "name": "Write",
          "inputMatches": "improve-codebase/report\\.md"
        }
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      }
    ]
  }
}
```

Not machine-checked: whether the ranks are right, and whether rule breaks of one kind are merged.
