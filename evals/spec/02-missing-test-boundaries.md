# Eval spec-02: summary without test boundaries

Kind: task sort (a plan with a gap). The agent sketches the test boundaries and asks if they match, as Matt Pocock's `to-spec` does. The user is not sure. Then the essential stays an open question. The skill must not invent it and must not refuse.

## User prompt

```
/spec csv-export

## Grill summary: CSV export of the orders report
Status: CONFIRMED by the user

### Decided
1. Problem: support staff copy the orders table by hand into a spreadsheet, and it takes about 20 minutes a week.
2. Who it is for: support staff, who use the Orders page.
3. In scope: an "Export CSV" button on the Orders page that downloads the rows that match the current filter.
4. Out of scope: scheduled exports, and Excel (.xlsx) files.
5. User-visible behavior: the file is named orders-YYYY-MM-DD.csv. The columns are id, customer, total and created_at, in that order. When the filter matches no rows, the file has the header row only. Totals have 2 decimal places.

### Assumed without asking
- The export is limited to 50,000 rows, because the page cannot show more today.

### Still open
- Test boundaries: we did not decide where tests will observe the export.

### Written to files
- None
```

Turn 2: `I am not sure about the test boundaries yet. Leave them open.`

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). There is no `docs/agents/tracker.md`, so the skill must use local files.
- `GLOSSARY.md` has the term "Orders page". `docs/adr/` holds only the template.
- Tools allowed: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and `Bash(node .claude/skills/spec/scripts/spec-lint.mjs:*)`. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `spec` skill.
- [ ] Turn 1: the agent sketches test boundaries and asks one question: do they match what the user expects. It writes no file in turn 1.
- [ ] Turn 2: the agent asks no new question. The first line of the reply is `Missing from the spec: Test boundaries.`, and it tells the user to type `/grill`.
- [ ] The agent writes `.scratch/csv-export/spec.md` with `Status: draft`.
- [ ] The agent runs `spec-lint.mjs` on the spec, and the lint exits 0.
- [ ] The Testing Decisions section reads `Not agreed. See Open questions.` and nothing else, except the `Prior art:` line. It names no endpoint, function or button as a boundary.
- [ ] Open questions has the item `Test boundaries: not agreed yet`. Any other item is a gap that the agent found, marked `(found by the agent)`, and the reply names it too. The sketch from turn 1 can be such a gap.
- [ ] The other sections hold the facts of the summary (file name, columns, 2 decimal places, header-only file, 50,000 row limit).
- [ ] The agent adds no label and no ready marker.
- [ ] The next command in the report is `/grill`, then `/spec` again, not `/tickets`.

## What a failure looks like

- The agent refuses and writes no spec.
- The spec names a test boundary that nobody agreed in Testing Decisions (for example `GET /orders/export.csv`).
- The agent writes the spec in turn 1, before the user answers the boundary check.
- The spec shows `None` for Open questions.
- The agent adds a gap of its own, such as the time zone of the date in the file name, with no `(found by the agent)` mark.
- The reply does not name the missing essential at the top.

## How to run

