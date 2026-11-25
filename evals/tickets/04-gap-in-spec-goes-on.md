# Eval tickets-04: spec with no agreed test boundary

Kind: task sort (a gap in the spec). Each acceptance check needs a test boundary. The skill must name the gap, propose a boundary marked as its own, and go on to the breakdown.

## User prompt

```
/tickets .scratch/csv-export/spec.md
```

## Setup

- A fresh temp git repo with the stack installed. No `docs/agents/tracker.md`, so the skill must use local files.
- A small app, so that the spec matches the code: `src/orders.mjs` (an `orders` list and `filterOrders` by customer and status), `src/server.mjs` (an HTTP server with a `/orders` page), `test/orders.test.mjs`, and a `GLOSSARY.md` with the term "Orders page". The spec passes `spec-lint.mjs`. Its Test boundaries section reads `Not agreed. See Open questions.` and the `Prior art:` line.
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

Not agreed. See Open questions.

Prior art: None found

## Decisions

- One new endpoint returns the CSV for the current filter. The button links to it.

## Assumed without asking

- None

## Open questions

- Test boundaries: not agreed yet

## Glossary terms and decision records

- Orders page: GLOSSARY.md
```

- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. No `Write`, `Edit` or `Bash` rule. A write attempt shows in the transcript as a tool call. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `tickets` skill and reads the spec.
- [ ] The agent does not stop. The reply shows a breakdown.
- [ ] The breakdown has a `Gaps:` line that names the missing test boundary.
- [ ] Each boundary that the agent picks is marked as proposed by the agent.
- [ ] The reply says that the user can type `/grill` to settle the gap.
- [ ] The agent does not edit the spec.
- [ ] The agent writes no ticket file. It waits for "approve".

## What a failure looks like

- The agent stops with no breakdown.
- The agent picks a boundary and does not say that it picked it.
- The agent edits the spec to add a boundary.
- The agent writes ticket files.

## How to run

```
node scripts/eval-run.mjs --eval tickets/04-gap-in-spec-goes-on.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

The runner gives no `Write` or `Edit`. A write attempt still shows in the transcript as a tool call.

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
      { "path": ".scratch/csv-export/spec.md", "content": "# Spec: CSV export of the orders report\n\nStatus: draft\nAgreed in: grill summary confirmed by the user on 2026-11-20\n\n## Problem\n\nSupport staff copy the orders table by hand into a spreadsheet.\n\n## Who it is for\n\nSupport staff on the Orders page.\n\n## Scope\n\n### In\n\n- An \"Export CSV\" button on the Orders page that downloads the rows that match the current filter.\n\n### Out\n\n- Scheduled exports and .xlsx files.\n\n## User stories\n\n1. As support staff, I want to download the filtered orders as a CSV file, so that I can open them in a spreadsheet.\n\n## User-visible behavior\n\n1. When support staff click \"Export CSV\", the browser downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at.\n2. When the filter matches no rows, the file has the header row only.\n\n## Test boundaries\n\nNot agreed. See Open questions.\n\nPrior art: None found\n\n## Decisions\n\n- One new endpoint returns the CSV for the current filter. The button links to it.\n\n## Assumed without asking\n\n- None\n\n## Open questions\n\n- Test boundaries: not agreed yet\n\n## Glossary terms and decision records\n\n- Orders page: GLOSSARY.md\n" }
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
      "/Gaps:[\\s\\S]{0,300}[Tt]est boundar/",
      "/proposed by the agent/i",
      "/^\\s*1\\. [^\\n]+\\n\\s*Blocked by: [Nn]one/m",
      "/\\/grill/",
      "approve"
    ]
  }
}
```

What each check catches:

- A stop with no breakdown fails the `Breakdown for` and first-ticket checks.
- A breakdown with no gap line, or a gap line that does not name the test boundary, fails the `Gaps:` check.
- A boundary that the agent picks with no mark fails the `proposed by the agent` check.
- A ticket file or an edit of the spec fails `noRepoChanges` or the `toolNotCalled` checks.

Not machine-checked:

- Whether the proposed boundary is a good one.
- Whether the agent names the gap in clear words.
