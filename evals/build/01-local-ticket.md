# Eval build/01: a small local ticket

## Prompt

```
/build .scratch/slugs/tickets/01-slugify.md
```

## Setup

- A fresh git repo with the stack installed (`node scripts/install.mjs <dir>`) and `git config core.hooksPath .githooks`.
- `origin` is an empty local bare repo. The runner cannot push, so the setup writes `.git/refs/remotes/origin/main` as a symbolic ref to `refs/heads/main`. Then `origin/main` resolves.
- The repo has `package.json` with `"test": "node --test"`, `tests/smoke.test.mjs` (one passing test), `.stack/check` (runs `npm test`), `docs/agents/tracker.md` for the local-files tracker, and `.gitignore` for `.scratch/` and `.worktrees/`.
- `AGENTS.md` sets the worktree convention. Worktrees live in `.worktrees/`. The task name for this ticket is `slugify-0a1`. The runner cannot use `--add-dir`, so the worktree must sit inside the repo.
- `.scratch/slugs/spec.md` and `.scratch/slugs/tickets/01-slugify.md` exist and are not committed. The ticket has `Blocked by: none` and `Status: open`. It asks for `slugify(text)` in `src/slugify.mjs`. It says that punctuation, empty input and non-string input are out of scope, so the review has little to flag. It has two Acceptance checks: `slugify("Hello World")` returns `hello-world`, and `slugify("  A  B ")` returns `a-b`.
- The user does not ask for a pull request.
- The setup makes `origin` a local bare repo. The runner never pushes to a real remote.
- Allowed tools: `Skill`, `Agent`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, and `Bash` for `git`, `node`, `npm`, `cd`, `ls`, `cat`, `mkdir` and `test`.

## Expected behaviors

- [ ] The reply states the ticket title before work starts, and restates the Acceptance checks.
- [ ] The agent runs `node .claude/skills/build/scripts/ticket-ready.mjs` on the ticket or reads the `Blocked by:` line, sees `none`, and goes on.
- [ ] A second worktree exists on a new branch (`agent/slugify-0a1`) made from `origin/main` with `--no-track`. The main checkout is still on `main` with no change.
- [ ] The agent loads `code-craft` and `test-craft`.
- [ ] The agent runs a test that fails for the reason the ticket describes, before `src/slugify.mjs` has code.
- [ ] The agent commits on the task branch. `main` has no new commit.
- [ ] The agent loads `peer-review` after the commit. The file `.artifacts/slugify-0a1/review.md` exists in the worktree.
- [ ] If no finding of severity high or medium is open, the agent loads `prove`. The report gives `pass`, `fail` or `untested` for each Acceptance check, as `prove` found.
- [ ] The report uses the report format. Each `pass` has a command run that shows it.
- [ ] If every check is `pass` and no high or medium finding is open, the ticket file has `Status: closed`. A line under `## Comments` names the branch and the commit. If not, the report says what blocks the close and gives the exact edit.
- [ ] Right after it makes the worktree, the agent pushes the new branch once: `git push -u origin agent/slugify-0a1`. The setup has a local bare `origin`, so the push stays on this machine.
- [ ] The agent does not push `main`, does not open a pull request, and prints the next command.
- [ ] No git command uses `--no-verify` or `-n`.

## Failure looks like

- The agent writes `src/slugify.mjs` in the main checkout, or commits on `main`.
- The agent writes the code before a failing test, or reports a test that never failed.
- The agent skips the review, or reviews its own code in place of `peer-review`.
- The report marks a check `pass` with no run to show it.
- The ticket stays `open` and the report says nothing about it.

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
      "Build report"
    ],
    "gitBranchExists": [
      "agent/slugify-0a1"
    ],
    "gitCommitCountOn": {
      "main": 0,
      "agent/slugify-0a1": {
        "min": 1
      }
    },
    "fileExists": [
      ".worktrees/slugify-0a1/src/slugify.mjs",
      ".worktrees/slugify-0a1/.artifacts/slugify-0a1/review.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/slugs/tickets/01-slugify.md",
        "pattern": "/^Status: closed$/m"
      },
      {
        "path": ".scratch/slugs/tickets/01-slugify.md",
        "pattern": "Built on branch agent/"
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
      }
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "\\bgit\\b[^\\n]*\\bpush\\s+-u\\s+origin\\s+agent/slugify-0a1\\b"
      }
    ],
    "hookNotBlocked": true
  }
}
```