```
node scripts/eval-run.mjs --eval spec/02-missing-test-boundaries.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

The runner passes no `--permission-mode`. `Write` and `Edit` have no path rule, so the `toolNotCalled` checks hold every write to `.scratch/csv-export/spec.md`. A `fileMatches` pattern that starts with `^(?!` passes only when the text is absent from the whole file.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "GLOSSARY.md",
        "content": "# Ordering\n\n**Orders page**:\nThe page where support staff see and filter customer orders.\n_Avoid_: Order list\n"
      }
    ]
  },
  "prompt": "/spec csv-export\n\n## Grill summary: CSV export of the orders report\nStatus: CONFIRMED by the user\n\n### Decided\n1. Problem: support staff copy the orders table by hand into a spreadsheet, and it takes about 20 minutes a week.\n2. Who it is for: support staff, who use the Orders page.\n3. In scope: an \"Export CSV\" button on the Orders page that downloads the rows that match the current filter.\n4. Out of scope: scheduled exports, and Excel (.xlsx) files.\n5. User-visible behavior: the file is named orders-YYYY-MM-DD.csv. The columns are id, customer, total and created_at, in that order. When the filter matches no rows, the file has the header row only. Totals have 2 decimal places.\n\n### Assumed without asking\n- The export is limited to 50,000 rows, because the page cannot show more today.\n\n### Still open\n- Test boundaries: we did not decide where tests will observe the export.\n\n### Written to files\n- None",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/spec/scripts/spec-lint.mjs:*)"
  ],
  "assert": {
    "skillLoaded": [
      "spec"
    ],
    "fileExists": [
      ".scratch/csv-export/spec.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "\\nStatus: draft\\s*\\n"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "^(?![\\s\\S]*\\n\\s*(?:\\*\\*)?(?:Labels?:|Status:(?! draft\\s*\\n)))"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "^(?![\\s\\S]*ready-for-)"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "\\n## Testing Decisions\\s*\\n+Not agreed\\. See Open questions\\.\\s*\\n+(?:Prior art:[^\\n]*\\n+)?## "
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/Test boundaries: not agreed yet/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "\\n### Open questions\\s*\\n+(?:- [^\\n]*(?:[Tt]est boundar|\\(found by the agent\\))[^\\n]*\\n+)+#{2,3} "
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "orders-YYYY-MM-DD\\.csv"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "header row only"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "2 decimal places"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "50,?000"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Problem Statement\\s*\\n[\\s\\S]*\\n## Testing Decisions\\s*\\n[\\s\\S]*\\n## Further Notes\\s*\\n/i"
      }
    ],
    "toolCalled": [
      {
        "name": "Write",
        "inputMatches": "csv-export/spec\\.md"
      },
      {
        "name": "Bash",
        "inputMatches": "spec-lint\\.mjs[^\\n]*csv-export/spec\\.md"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "turn": 1
      },
      {
        "name": "Edit",
        "turn": 1
      },
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.scratch/csv-export/spec\\.md\")"
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.scratch/csv-export/spec\\.md\")"
      },
      {
        "name": "Write",
        "inputMatches": "ready-for-agent"
      },
      {
        "name": "Edit",
        "inputMatches": "ready-for-agent"
      }
    ],
    "outputMatches": [
      {
        "pattern": "/\\?\\s*$/m",
        "turn": 1
      },
      {
        "pattern": "/^Missing from the spec: Test boundaries\\./m",
        "turn": 2
      },
      {
        "pattern": "/`\\/grill`[\\s\\S]{0,300}\\/spec/",
        "turn": 2
      }
    ],
    "outputNotMatches": [
      "[Nn]ext[^\\n]{0,20}`?/tickets",
      {
        "pattern": "/\\?\\s*$/m",
        "turn": 2
      },
      "/lint\\W{0,6}(did not|didn't|could not|couldn't|was not|wasn't|not) (run|approved)|(did not|didn't|could not|couldn't) run the (spec )?lint|lint[^\\n]{0,40}needed (your )?approval/i"
    ],
    "scriptPasses": [
      {
        "skill": "spec",
        "script": "spec-lint",
        "file": ".scratch/csv-export/spec.md"
      }
    ]
  },
  "turns": [
    "I am not sure about the test boundaries yet. Leave them open."
  ]
}
```

What each check catches:

- A reply that does not put the "Missing from the spec" line at the start of a line fails the first `outputMatches` check.
- A boundary that nobody agreed, written under Testing Decisions, fails the Testing Decisions check.
- A spec written in turn 1 fails the turn 1 `toolNotCalled` checks.
- The Open questions check fails on `None` or on a list with no test boundary item. It also fails on an item with no `(found by the agent)` mark.
- A refusal fails `fileExists`.
- A next command of `/tickets` fails the first `outputNotMatches` check.
- A lint that does not run fails the `Bash` `toolCalled` check and the "lint did not run" check.

Not machine-checked:

- The exit code of `spec-lint.mjs`. The runner cannot read tool output.
- Whether "Missing from the spec" is the first line of the reply. The check sees only the start of some line.
- Whether the reply explains the gap well.
