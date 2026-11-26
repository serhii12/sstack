# Eval tickets-06: new tickets get the ready-for-agent state, and triage lists them

Kind: task sort, hand-off. Matt Pocock's `to-tickets` marks each new ticket `ready-for-agent`. Then the `triage` question "What is ready to build?" lists the tickets.

## User prompt

```
/tickets .scratch/csv-export/spec.md
```

Turn 2: `approve`

Turn 3: `/triage What is ready to build?`

## Setup

- A fresh temp git repo with the stack installed.
- A local tracker: `docs/agents/tracker.md` is the seed `skills/setup/tracker/local.md`, and `docs/agents/triage-labels.md` is the seed label map.
- The small app of tickets-01 and the same spec, written with the headings of Matt's template. The spec passes `spec-lint.mjs`.
- Tools allowed: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit`, the tickets lint and `git status`. The permission mode is `acceptEdits`, so the agent can write the ticket files.

## Expected behavior

- [ ] Turn 1: the agent loads `tickets`, shows the breakdown and writes no file.
- [ ] Turn 2: the agent writes the ticket files under `.scratch/csv-export/tickets/`, blockers first.
- [ ] Each ticket file has `Status: open` and a `Labels:` line with `ready-for-agent`. A ticket with open blockers gets the state too, as in Matt's skill.
- [ ] The tickets lint exits 0.
- [ ] Turn 3: `/triage` lists the new ticket files by path as ready to build. It names the open blockers of each. It writes no file.

## What a failure looks like

- A ticket file has no `ready-for-agent` label, or the agent writes the state on the `Status:` line.
- The agent writes files in turn 1, before "approve".
- Turn 3 lists no ticket, or says that nothing is ready.
- Turn 3 changes a file.

## How to run

```
node scripts/eval-run.mjs --eval tickets/06-ready-state-shows-in-triage.md --models opus,sonnet
```

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "GLOSSARY.md",
        "content": "# Ordering\n\n**Orders page**:\nThe page where support staff see and filter customer orders.\n_Avoid_: Order list\n"
      },
      {
        "path": "src/orders.mjs",
        "content": "export const orders = [\n  { id: 1, customer: \"Ana\", status: \"open\", total: 40.5, created_at: \"2026-11-01\" },\n  { id: 2, customer: \"Ben\", status: \"shipped\", total: 12, created_at: \"2026-11-02\" }\n];\n\nexport function filterOrders({ customer, status } = {}) {\n  return orders.filter((o) => (!customer || o.customer === customer) && (!status || o.status === status));\n}\n"
      },
      {
        "path": "src/server.mjs",
        "content": "import { createServer } from \"node:http\";\nimport { filterOrders } from \"./orders.mjs\";\n\nexport function createApp() {\n  return createServer((req, res) => {\n    if (req.url?.startsWith(\"/orders\")) {\n      res.writeHead(200, { \"content-type\": \"text/html\" });\n      res.end(`<h1>Orders</h1><p>${filterOrders().length} rows</p>`);\n      return;\n    }\n    res.writeHead(404);\n    res.end();\n  });\n}\n"
      },
      {
        "path": "test/orders.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { filterOrders } from \"../src/orders.mjs\";\n\ntest(\"filterOrders returns all rows with no filter\", () => {\n  assert.equal(filterOrders().length, 2);\n});\n"
      },
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\nWritten by: the `setup` workflow on 2026-11-25. If the layout changes, edit this file by hand.\n\nSpecs and tickets for this repo are markdown files under `.scratch/`. There is no command line tool. Every action is a file edit.\n\n## Layout\n\n- One folder per feature: `.scratch/<feature>/`. `<feature>` is a short lowercase name with dashes, such as `csv-export`.\n- The spec is `.scratch/<feature>/spec.md`.\n- Tickets are one file each at `.scratch/<feature>/tickets/NN-title.md`, numbered from `01`, blockers first. `NN-title` is the number, a dash and the title in lowercase words joined by dashes, such as `01-login-form.md`. Never put more than one ticket in a file.\n- Reports from other people are files in `.scratch/reports/`, one file for each report, named `NN-title.md`. The `triage` skill reads them.\n\n## Actions\n\n- Create an issue: write a new file at the path above. If the folder is missing, create it. If the file already exists, stop and ask the user.\n- Read an issue: read the file. The user normally gives the path or the ticket number.\n- List open issues: the files whose `Status:` line is not `closed`.\n- Comment: append the text under a `## Comments` heading at the bottom of the file.\n- Add a label: there are no labels. Add the word to a `Labels:` line near the top of the file. If the line is missing, create it.\n- Link a blocker: the `Blocked by:` line near the top names the blocking ticket files in the same folder. Separate the names with commas, such as `Blocked by: 01-login-form.md, 02-session-store.md`. With no blockers it says `Blocked by: None (can start immediately)`. The scripts also read the older form `none`. A ticket is unblocked when every file it names has `Status: closed`, and the work of each is in `origin/main`.\n- Make a sub-issue: a ticket belongs to the spec in its feature folder. Its `Spec:` line points to `../spec.md`.\n- Close an issue: append the reason under `## Comments`, then set `Status: closed`.\n\n## Publish a spec\n\nWrite `.scratch/<feature>/spec.md`.\n\n## Publish tickets\n\nWrite one file for each ticket under `.scratch/<feature>/tickets/`, blockers first, numbered from `01`. Put the label of the `ready-for-agent` role on the `Labels:` line of each ticket.\n\n## Fetch a spec or ticket\n\nRead the file at the path the user gives. A bare number such as `03` means the file in `tickets/` that starts with `03-`.\n\n"
      },
      {
        "path": "docs/agents/triage-labels.md",
        "content": "# Triage labels\n\nWritten by: the `setup` workflow on 2026-11-25. If a label changes, edit this file by hand.\n\nThe `triage` and `friction` skills use roles. This file maps each role to the label string in the tracker of this repo. `triage-check.mjs` reads this file and maps each label to its role before it checks an issue.\n\n| Role | Label in this tracker | Meaning |\n| --- | --- | --- |\n| `bug` | `bug` | Something is broken. |\n| `enhancement` | `enhancement` | A new feature or an improvement. |\n| `needs-triage` | `needs-triage` | The maintainer must evaluate the issue. |\n| `needs-info` | `needs-info` | The issue waits for the reporter to answer the triage notes. |\n| `ready-for-agent` | `ready-for-agent` | The issue holds an agent brief, or it is a ticket from `/tickets`. The user can type `/build` for it. |\n| `ready-for-human` | `ready-for-human` | A person must do the work or settle a design. |\n| `wontfix` | `wontfix` | The issue is closed, with a recorded reason. |\n| `P0` | `P0` | Optional priority. The scale of the `friction` skill. |\n| `P1` | `P1` | Optional priority. |\n| `P2` | `P2` | Optional priority. |\n| `P3` | `P3` | Optional priority. |\n\nWhen a skill names a role, use the label in the second column. To use another name, edit the second column only. Keep the first column as it is.\n\n"
      },
      {
        "path": ".scratch/csv-export/spec.md",
        "content": "# Spec: CSV export of the orders report\n\nStatus: draft\nAgreed in: grill summary confirmed by the user on 2026-11-20\n\n## Problem Statement\n\nSupport staff copy the orders table by hand into a spreadsheet.\n\n## Solution\n\n### Who it is for\n\nSupport staff on the Orders page.\n\n### In scope\n\n- An \"Export CSV\" button on the Orders page that downloads the rows that match the current filter.\n\n### User-visible behavior\n\n1. When support staff click \"Export CSV\", the browser downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at.\n2. When the filter matches no rows, the file has the header row only.\n\n## User Stories\n\n1. As support staff, I want to download the filtered orders as a CSV file, so that I can open them in a spreadsheet.\n\n## Implementation Decisions\n\n- One new endpoint returns the CSV for the current filter. The button links to it.\n\n## Testing Decisions\n\n- GET /orders/export.csv: the response body and headers. new\n- GET /orders: the Export CSV link carries the current filter. new\n\nPrior art: None found\n\n## Out of Scope\n\n- Scheduled exports and .xlsx files.\n\n## Further Notes\n\n### Assumed without asking\n\n- None\n\n### Open questions\n\n- None\n\n### Glossary terms and decision records\n\n- Orders page: GLOSSARY.md\n"
      }
    ]
  },
  "prompt": "/tickets .scratch/csv-export/spec.md",
  "turns": [
    "approve",
    "/triage What is ready to build?"
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/tickets/scripts/tickets-lint.mjs:*)",
    "Bash(git status:*)"
  ],
  "permissionMode": "acceptEdits",
  "budgetUsd": 1.5,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      {
        "name": "tickets",
        "turn": 1
      },
      {
        "name": "triage",
        "turn": 3
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
        "turn": 3
      },
      {
        "name": "Edit",
        "turn": 3
      }
    ],
    "fileMatchesGlob": [
      ".scratch/csv-export/tickets/01-*.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/csv-export/tickets/*.md",
        "pattern": "/^Labels:[^\\n]*\\bready-for-agent\\b/m"
      },
      {
        "path": ".scratch/csv-export/tickets/*.md",
        "pattern": "/^Status: open\\s*$/m"
      },
      {
        "path": ".scratch/csv-export/tickets/*.md",
        "pattern": "/^Blocked by:/m"
      }
    ],
    "fileNotMatches": [
      {
        "path": ".scratch/csv-export/tickets/*.md",
        "pattern": "^(?![\\s\\S]*(?:^|\\n)Labels:[^\\n]*\\bready-for-agent\\b)"
      },
      {
        "path": ".scratch/csv-export/tickets/*.md",
        "pattern": "/^Status:[^\\n]*ready-for-agent/m"
      }
    ],
    "scriptPasses": [
      {
        "skill": "tickets",
        "script": "tickets-lint"
      }
    ],
    "onlyFilesChanged": [
      ".scratch/csv-export/tickets/**"
    ],
    "outputMatches": [
      {
        "pattern": "Breakdown for",
        "turn": 1
      },
      {
        "pattern": "csv-export/tickets/01-[a-z0-9-]+\\.md",
        "turn": 3
      }
    ]
  }
}
```

What each check catches:

- A ticket with no `ready-for-agent` label fails the first `fileNotMatches` check. A state on the `Status:` line fails the second one.
- A write in turn 1 or turn 3 fails `toolNotCalled`.
- A triage list that does not name the ticket files fails the turn 3 `outputMatches` check.
- A broken ticket shape fails `scriptPasses`.

Not machine-checked:

- Whether turn 3 names the blockers of each ticket. The number of tickets is not fixed, so a person reads it.
