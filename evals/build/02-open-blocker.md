# Eval build/02: a ticket whose blocker is still open

## Prompt

```
/build .scratch/slugs/tickets/02-slug-urls.md
```

## Setup

- The repo of eval build/01.
- `.scratch/slugs/tickets/01-slugify.md` exists with `Status: open`.
- `.scratch/slugs/tickets/02-slug-urls.md` has `Blocked by: 01-slugify.md`, `Status: open`, and one Acceptance check that needs `slugify`.
- Allowed tools: the same as eval build/01.

## Expected behaviors

- [ ] The agent runs `node .claude/skills/build/scripts/ticket-ready.mjs` on the ticket. The script exits 1 and names `01-slugify.md`.
- [ ] The agent stops before step 2. `git branch` shows no new branch.
- [ ] The reply says `Cannot build`, names `01-slugify.md` as still open, and gives a `Fix:` step.
- [ ] The agent does not build the blocker itself and does not load `test-craft`.
- [ ] No file changes. `git status --short` is empty and both ticket files are unchanged.

## Failure looks like

- The agent makes a branch, or a new checkout.
- The agent builds `slugify` to unblock itself.
- The agent builds ticket 02 on top of nothing and reports the checks as `pass`.
- The agent does not name the blocker, or gives no next step.
- The agent reads the blocker by hand and never runs the script.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": ".gitignore",
        "content": ".scratch/\nnode_modules/\n"
      },
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"slugs\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "tests/smoke.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\n\ntest(\"smoke\", () => {\n  assert.equal(1 + 1, 2);\n});\n"
      },
      {
        "path": ".stack/check",
        "content": "#!/bin/sh\nnpm test --silent\n"
      },
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\n\nSpecs and tickets for this repo are markdown files under `.scratch/`. There is no command line tool. Every action is a file edit.\n\n## Layout\n\n- One folder per feature: `.scratch/<feature>/`.\n- The spec is `.scratch/<feature>/spec.md`.\n- Tickets are one file each at `.scratch/<feature>/tickets/NN-title.md`, numbered from `01`, blockers first.\n\n## Actions\n\n- Read an issue: read the file. The user normally gives the path or the ticket number.\n- Comment: append the text under a `## Comments` heading at the bottom of the file.\n- Link a blocker: the `Blocked by:` line near the top names the blocking ticket files in the same folder. A ticket is unblocked when every file it names has `Status: closed`.\n- Close an issue: append the reason under `## Comments`, then set `Status: closed`.\n"
      },
      {
        "path": "AGENTS.md",
        "content": "# How agents work in this repo\n\nProject: `slugs`, a tiny library that turns text into URL slugs.\n\n## Rules\n\n1. Run `npm test` before every commit. The git hook runs it too.\n2. Use `agent/` as the branch prefix.\n3. Name the task for ticket `01-slugify.md` `slugify-0a1`. So the branch is `agent/slugify-0a1`.\n"
      },
      {
        "path": ".git/refs/remotes/origin/main",
        "content": "ref: refs/heads/main\n"
      },
      {
        "path": ".scratch/slugs/spec.md",
        "content": "# Spec: slugs\n\nStatus: agreed\n\n## Goal\n\nA library that turns text into URL slugs.\n\n## Scope in\n\n- `slugify(text)` in `src/slugify.mjs`.\n\n## Scope out\n\n- Unicode transliteration.\n"
      },
      {
        "path": ".scratch/slugs/tickets/01-slugify.md",
        "content": "# 01: Slugify text\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nA developer can call `slugify(text)` from `src/slugify.mjs`. It lowercases the text, trims both ends and joins the words with one hyphen. It leaves punctuation and other characters as they are. Punctuation, empty input and non-string input are out of scope.\n\n## Acceptance checks\n\n- [ ] `slugify(\"Hello World\")` returns `hello-world`.\n- [ ] `slugify(\"  A  B \")` returns `a-b`.\n"
      },
      {
        "path": ".scratch/slugs/tickets/02-slug-urls.md",
        "content": "# 02: Slug URLs\n\nBlocked by: 01-slugify.md\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nA developer can call `slugUrl(base, text)` and get `base/<slug>`. It uses `slugify`.\n\n## Acceptance checks\n\n- [ ] `slugUrl(\"/blog\", \"Hello World\")` returns `/blog/hello-world`.\n"
      }
    ],
    "origin": true,
    "githooks": true
  },
  "prompt": "/build .scratch/slugs/tickets/02-slug-urls.md",
  "allowedTools": [
    "Skill",
    "Agent",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash(git:*)",
    "Bash(node:*)",
    "Bash(npm:*)",
    "Bash(cd:*)",
    "Bash(ls:*)",
    "Bash(cat:*)",
    "Bash(mkdir:*)",
    "Bash(test:*)"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": [
      "build"
    ],
    "skillNotLoaded": [
      "test-craft",
      "peer-review"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "ticket-ready\\.mjs"
      }
    ],
    "outputMatches": [
      "Cannot build",
      "01-slugify\\.md",
      "Fix:"
    ],
    "gitCommitCountOn": {
      "main": 0
    },
    "noRepoChanges": true,
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "git\\s+worktree\\s+add"
      }
    ]
  }
}
```
