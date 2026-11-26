# Eval spec-01: confirmed grill summary with every essential

Kind: task sort. A summary that has everything must give one draft spec. Before it writes, the agent shows the test boundaries and asks if they match, as Matt Pocock's `to-spec` does. The spec uses the section names and order of his template. It adds nothing that the summary does not hold.

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
6. Test boundaries: the HTTP endpoint GET /orders/export.csv (new). The user agreed that tests check the response body and headers there, and nothing inside.

### Assumed without asking
- The export is limited to 50,000 rows, because the page cannot show more today.

### Still open
- None

### Written to files
- None
```

Turn 2: `Yes, they match.`

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). There is no `docs/agents/tracker.md`, so the skill must use local files.
- `GLOSSARY.md` has the term "Orders page". `docs/adr/` holds only the template.
- Tools allowed: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and `Bash(node .claude/skills/spec/scripts/spec-lint.mjs:*)`. The last rule lets the agent run the spec lint and nothing else. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `spec` skill.
- [ ] Turn 1: the agent sketches the test boundaries, names `GET /orders/export.csv`, and asks one question: do these boundaries match what the user expects. It writes no file in turn 1.
- [ ] Turn 2: the agent asks no new question.
- [ ] The agent writes one file, `.scratch/csv-export/spec.md`, and no other file.
- [ ] The agent runs `spec-lint.mjs` on the spec, and the lint exits 0.
- [ ] The file has `Status: draft` and an `Agreed in:` line that names the confirmed grill summary.
- [ ] The file has the seven `##` sections of Matt's template in his order. They are Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope and Further Notes. It also has the `###` sections of SPEC-FORMAT.md.
- [ ] The file keeps the exact facts of the summary:
  - the file name `orders-YYYY-MM-DD.csv`
  - the column order id, customer, total, created_at
  - the header-only file for no rows, and 2 decimal places
  - the 50,000 row limit under "Assumed without asking"
- [ ] The Testing Decisions section names `GET /orders/export.csv` and marks it as new.
- [ ] "Open questions" says "None", or it lists only gaps that the agent found, each marked `(found by the agent)`. The summary says "Still open: None" and settles every essential.
- [ ] Each gap that the agent found is also named in the reply, as a statement.
- [ ] The file has no label, no ready marker, and no source file path or code.
- [ ] The report gives the path and the next command `/tickets`, typed in this same session.

## What a failure looks like

- The agent adds a gap that it found itself and does not mark it `(found by the agent)`. Earlier runs found "which date and time zone the file name uses" and "what happens over 50,000 rows".
- The agent hides a gap that it found: the gap is in the spec and not in the reply, or the reverse.
- The agent asks about such a gap in the reply. The skill does not interview the user. Its one question is the boundary check in turn 1.
- The agent writes the spec in turn 1, before the user answers the boundary check.
- The spec uses the earlier headings, such as `## Problem` or `## Test boundaries`.
- The agent invents a decision that the summary does not hold, such as a new column.
- The status is anything other than `draft`, or the file has a `ready-for-agent` label.
- The agent writes the spec in the chat only, or writes it anywhere other than `.scratch/csv-export/spec.md`.

## How to run

```
node scripts/eval-run.mjs --eval spec/01-complete-summary.md --models opus --runs 3 --claude <path to the real claude binary>
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
  "prompt": "/spec csv-export\n\n## Grill summary: CSV export of the orders report\nStatus: CONFIRMED by the user\n\n### Decided\n1. Problem: support staff copy the orders table by hand into a spreadsheet, and it takes about 20 minutes a week.\n2. Who it is for: support staff, who use the Orders page.\n3. In scope: an \"Export CSV\" button on the Orders page that downloads the rows that match the current filter.\n4. Out of scope: scheduled exports, and Excel (.xlsx) files.\n5. User-visible behavior: the file is named orders-YYYY-MM-DD.csv. The columns are id, customer, total and created_at, in that order. When the filter matches no rows, the file has the header row only. Totals have 2 decimal places.\n6. Test boundaries: the HTTP endpoint GET /orders/export.csv (new). The user agreed that tests check the response body and headers there, and nothing inside.\n\n### Assumed without asking\n- The export is limited to 50,000 rows, because the page cannot show more today.\n\n### Still open\n- None\n\n### Written to files\n- None",
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
        "pattern": "^# Spec: "
      },
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
        "pattern": "Agreed in: grill summary"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "orders-YYYY-MM-DD\\.csv"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "id.{0,4}customer.{0,4}total.{0,12}created_at"
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
        "pattern": "/GET \\/orders\\/export\\.csv[^\\n]*\\bnew\\b/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Problem Statement\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Solution\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n### Who it is for\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n### In scope\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n### User-visible behavior\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## User Stories\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Implementation Decisions\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Testing Decisions\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Out of Scope\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n## Further Notes\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/\\n### Glossary terms and decision records\\s*\\n/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "/## Problem Statement[\\s\\S]*\\n## Solution[\\s\\S]*\\n## User Stories[\\s\\S]*\\n## Implementation Decisions[\\s\\S]*\\n## Testing Decisions[\\s\\S]*\\n## Out of Scope[\\s\\S]*\\n## Further Notes/i"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "### Assumed without asking\\s*\\n+- [^\\n]*50,?000"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "pattern": "\\n### Open questions\\s*\\n+(?:(?:- )?None\\.?\\s*\\n+|(?:- [^\\n]*\\(found by the agent\\)[^\\n]*\\n+)+)#{2,3} "
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
        "pattern": "orders/export\\.csv",
        "turn": 1
      },
      {
        "pattern": "/\\?\\s*$/m",
        "turn": 1
      },
      {
        "pattern": "/tickets",
        "turn": 2
      }
    ],
    "outputNotMatches": [
      {
        "pattern": "/\\?\\s*$/m",
        "turn": 2
      },
      "Missing from the spec",
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
    "Yes, they match."
  ]
}
```

What each check catches:

- An open question that the agent added with no `(found by the agent)` mark makes the `## Open questions` check fail. A marked gap passes. The summary settles every essential, so the list is `None` or only marked gaps.
- A spec written in turn 1 fails the turn 1 `toolNotCalled` checks. A turn 1 reply that names no boundary or asks no question fails the turn 1 `outputMatches` checks.
- A question in the turn 2 report fails the turn 2 `/\?\s*$/m` check.
- A spec with the earlier headings, or with Matt's sections in another order, fails the heading checks.
- A status other than `draft`, a second status line, or a label line fails the status and label checks.
- A write to another file fails the `toolNotCalled` path checks.
- A lint that does not run fails the `Bash` `toolCalled` check and the "lint did not run" check.
- A missing section fails its `fileMatches` check.

Not machine-checked:

- A decision or behavior that the agent invented, other than an open question. Read the spec.
- No source file path or code in the spec.
- Whether the report names `/tickets` as the next command. The check finds the word anywhere in the reply.
- Whether the prose reads well.
