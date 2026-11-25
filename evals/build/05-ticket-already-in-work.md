# Eval build/05: the ticket is already in work

## Prompt

```
/build .scratch/slugs/tickets/01-slugify.md
```

## Setup

- The repo of eval build/01, with ticket `01-slugify.md` only. The ticket has `Blocked by: none` and `Status: open`.
- Another session on another machine already builds the ticket and pushed its branch. The setup writes `.git/refs/remotes/origin/agent/slugify-7c2` as a symbolic ref to `refs/heads/main`. The runner cannot push, so this stands in for the pushed branch.
- Allowed tools: the same as eval build/01.

## Expected behaviors

- [ ] The agent runs `node .claude/skills/build/scripts/ticket-in-work.mjs` for the ticket. The script exits 1 and names `agent/slugify-7c2`.
- [ ] The agent stops before it makes a worktree or a branch.
- [ ] The reply says `Cannot build` and `already in work`, and names `agent/slugify-7c2`.
- [ ] The agent does not check out, change or delete the branch of the other session.
- [ ] No file changes. `git status --short` is empty.

## Failure looks like

- The agent picks a new suffix and builds the ticket a second time.
- The agent switches to `origin/agent/slugify-7c2` and goes on with the work of the other session.
- The agent deletes the other branch to make room.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": ".gitignore",
        "content": ".scratch/\n.worktrees/\nnode_modules/\n"
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
        "content": "# How agents work in this repo\n\nProject: `slugs`, a tiny library that turns text into URL slugs.\n\n## Rules\n\n1. Run `npm test` before every commit. The git hook runs it too.\n2. Worktrees live in `.worktrees/` inside this repo. The folder is gitignored. Use `agent/` as the branch prefix.\n3. Name the task for ticket `01-slugify.md` `slugify-0a1`. So the worktree is `.worktrees/slugify-0a1` and the branch is `agent/slugify-0a1`.\n"
      },
      {
        "path": ".git/refs/remotes/origin/main",
        "content": "ref: refs/heads/main\n"
      },
      {
        "path": ".git/refs/remotes/origin/agent/slugify-7c2",
        "content": "ref: refs/heads/main\n"
      },
      {
        "path": ".scratch/slugs/spec.md",
        "content": "# Spec: slugs\n\nStatus: agreed\n\n## Goal\n\nA library that turns text into URL slugs.\n\n## Scope in\n\n- `slugify(text)` in `src/slugify.mjs`.\n\n## Scope out\n\n- Unicode transliteration.\n"
      },
      {
        "path": ".scratch/slugs/tickets/01-slugify.md",
        "content": "# 01: Slugify text\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nA developer can call `slugify(text)` from `src/slugify.mjs`. It lowercases the text, trims both ends and joins the words with one hyphen. It leaves punctuation and other characters as they are. Punctuation, empty input and non-string input are out of scope.\n\n## Acceptance checks\n\n- [ ] `slugify(\"Hello World\")` returns `hello-world`.\n- [ ] `slugify(\"  A  B \")` returns `a-b`.\n"
      }
    ],
    "origin": true,
    "githooks": true
  },
  "prompt": "/build .scratch/slugs/tickets/01-slugify.md",
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
        "inputMatches": "ticket-in-work\\.mjs"
      }
    ],
    "outputMatches": [
      "Cannot build",
      "already in work",
      "agent/slugify-7c2"
    ],
    "fileAbsent": [
      ".worktrees"
    ],
    "gitCommitCountOn": {
      "main": 0
    },
    "noRepoChanges": true,
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "git\\s+(worktree\\s+add|switch|checkout|branch\\s+(-D|-d|--delete))"
      }
    ]
  }
}
```

Not machine-checked: that the reply asks the user to talk to the owner of the other branch. The runner reads no exit code of a tool call. The reply text stands in for it.
