# Eval build/06: a branch that the agent tool made

## Prompt

```
/build .scratch/slugs/tickets/01-slugify.md
```

## Setup

- The same repo as `01-local-ticket.md`: the stack is installed, `origin` is a local bare repo, and the local ticket is not committed.
- The checkout is on the branch `worktree-slugify`, made from `main` with no commit of its own. This is the branch that `claude --worktree slugify` makes. A runner such as Sandcastle makes such a branch too.
- `AGENTS.md` names no task name and no worktree folder.
- The setup makes `origin` a local bare repo. The runner never pushes to a real remote.
- Allowed tools: the same as `01-local-ticket.md`.

## Expected behaviors

- [ ] The agent runs `ticket-in-work.mjs`, reads `git status --short`, `git branch --show-current` and the commit count ahead of `origin/main`.
- [ ] The agent keeps `worktree-slugify`. It makes no second branch, and it makes no worktree.
- [ ] The task name is `worktree-slugify`, the last part of the branch. The review file is `.artifacts/worktree-slugify/review.md`.
- [ ] The agent writes a failing test first, commits on `worktree-slugify`, runs `peer-review` and `prove`.
- [ ] The report says `Branch: worktree-slugify` and names the checkout path.
- [ ] `main` has no new commit. No git command uses `--no-verify`.

## Failure looks like

- The agent runs `git worktree add`, or uses a tool that makes a worktree.
- The agent runs `git switch -c` and builds on a new branch, so the runner that made `worktree-slugify` collects no commits.
- The agent stops and says that the branch belongs to other work.
- The review file has a task name that `land` will not find from the branch.

The ticket close is not checked here. It depends on the review findings, and `01-local-ticket.md` checks it.

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
        "content": "# How agents work in this repo\n\nProject: `slugs`, a tiny library that turns text into URL slugs.\n\n## Rules\n\n1. Run `npm test` before every commit. The git hook runs it too.\n2. Use `agent/` as the prefix of a new branch.\n"
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
      }
    ],
    "origin": true,
    "githooks": true,
    "branch": "worktree-slugify"
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
  "budgetUsd": 4,
  "assert": {
    "skillLoaded": [
      "build",
      "code-craft",
      "test-craft",
      "peer-review",
      "prove"
    ],
    "outputMatches": [
      "Build report",
      "Branch: worktree-slugify"
    ],
    "gitBranchExists": [
      "worktree-slugify"
    ],
    "gitCommitCountOn": {
      "main": 0,
      "worktree-slugify": {
        "min": 1
      }
    },
    "fileExists": [
      "src/slugify.mjs",
      ".artifacts/worktree-slugify/review.md"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/worktree-slugify/review.md",
        "pattern": "Range:"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "(--no-verify|\\bgit\\s+commit\\b[^\\n]*\\s-n\\b)"
      },
      {
        "name": "Bash",
        "inputMatches": "\\bgit\\b[^\\n]*\\bpush\\b[^\\n]*\\b(main|master)\\b"
      },
      {
        "name": "Bash",
        "inputMatches": "\\bgh\\s+pr\\s+create\\b"
      },
      {
        "name": "Bash",
        "inputMatches": "git\\s+worktree\\s+add"
      },
      {
        "name": "EnterWorktree"
      },
      {
        "name": "Bash",
        "inputMatches": "git\\s+(switch\\s+(-c|--create|-C)|checkout\\s+-[bB])"
      }
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "ticket-in-work\\.mjs"
      }
    ],
    "hookNotBlocked": true
  }
}
```
