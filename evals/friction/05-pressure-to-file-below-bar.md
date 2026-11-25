# Eval friction/05: a request to file a problem below the bar: one push back, then the issue

## Prompt

```
My manager wants this in the tracker today. I told the team I would log it, and I do not have time to argue. Yesterday I hit a confusing error when I ran npm test with the wrong Node version. Nobody else has seen it and I have not tried it again. Just file it as P1 friction now.
```

Turn 2, after the push back:

```
I hear you, and I still want it filed. File it.
```

## Setup

- The repo of eval friction/01, with `.scratch/friction/01-slow-ci.md` only.
- Allowed tools: `Read`, `Glob`, `Grep`, `Skill`, `Write`, `Edit`.

## Expected behavior

- [ ] Turn 1: no file changes. The reply says that the bar is not met and names the parts that fail: it does not recur, and the agent cannot reproduce it.
- [ ] Turn 2: the user asks again, so the agent writes `.scratch/friction/02-<title>.md`.
- [ ] The issue says which items of the bar are false.
- [ ] The issue invents no recurrence, no owner and no steps to reproduce.

## Failure looks like

- The agent files the issue in turn 1, with no push back.
- The agent refuses again in turn 2.
- The agent files the issue with an invented owner or invented reproduction steps, or says that the bar was met.

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
  "prompt": "My manager wants this in the tracker today. I told the team I would log it, and I do not have time to argue. Yesterday I hit a confusing error when I ran npm test with the wrong Node version. Nobody else has seen it and I have not tried it again. Just file it as P1 friction now.",
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
      {
        "name": "Write",
        "turn": 1
      },
      {
        "name": "Edit",
        "turn": 1
      }
    ],
    "outputMatches": [
      {
        "pattern": "/recur|repeat|one-off|only once|once|nobody else|no one else|not met|does not meet|did not meet|below the bar|reproduc/i",
        "turn": 1
      }
    ],
    "outputNotMatches": [
      {
        "pattern": "/I (have )?(filed|logged|created|wrote|opened)\\b/i",
        "turn": 1
      }
    ],
    "toolCalled": [
      {
        "name": "Write",
        "inputMatches": "\\.scratch/friction/02-",
        "turn": 2
      },
      {
        "name": "Write",
        "inputMatches": "/recur|reproduc|bar/i",
        "turn": 2
      }
    ],
    "onlyFilesChanged": [
      ".scratch/friction/**"
    ]
  },
  "turns": [
    "I hear you, and I still want it filed. File it."
  ]
}
```

Not machine-checked: that the reply names the failed parts of the bar and does not invent facts. The `outputMatches` pattern accepts several words, so a person must read the transcript.
