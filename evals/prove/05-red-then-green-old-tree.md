# Eval prove/05: red then green from the old tree, with no second checkout

Kind: functional. The fix is not committed yet. The `before` capture needs the parent commit.

## Prompt

```
Prove this fix. The ticket is .scratch/text/tickets/01-collapse.md. Use the task name collapse-1a.
```

## Setup

- A fresh git repo with the stack installed, on the branch `agent/collapse-1a`. The setup commit has the bug: `collapse` only trims.
- The fix in `src/collapse.mjs` is not committed. `tests/collapse.test.mjs` fails on the bug and passes on the fix.
- The ticket asks for `Evidence level: red-then-green`.
- Allowed tools: `Skill`, `Read`, `Write`, `Glob`, `Grep`, `Agent`, and `Bash` for `node`, `npm`, `git`, `tar`, `mkdir`, `mktemp` and a few read commands.

## Expected behaviors

- [ ] The agent loads `prove` and commits the fix first.
- [ ] The agent copies the parent commit to a temp folder with `git archive`, runs `npm test` there, and saves the failing output as `before`.
- [ ] The agent runs `npm test` on the head commit and saves the passing output as `after`.
- [ ] The agent makes no worktree, uses no stash, and does not switch or check out a branch.
- [ ] The report gives the absolute path of the evidence folder.

## Failure looks like

- The agent runs `git worktree add` or `git stash`, or checks out the parent commit in this checkout.
- The index has no `before` entry.
- The report gives only a relative evidence path.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"text\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/collapse.mjs",
        "content": "export function collapse(text) {\n  return text.trim();\n}\n"
      },
      {
        "path": "tests/collapse.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { collapse } from \"../src/collapse.mjs\";\n\ntest(\"collapse joins the words with one space\", () => {\n  assert.equal(collapse(\"  a   b \"), \"a b\");\n});\n"
      },
      {
        "path": ".scratch/text/tickets/01-collapse.md",
        "content": "# 01: Collapse inner spaces\n\nBlocked by: none\nStatus: open\nEvidence level: red-then-green\n\n## What to build\n\n`collapse(text)` in `src/collapse.mjs` trims the text and joins the words with one space. Today it only trims.\n\n## Acceptance checks\n\n- [ ] `collapse(\"  a   b \")` returns `a b`. `npm test` fails before the fix and passes after it.\n"
      }
    ],
    "branch": "agent/collapse-1a",
    "uncommitted": [
      {
        "path": "src/collapse.mjs",
        "content": "export function collapse(text) {\n  return text.trim().replace(/\\s+/g, \" \");\n}\n"
      }
    ]
  },
  "prompt": "Prove this fix. The ticket is .scratch/text/tickets/01-collapse.md. Use the task name collapse-1a.",
  "allowedTools": [
    "Skill",
    "Read",
    "Write",
    "Glob",
    "Grep",
    "Agent",
    "Bash(node:*)",
    "Bash(npm:*)",
    "Bash(git:*)",
    "Bash(tar:*)",
    "Bash(mkdir:*)",
    "Bash(mktemp:*)",
    "Bash(ls:*)",
    "Bash(cat:*)",
    "Bash(cp:*)",
    "Bash(echo:*)",
    "Bash(test:*)",
    "Bash(printf:*)",
    "Bash(date:*)"
  ],
  "budgetUsd": 2,
  "assert": {
    "skillLoaded": [
      "prove"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "\\bgit\\b[^\\n]*\\barchive\\b"
      },
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+collapse-1a"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "\\bgit\\b[^\\n]*\\b(worktree\\s+add|stash)\\b"
      },
      {
        "name": "Bash",
        "inputMatches": "\\bgit\\b[^\\n]*\\b(checkout|switch)\\b"
      },
      {
        "name": "EnterWorktree"
      }
    ],
    "fileExists": [
      ".artifacts/collapse-1a/evidence/index.json"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/collapse-1a/evidence/index.json",
        "pattern": "\"phase\"\\s*:\\s*\"before\""
      },
      {
        "path": ".artifacts/collapse-1a/evidence/index.json",
        "pattern": "\"phase\"\\s*:\\s*\"after\""
      }
    ],
    "outputMatches": [
      "Prove report",
      "/Evidence:\\s*`?\\/[^\\s`]*\\.artifacts\\/collapse-1a\\/evidence/"
    ],
    "gitCommitCountOn": {
      "main": 0
    }
  }
}
```
