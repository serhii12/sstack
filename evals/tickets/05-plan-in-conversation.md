# Eval tickets-05: a plan in the conversation and no spec

Kind: task sort. With no spec, the skill must use the plan that the user agreed in this conversation. Nothing is published before approval.

## User prompt

Turn 1:

```
We agreed this plan for a CSV export of the orders report. There is no spec. Problem: support staff copy the orders table by hand into a spreadsheet. In scope: an Export CSV button on the Orders page that downloads the rows that match the current filter. Out of scope: scheduled exports and .xlsx files. Behavior: a click downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at. When the filter matches no rows, the file has the header row only. Test boundaries: GET /orders/export.csv (the response body and headers), and GET /orders (the Export CSV link carries the current filter). Decision: one new endpoint returns the CSV for the current filter, and the button links to it. This plan is final. Ask me nothing now and write no file. Reply OK.
```

Turn 2:

```
/tickets
```

## Setup

- The same small app as tickets-01: `src/orders.mjs`, `src/server.mjs`, `test/orders.test.mjs` and a `GLOSSARY.md` with the term "Orders page".
- No `.scratch/` folder and no `docs/agents/tracker.md`. The plan exists only in turn 1.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. No `Write`, `Edit` or `Bash` rule.

## Expected behavior

- [ ] In turn 2 the agent loads the `tickets` skill.
- [ ] The agent uses the plan from turn 1. It does not tell the user to type `/spec` first.
- [ ] The agent shows the breakdown in the skill format. The first ticket says `Blocked by: None (can start immediately)`.
- [ ] The agent asks for approval and writes no ticket file.

## What a failure looks like

- The agent stops and tells the user to type `/spec` first. The skill did this before 25 Nov 2026.
- The agent writes ticket files before the user approves.

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
      }
    ]
  },
  "prompt": "We agreed this plan for a CSV export of the orders report. There is no spec. Problem: support staff copy the orders table by hand into a spreadsheet. In scope: an Export CSV button on the Orders page that downloads the rows that match the current filter. Out of scope: scheduled exports and .xlsx files. Behavior: a click downloads orders-YYYY-MM-DD.csv with the columns id, customer, total, created_at. When the filter matches no rows, the file has the header row only. Test boundaries: GET /orders/export.csv (the response body and headers), and GET /orders (the Export CSV link carries the current filter). Decision: one new endpoint returns the CSV for the current filter, and the button links to it. This plan is final. Ask me nothing now and write no file. Reply OK.",
  "turns": [
    "/tickets"
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
        "name": "tickets",
        "turn": 2
      }
    ],
    "noRepoChanges": true,
    "toolNotCalled": [
      "Write",
      "Edit"
    ],
    "outputMatches": [
      {
        "pattern": "Breakdown for",
        "turn": 2
      },
      {
        "pattern": "/Blocked by: None/i",
        "turn": 2
      },
      {
        "pattern": "Delivers:",
        "turn": 2
      },
      {
        "pattern": "approve",
        "turn": 2
      }
    ],
    "outputNotMatches": [
      {
        "pattern": "/type `?\\/spec`? first/i",
        "turn": 2
      }
    ]
  }
}
```

What each check catches:

- A stop that sends the user to `/spec` fails the `outputNotMatches` check and the breakdown checks.
- A ticket file, or an attempt to write one, fails `noRepoChanges` and the `toolNotCalled` checks.

Not machine-checked: whether the tickets follow the plan, and whether turn 1 stays a short reply. The grill skill can load in turn 1, because the user gives answers up front.
