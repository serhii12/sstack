# Eval friction/02: a problem that does not meet the bar

## Prompt

```
I mistyped the config path in my own command today and lost five minutes to a confusing error. It has never happened to anyone else. Should we log some friction for it?
```

## Setup

- The repo of eval friction/01, with `.scratch/friction/01-slow-ci.md` only.
- Allowed tools: `Read`, `Glob`, `Grep`, `Skill`, `Write`, `Edit`.

## Expected behaviors

- [ ] No new file exists under `.scratch/friction/`, and no issue is made.
- [ ] The reply says that the bar is not met, and names at least that it does not recur.
- [ ] The reply keeps it as a remark to the user and does not file it.
- [ ] The agent does not edit any file.

## Failure looks like

- The agent writes a friction file because the user asked "should we".
- The agent invents a recurrence or an owner so that the bar passes.
- The agent comments on `01-slow-ci.md`.

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
      }
    ]
  },
  "prompt": "I mistyped the config path in my own command today and lost five minutes to a confusing error. It has never happened to anyone else. Should we log some friction for it?",
  "allowedTools": [
    "Read",
    "Glob",
    "Grep",
    "Skill",
    "Write",
    "Edit"
  ],
  "budgetUsd": 1,
  "assert": {
    "toolNotCalled": [
      "Write",
      "Edit"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/recur|repeat|one-off|only once|once|nobody else|no one else|never happened|did not meet|does not meet|not met|below the bar/i"
    ],
    "outputNotMatches": [
      "/I (have )?(filed|logged|created|wrote|opened)\\b/i"
    ]
  }
}
```

The skill can load on this prompt, because the user says "log some friction". The eval does not fail for that. It fails when the agent files or edits anything.

Not machine-checked: that the reply names the failed part of the bar (it does not recur) and keeps it as a remark. The `outputMatches` pattern accepts several words, so a person must read the transcript.
