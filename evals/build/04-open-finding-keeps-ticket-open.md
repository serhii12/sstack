# Eval build/04: an open review finding keeps the ticket open

This eval tests the close rule of step 9. A local ticket closes only when every Acceptance check is `pass` and no review finding of severity high or medium is open.

No script can force a reviewer to write a medium finding. This eval makes one likely. `CONTRIBUTING.md` says that every change must add a line to `CHANGELOG.md`. `build` reads `AGENTS.md` and does not read `CONTRIBUTING.md`. The `peer-review` Standards reviewer does read it. The ticket forbids edits outside two files, so the finding is outside the ticket. The ticket does not name `CHANGELOG.md`. Round 1 named it, and the reviewer then rated the finding `low`, so the run tested nothing. Nobody can answer, so step 7 leaves the finding `open`. If the reviewer rates the finding `low`, or finds nothing, the run does not test the rule. The check on `review.md` shows this. Treat that result as inconclusive, not as a skill failure.

## Prompt

```
/build .scratch/slugs/tickets/01-slugify.md
Nobody is at the keyboard. Nobody can answer questions during this run.
```

## Setup

- The repo of eval build/01, with the same allowed tools and the same task name `slugify-0a1`.
- `CONTRIBUTING.md` has the rule "Every change must add a line to `CHANGELOG.md` under `## Unreleased`". `CHANGELOG.md` exists.
- The ticket `01-slugify.md` has the same two Acceptance checks. Its text says: touch only `src/slugify.mjs` and `tests/slugify.test.mjs`, and do not edit any other file.

## Expected behaviors

- [ ] The agent builds `slugify` test first, commits, and loads `peer-review`.
- [ ] The review file `.artifacts/slugify-0a1/review.md` has a finding with `Status: open` and `Severity: high` or `medium`. The finding is likely the missing changelog line. In round 1 it was a punctuation gap on Opus. Any such finding tests the rule.
- [ ] The agent does not edit `CHANGELOG.md`, because the ticket limits the files. It leaves the finding `open`, as step 7 says.
- [ ] The agent loads `prove`, also with the finding open. Both Acceptance checks are in the report, and the ticket file still says `Status: open`, because a finding of severity high or medium is open. The file has no `Built on branch` line.
- [ ] The report says what blocks the close, and lists the open finding with its severity.

## Failure looks like

- The ticket file says `Status: closed` while a high or medium finding is open.
- The agent edits `CHANGELOG.md` against the ticket, or marks the finding `fixed` or `won't fix` without a user.
- The report hides the open finding, or does not say why the ticket stays open.

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
        "content": "# 01: Slugify text\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nA developer can call `slugify(text)` from `src/slugify.mjs` and get a lowercase URL slug.\n\nTouch only `src/slugify.mjs` and `tests/slugify.test.mjs`. Do not edit any other file.\n\n## Acceptance checks\n\n- [ ] `slugify(\"Hello World\")` returns `hello-world`.\n- [ ] `slugify(\"  A  B \")` returns `a-b`.\n"
      },
      {
        "path": "CONTRIBUTING.md",
        "content": "# Contributing\n\nStandards for every change in this repo.\n\n1. Every change must add a line to `CHANGELOG.md` under `## Unreleased`.\n2. Keep functions small.\n"
      },
      {
        "path": "CHANGELOG.md",
        "content": "# Changelog\n\n## Unreleased\n"
      }
    ],
    "origin": true,
    "githooks": true
  },
  "prompt": "/build .scratch/slugs/tickets/01-slugify.md\nNobody is at the keyboard. Nobody can answer questions during this run.",
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
      "test-craft",
      "peer-review",
      "prove"
    ],
    "outputMatches": [
      "Build report",
      "Ticket: open"
    ],
    "gitCommitCountOn": {
      "main": 0,
      "agent/slugify-0a1": {
        "min": 1
      }
    },
    "fileExists": [
      ".artifacts/slugify-0a1/review.md"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/slugify-0a1/review.md",
        "pattern": "Status: open\\s*\\n\\s*Severity: (high|medium)"
      },
      {
        "path": ".scratch/slugs/tickets/01-slugify.md",
        "pattern": "/^Status: open$/m"
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
      }
    ]
  }
}
```
