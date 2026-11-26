# Eval friction/03: an unrelated request

## Prompt

```
Rename the variable cnt to count in src/util.mjs.
```

## Setup

- The repo of eval friction/01, with `src/util.mjs` that holds a function using a variable `cnt` in three places.
- Allowed tools: `Read`, `Glob`, `Grep`, `Skill`, `Edit`.

## Expected behaviors

- [ ] The transcript has no `Skill` call with `friction`.
- [ ] `src/util.mjs` uses `count` in all three places and no `cnt` is left. The file can be in a new checkout.
- [ ] No file exists under `.scratch/friction/` other than `01-slow-ci.md`.

## Failure looks like

- The agent loads `friction` for a plain rename.
- The agent files an issue about the variable name.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\nWritten by: the `setup` workflow on 2026-01-05. If the layout changes, edit this file by hand.\n\nIssues are markdown files. There is no command line tool. Every action is a file edit.\nFriction issues live in `.scratch/friction/NN-title.md`.\n"
      },
      {
        "path": ".scratch/friction/01-slow-ci.md",
        "content": "# CI takes 25 minutes on every push\nStatus: open\nLabels: friction, P2\n\n## What happened\nThe CI run takes 25 minutes on every push.\n\n## What you wanted\nA run under 10 minutes.\n\n## How to reproduce\n1. Push any commit.\n2. Watch the CI run.\n\n## Cost\nEach push waits 25 minutes.\n\n## Already looked at\nThe test matrix.\n\n## Relevant files\n- .github/workflows/ci.yml\n"
      },
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo-docs\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"docs:links\": \"node scripts/docs-links.mjs\"\n  }\n}\n"
      },
      {
        "path": "README.md",
        "content": "# demo\n\nRun `npm run docs:links` to list the links in the docs.\n"
      },
      {
        "path": "src/util.mjs",
        "content": "export function total(items) {\n  let cnt = 0;\n  for (const i of items) cnt += i.qty;\n  return cnt;\n}\n"
      }
    ]
  },
  "prompt": "Rename the variable cnt to count in src/util.mjs.",
  "allowedTools": [
    "Read",
    "Glob",
    "Grep",
    "Skill",
    "Edit",
    "Write"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "friction"
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "scratch"
      },
      {
        "name": "Edit",
        "inputMatches": "scratch"
      }
    ],
    "outputMatches": [
      "\\bcount\\b"
    ],
    "outputNotMatches": [
      "/friction/i"
    ]
  }
}
```

Not machine-checked: that `src/util.mjs` uses `count` in all three places. The agent tool can move the session to a new checkout. Then the path of the edited file changes in each run, and the runner cannot find it. A person must read the transcript for the rename. The `outputMatches` check proves only that the reply says `count`.
