# Eval tickets-01: small spec

Kind: task sort. A small spec must give a short breakdown, and nothing is published before approval.

## User prompt

```
/tickets .scratch/csv-export/spec.md
```

## Setup

- A fresh temp git repo with the stack installed. No `docs/agents/tracker.md`, so the skill must use local files.
- A small app, so that the spec matches the code: `src/orders.mjs` (an `orders` list and `filterOrders` by customer and status), `src/server.mjs` (an HTTP server with a `/orders` page), `test/orders.test.mjs`, and a `GLOSSARY.md` with the term "Orders page". The spec has two test boundaries: the CSV endpoint and the Export CSV link on the Orders page. It passes `spec-lint.mjs`.
- `.scratch/csv-export/spec.md` has this text:

```markdown
# Spec: CSV export of the orders report

Status: draft
Agreed in: grill summary confirmed by the user on 2026-11-20

## Problem

Support staff copy the orders table by hand into a spreadsheet.

## Who it is for

Support staff on the Orders page.

## Scope

### In

- An "Export CSV" button on the Orders page that downloads the rows that match the current filter.

### Out

- Scheduled exports and .xlsx files.

## User stories

1. As support staff, I want to download the filtered orders as a CSV file, so that I can open them in a spreadsheet.

## User-visible behavior

1. When support staff click "Export CSV", the browser downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at.
2. When the filter matches no rows, the file has the header row only.

## Test boundaries

- GET /orders/export.csv: the response body and headers. new

Prior art: None found

## Decisions

- One new endpoint returns the CSV for the current filter. The button links to it.

## Assumed without asking

- None

## Open questions

- None

## Glossary terms and decision records

- Orders page: GLOSSARY.md
```

- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. No `Write`, `Edit` or `Bash` rule. A write attempt shows in the transcript as a tool call. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `tickets` skill and reads `.scratch/csv-export/spec.md`.
- [ ] The reply is a breakdown in the format of SKILL.md: a title line with the ticket count, a `Gaps:` line, then numbered tickets.
- [ ] The breakdown has 1 or 2 tickets. Each ticket has `Blocked by:`, `Delivers:` and `Checks:` lines.
- [ ] The first ticket has `Blocked by: none`.
- [ ] Each ticket delivers a behavior the user can see (for example, the download works). No ticket is named after a layer such as "the endpoint" or "the tests".
- [ ] Each check names what to observe and where, and can fail before the work.
- [ ] The breakdown has a `Merged:` line and ends with the question about size and blockers and the "approve" prompt.
- [ ] The breakdown has no source file path and no code.
- [ ] No ticket file is written. The agent waits for the user.

## What a failure looks like

- The agent writes ticket files, or tries to (a denied Write call), before the user says "approve".
- The breakdown has 4 or more tickets for this one-endpoint change, or one ticket for each layer.
- A check passes at the starting commit (for example, "the button exists in the repo").
- The reply has no `Blocked by:` lines or no approval prompt.

## How to run

```
node scripts/eval-run.mjs --eval tickets/01-small-spec.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

The runner gives no `Write` or `Edit`. A write attempt still shows in the transcript as a tool call.

The fixture has a boundary for the Export CSV link. Without one, the skill stops for a missing boundary, as in tickets-04.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Ordering\n\n**Orders page**:\nThe page where support staff see and filter customer orders.\n_Avoid_: Order list\n" },
      { "path": "src/orders.mjs", "content": "export const orders = [\n  { id: 1, customer: \"Ana\", status: \"open\", total: 40.5, created_at: \"2026-11-01\" },\n  { id: 2, customer: \"Ben\", status: \"shipped\", total: 12, created_at: \"2026-11-02\" }\n];\n\nexport function filterOrders({ customer, status } = {}) {\n  return orders.filter((o) => (!customer || o.customer === customer) && (!status || o.status === status));\n}\n" },
      { "path": "src/server.mjs", "content": "import { createServer } from \"node:http\";\nimport { filterOrders } from \"./orders.mjs\";\n\nexport function createApp() {\n  return createServer((req, res) => {\n    if (req.url?.startsWith(\"/orders\")) {\n      res.writeHead(200, { \"content-type\": \"text/html\" });\n      res.end(`<h1>Orders</h1><p>${filterOrders().length} rows</p>`);\n      return;\n    }\n    res.writeHead(404);\n    res.end();\n  });\n}\n" },
      { "path": "test/orders.test.mjs", "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { filterOrders } from \"../src/orders.mjs\";\n\ntest(\"filterOrders returns all rows with no filter\", () => {\n  assert.equal(filterOrders().length, 2);\n});\n" },
      { "path": ".scratch/csv-export/spec.md", "content": "# Spec: CSV export of the orders report\n\nStatus: draft\nAgreed in: grill summary confirmed by the user on 2026-11-20\n\n## Problem\n\nSupport staff copy the orders table by hand into a spreadsheet.\n\n## Who it is for\n\nSupport staff on the Orders page.\n\n## Scope\n\n### In\n\n- An \"Export CSV\" button on the Orders page that downloads the rows that match the current filter.\n\n### Out\n\n- Scheduled exports and .xlsx files.\n\n## User stories\n\n1. As support staff, I want to download the filtered orders as a CSV file, so that I can open them in a spreadsheet.\n\n## User-visible behavior\n\n1. When support staff click \"Export CSV\", the browser downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at.\n2. When the filter matches no rows, the file has the header row only.\n\n## Test boundaries\n\n- GET /orders/export.csv: the response body and headers. new\n- GET /orders: the Export CSV link carries the current filter. new\n\nPrior art: None found\n\n## Decisions\n\n- One new endpoint returns the CSV for the current filter. The button links to it.\n\n## Assumed without asking\n\n- None\n\n## Open questions\n\n- None\n\n## Glossary terms and decision records\n\n- Orders page: GLOSSARY.md\n" }
    ]
  },
  "prompt": "/tickets .scratch/csv-export/spec.md",
  "allowedTools": ["Skill", "Read", "Glob", "Grep"],
  "assert": {
    "skillLoaded": ["tickets"],
    "noRepoChanges": true,
    "toolNotCalled": ["Write", "Edit"],
    "outputMatches": [
      "Breakdown for",
      "[12] tickets?\\b",
      "/^\\s*1\\. [^\\n]+\\n\\s*Blocked by: none/m",
      "Delivers:",
      "/^\\s*Checks\\b[^\\n]*:/m",
      "Merged:",
      "approve"
    ],
    "outputNotMatches": [
      "/^\\s*[3-9]\\. [^\\n]+\\n\\s*Blocked by:/m",
      "/^\\s*\\d+\\. (?:The )?(?:Schema|Database|Data layer|Models?|Endpoints?|Interface|UI|Frontend|Backend|Tests?)\\b/im"
    ]
  }
}
```

What each check catches:

- A ticket file, or an attempt to write one, fails `noRepoChanges` and the `toolNotCalled` checks.
- A breakdown of 3 or more tickets fails the count check in `outputMatches` and the third-ticket check in `outputNotMatches`.
- A ticket named after a layer fails the layer check.
- A first ticket with a blocker, no `Delivers:` or `Checks:` lines, or no approval prompt fails `outputMatches`.

Not machine-checked:

- Whether each check can fail before the work, and names what to observe and where.
- The ticket order and size.
- No source file path and no code in the breakdown. The reply can name files when it reports what it read, so a check on the whole reply gives false failures.
- Questions that the agent adds about gaps in the spec. An earlier passing run on Opus asked about the time zone of the file name.
