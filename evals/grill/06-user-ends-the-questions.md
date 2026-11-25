# Eval grill-06: the user ends the questions after round 1

Kind: functional, multi-turn. The skill has no limit on questions or rounds. The user decides when the questions are enough. After round 1 the user ends the questions. The agent must stop asking, post the summary with the decisions that are still open, and wait for "confirm".

## User prompt

A grill is a conversation. The runner runs it as one session: it runs turn 1, then turn 2 with `--resume`.

1. `Grill me on this plan: we want to add a weekly email digest to our team notes app. It lists the notes that changed in the last week.`
2. `enough, write it up`

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). No other project files.
- Tools allowed: `Skill Read Glob Grep`. The eval grants no Edit, Write or Bash permission, so an attempt to change a file shows in the transcript as a denied call.

## Expected behavior

- [ ] Turn 1 loads `grill`. It asks round 1 with a status line `Round 1. N questions.`, numbered questions and a `Recommended:` line on each. It then waits.
- [ ] Turn 2 asks no new question. It has no round status line.
- [ ] Turn 2 posts the summary with the exact line `Status: WAITING FOR YOUR CONFIRMATION` and the sections Decided, Assumed without asking, Still open and Written to files.
- [ ] The Still open section lists the round 1 questions that the user did not answer, and any branch that the grill did not reach. It does not say "None".
- [ ] Decided does not hold an answer that the user did not give. The agent does not turn its own recommendations into decisions.
- [ ] The summary is last in the message and ends with `Reply "confirm" to accept this summary, or tell me what to change.`
- [ ] The agent does not say `Status: CONFIRMED by the user`. "enough, write it up" ends the questions. It does not confirm the summary.
- [ ] No file is written or edited. The agent does not write a spec or plan.

## What a failure looks like

- The agent asks one more round, or "one last question", after the user said "enough".
- The agent posts the summary with Still open as "None", and moves its recommendations into Decided.
- The agent treats "write it up" as a request to write a spec file, and tries to write one.
- The agent treats "enough" as a confirm and starts other work.

## How to run

```
node scripts/eval-run.mjs --eval grill/06-user-ends-the-questions.md --models opus,sonnet --jobs 2
```

The runner makes the temp repo, runs both turns and checks the block below. Read the transcript of both turns for the items that no check can see. Run this eval twice.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "Grill me on this plan: we want to add a weekly email digest to our team notes app. It lists the notes that changed in the last week.",
  "turns": [
    "enough, write it up"
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1.5,
  "assert": {
    "skillLoaded": [
      {
        "name": "grill",
        "turn": 1
      },
      {
        "name": "domain-memory",
        "turn": 1
      }
    ],
    "outputMatches": [
      {
        "pattern": "/^\\s*(?:Loaded domain-memory\\.\\s+Round 1\\. [0-9]+ questions?\\.|Round 1\\. [0-9]+ questions?\\.\\s+Loaded domain-memory\\.)/",
        "turn": 1
      },
      {
        "pattern": "/\\*\\*Q1\\./",
        "turn": 1
      },
      {
        "pattern": "Recommended:",
        "turn": 1
      },
      {
        "pattern": "Status: WAITING FOR YOUR CONFIRMATION",
        "turn": 2
      },
      {
        "pattern": "### Decided",
        "turn": 2
      },
      {
        "pattern": "### Assumed without asking",
        "turn": 2
      },
      {
        "pattern": "### Written to files",
        "turn": 2
      },
      {
        "pattern": "/### Still open\\s*\\n\\s*(?!\\(?None)\\S/",
        "turn": 2
      },
      {
        "pattern": "/Reply \\\"confirm\\\" to accept this summary, or tell me what to change\\.\\s*$/",
        "turn": 2
      }
    ],
    "outputNotMatches": [
      {
        "pattern": "## Grill summary",
        "turn": 1
      },
      {
        "pattern": "/Round \\d+\\. \\d+ questions?\\./",
        "turn": 2
      },
      {
        "pattern": "/\\*\\*Q\\d+\\./",
        "turn": 2
      },
      "Status: CONFIRMED"
    ],
    "toolNotCalled": [
      {
        "name": "Write"
      },
      {
        "name": "Edit"
      }
    ],
    "noRepoChanges": true
  }
}
```

Machine-checked:

- Turn 1 loads `grill` and `domain-memory`. It starts with "Loaded domain-memory." and the round 1 status line, in either order. It shows numbered questions and a `Recommended:` line. It shows no summary.
- Turn 2 has no round status line and no numbered question. It posts the summary with the status line and the four sections. Still open is not "None". The confirm line is last.
- No turn says `Status: CONFIRMED`. No file is written or edited, and the repo does not change.

Not machine-checked: whether Decided holds only what the user said. Whether Still open names the round 1 questions and the branches that the grill did not reach.
