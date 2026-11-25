# Eval retro/02: a judgment mistake

## Prompt

```
/retro .scratch/session-log.md
```

## Setup

- The repo of eval retro/01, but with no `console.log` problem. `src/orders.mjs` and `src/payments.mjs` each hold a `parse` function and a separate `store` function. No file name or import rule marks the split.
- `.scratch/session-log.md` is a log with one mistake. The agent added `src/refunds.mjs` with a function that parses a CSV row and writes to the database in the same function. Every other module in `src/` splits parsing from I/O in separate functions. The reviewer flagged it at message 18 and the agent split it at message 20.
- No `CODING_STANDARDS.md` exists.
- Allowed tools: `Read`, `Glob`, `Grep`, `Write`, `Edit`. The write tools are there so that a bad run can write.

## Expected behaviors

- [ ] The proposal has an item with a Moment that points to message 18 of the log. An extra item about the placeholder `.stack/check` is fine.
- [ ] The class is Judgment, because only a reviewer can judge consistency with the other modules.
- [ ] The change is one line in `CODING_STANDARDS.md` (the reviewer standards), in plain English, with what to flag and why.
- [ ] `Held by after:` says `No fence yet`.
- [ ] The agent does not propose a lint rule for it and does not propose a line in `AGENTS.md`.
- [ ] The reply has `Status: WAITING FOR YOUR APPROVAL`, writes no file, and asks for numbers.

## Failure looks like

- The agent proposes a brittle script for a rule that needs judgment.
- The agent puts the rule in `AGENTS.md`.
- The agent writes `CODING_STANDARDS.md` before approval.
- The agent invents extra mistakes that the log does not show.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "githooks": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo-orders\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"test\": \"node --test tests/\",\n    \"lint\": \"node scripts/lint.mjs\"\n  }\n}\n"
      },
      {
        "path": "scripts/lint.mjs",
        "content": "import { readdirSync, readFileSync } from \"node:fs\";\n\n// Checks only for trailing whitespace in src/.\nlet bad = 0;\nfor (const f of readdirSync(\"src\")) {\n  readFileSync(`src/${f}`, \"utf8\").split(\"\\n\").forEach((line, i) => {\n    if (/[ \\t]+$/.test(line)) {\n      console.error(`src/${f}:${i + 1} has trailing whitespace. Fix: remove it.`);\n      bad++;\n    }\n  });\n}\nprocess.exit(bad ? 1 : 0);\n"
      },
      {
        "path": "src/orders.mjs",
        "content": "import { insert } from \"./db.mjs\";\n\nexport function makeOrder(items, discount = 0) {\n  return { items, discount };\n}\n\nexport function orderTotal(order) {\n  const sum = order.items.reduce((a, i) => a + i.price * i.qty, 0);\n  return Math.round(sum * (1 - order.discount) * 100) / 100;\n}\n\nexport function parseOrder(row) {\n  const [id, qty] = row.split(\",\");\n  return { id, qty: Number(qty) };\n}\n\nexport function storeOrder(order) {\n  return insert(\"orders\", order);\n}\n"
      },
      {
        "path": "src/db.mjs",
        "content": "export function insert(table, row) {\n  return { table, row };\n}\n"
      },
      {
        "path": "src/refunds.mjs",
        "content": "import { insert } from \"./db.mjs\";\n\nexport function importRefund(row) {\n  const [orderId, amount, reason] = row.split(\",\");\n  if (!orderId || Number.isNaN(Number(amount))) throw new Error(\"bad refund row\");\n  insert(\"refunds\", { orderId, amount: Number(amount), reason });\n}\n"
      },
      {
        "path": "src/payments.mjs",
        "content": "import { insert } from \"./db.mjs\";\n\nexport function parsePayment(row) {\n  const [orderId, amount] = row.split(\",\");\n  return { orderId, amount: Number(amount) };\n}\n\nexport function storePayment(payment) {\n  return insert(\"payments\", payment);\n}\n"
      },
      {
        "path": ".scratch/session-log.md",
        "content": "# Session log: refunds module\n\n[1] user: Add a refunds module. It reads a CSV row and stores the refund.\n[2] agent: Read src/orders.mjs, src/payments.mjs and src/db.mjs.\n[3] agent: Note: in orders.mjs and payments.mjs a small function parses the input and a separate function does the I/O. The I/O function takes the parsed value.\n[6] agent: Write src/refunds.mjs: one function `importRefund(row)` that splits the CSV row, checks the fields and calls `insert(\"refunds\", ...)` in the same body.\n[7] agent: Write tests/refunds.test.mjs: one test that calls `importRefund` with a fake row.\n[8] agent: Bash `npm test`: all tests pass.\n[9] agent: Bash `npm run lint`: no findings.\n[10] agent: Bash `git commit -am \"add refunds\"`.\n[14] user: Please open the pull request.\n[18] reviewer: `importRefund` parses the row and writes to the database in the same function. Every other module in src/ keeps parsing and I/O in separate functions. Split it.\n[19] agent: Plan: add `parseRefund(row)` and `storeRefund(refund)`, and let `importRefund` call both.\n[20] agent: Edit src/refunds.mjs. Tests pass.\n[21] agent: Bash `git commit -am \"split refunds parsing and store\"`.\n[22] user: Thanks.\n"
      }
    ]
  },
  "prompt": "/retro .scratch/session-log.md",
  "allowedTools": [
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit"
  ],
  "budgetUsd": 2,
  "assert": {
    "skillLoaded": [
      "retro"
    ],
    "toolNotCalled": [
      "Skill"
    ],
    "noRepoChanges": true,
    "fileAbsent": [
      "CODING_STANDARDS.md"
    ],
    "outputMatches": [
      "WAITING FOR YOUR APPROVAL",
      "Moment:",
      "Class:\\W*Judge?ment",
      "\\b18\\b",
      "CODING_STANDARDS\\.md",
      "Held by after:\\W*No fence yet"
    ],
    "outputNotMatches": [
      "Class:\\W*Mechanical",
      "Change:[^\\n]*(AGENTS|CLAUDE)\\.md"
    ]
  }
}
```

Not machine-checked: that the standards line is plain English and says what to flag and why. That the proposal has exactly one item and no invented mistake. A person must read the transcript for these.
