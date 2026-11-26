# Eval domain-memory-04: a record for an easy, obvious choice: one push back, then the record

Kind: functional, push back test. The user asks for a record, but the decision fails the three tests. The skill must say which test failed and write no record. When the user asks again, it writes the record.

## User prompt

```
We decided to name the config file settings.json and not config.json. Please write a decision record for that.
```

Turn 2, after the push back:

```
I know it is easy to change. Write the record anyway.
```

## Setup

- A fresh temp git repo with the stack installed. The install creates `docs/adr/0000-template.md`.
- Add `docs/adr/0001-event-sourced-orders.md` as in eval domain-memory-03.
- Tools allowed: `Skill Read Glob Grep Edit(docs/adr/*) Write(docs/adr/*)`.

## Expected behavior

- [ ] The agent loads `domain-memory`.
- [ ] Turn 1: the agent writes no file. The reply says which of the three tests failed. A file name is easy to change (not hard to reverse), and it is not surprising.
- [ ] The reply does not invent a trade-off to justify a record.
- [ ] Turn 2: the user asks again, so the agent writes `docs/adr/0002-<short-title>.md`.
- [ ] `0001-event-sourced-orders.md` and `0000-template.md` are unchanged.

## What a failure looks like

- The agent writes the record in turn 1, with no push back.
- The agent refuses again in turn 2.
- The agent writes the record in another folder, such as `docs/decisions/`.
- The agent adds a long "Considered options" section to make the record look worthwhile.

## How to run

Use the same command as in `03-writes-decision-record.md`. For a baseline, delete `.claude/skills` from the temp repo and run again.

## Checks

Path rules did not match in headless runs, so `Write` and `Edit` are bare. A correct run writes no file, so the `toolNotCalled` checks ban every `Write` and `Edit` call.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "docs/adr/0001-event-sourced-orders.md",
        "content": "# 0001: Event-sourced orders\n\n**Status:** accepted\n**Date:** 2026-03-02\n\nOrders are stored as events, because we need a full audit trail.\n\n## Revisit if\n\nThe audit trail rule is dropped.\n"
      }
    ]
  },
  "prompt": "We decided to name the config file settings.json and not config.json. Please write a decision record for that.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Edit",
    "Write"
  ],
  "assert": {
    "skillLoaded": [
      "domain-memory"
    ],
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
    "fileMatches": [
      {
        "path": "docs/adr/0001-event-sourced-orders.md",
        "pattern": "Orders are stored as events, because we need a full audit trail\\."
      },
      {
        "path": "docs/adr/0000-template.md",
        "pattern": "# NNNN: <Short title"
      }
    ],
    "outputMatches": [
      {
        "pattern": "/hard to reverse|easy to (change|undo|reverse|rename)|not surprising|surprising|trade-?off/i",
        "turn": 1
      }
    ],
    "outputNotMatches": [
      "Considered options"
    ],
    "toolCalled": [
      {
        "name": "Write",
        "inputMatches": "docs/adr/0002-",
        "turn": 2
      }
    ]
  },
  "turns": [
    "I know it is easy to change. Write the record anyway."
  ]
}
```

Not machine-checked: whether the reply names the test that failed, and whether it explains it well. The regex sees only the words of a test. Whether the reply invents a trade-off.

- If the agent writes or edits any file, in `docs/adr/` or anywhere else, the `toolNotCalled` checks fail.
- If the reply does not use the words of a test, `outputMatches` fails.
- If the record adds a "Considered options" section, `outputNotMatches` fails.
- If the agent edits `0001` or `0000`, the `fileMatches` checks fail.
