# Eval improve-codebase/01: one shallow pass-through module

## Prompt

```
/improve-codebase src
```

Turn 2: `C1`

## Setup

- A fresh git repo with the stack installed and one setup commit.
- `src/orders/order-service.mjs` forwards each of its four functions to `src/orders/order-store.mjs` with the same parameters. `src/pricing.mjs` is a deep module with a small interface. Each module has tests.
- Allowed tools: `Skill`, `Agent`, `Read`, `Glob`, `Grep`, `Write`, `Edit`, and the two scripts of the skill.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] The agent hands the scan to one fresh subagent with the brief of `SCAN-BRIEF.md`. It does this before it writes the report.
- [ ] The report at `.artifacts/improve-codebase/report.md` names `order-service.mjs` in the Files field of a candidate.
- [ ] The problem says that the service fails the deletion test, or calls it shallow or a pass-through.
- [ ] `survey-lint` passes on the report.
- [ ] No source file changes. The report folder holds a `.gitignore` with `*`, so git shows no new file.
- [ ] The turn 1 reply asks "Which of these would you like to explore?" and stops. It does not load `grill` in turn 1.
- [ ] Turn 2: the agent loads `grill` and starts round 1 on C1, with the round status line.

## Failure looks like

- The agent scans the code itself and starts no subagent.
- The agent merges the modules or edits a test.
- The report misses the pass-through service.
- The report shows in `git status` as an untracked file.
- The agent starts a grill in turn 1, before the user picks a candidate.
- Turn 2 tells the user to type `/grill` in a fresh session and grills nothing.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/orders/order-store.mjs",
        "content": "// Keeps orders in memory. Checks each order before it stores it.\nconst rows = new Map();\n\nexport function insertOrder(order) {\n  if (!order.id) throw new Error(\"insertOrder: the order has no id. Fix: give the order an id.\");\n  if (!Array.isArray(order.items) || order.items.length === 0) throw new Error(`insertOrder: order ${order.id} has no items. Fix: add an item.`);\n  rows.set(order.id, { ...order, createdAt: order.createdAt ?? new Date(0).toISOString() });\n  return rows.get(order.id);\n}\n\nexport function findOrder(id) {\n  return rows.get(id) ?? null;\n}\n\nexport function selectOrders(customerId) {\n  return [...rows.values()].filter((o) => o.customerId === customerId);\n}\n\nexport function removeOrder(id) {\n  return rows.delete(id);\n}\n"
      },
      {
        "path": "src/orders/order-service.mjs",
        "content": "import { findOrder, insertOrder, removeOrder, selectOrders } from \"./order-store.mjs\";\n\nexport function getOrder(id) {\n  return findOrder(id);\n}\n\nexport function saveOrder(order) {\n  return insertOrder(order);\n}\n\nexport function listOrders(customerId) {\n  return selectOrders(customerId);\n}\n\nexport function deleteOrder(id) {\n  return removeOrder(id);\n}\n"
      },
      {
        "path": "src/pricing.mjs",
        "content": "// Prices an order. Callers pass the items and an optional coupon.\nconst COUPONS = { TEN: 0.1, HALF: 0.5 };\n\nexport function priceOrder(items, { coupon } = {}) {\n  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);\n  const rate = coupon === undefined ? 0 : COUPONS[coupon];\n  if (rate === undefined) throw new Error(`priceOrder: unknown coupon ${coupon}. Fix: use TEN or HALF.`);\n  const discount = Math.round(subtotal * rate * 100) / 100;\n  return { subtotal, discount, total: subtotal - discount };\n}\n"
      },
      {
        "path": "src/checkout.mjs",
        "content": "import { saveOrder } from \"./orders/order-service.mjs\";\nimport { priceOrder } from \"./pricing.mjs\";\n\nexport function checkout(order, coupon) {\n  const price = priceOrder(order.items, { coupon });\n  return saveOrder({ ...order, total: price.total });\n}\n"
      },
      {
        "path": "tests/order-service.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { getOrder, saveOrder } from \"../src/orders/order-service.mjs\";\n\ntest(\"saveOrder then getOrder returns the order\", () => {\n  saveOrder({ id: \"o1\", customerId: \"c1\", items: [{ price: 2, qty: 1 }] });\n  assert.equal(getOrder(\"o1\").customerId, \"c1\");\n});\n"
      },
      {
        "path": "tests/order-store.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { findOrder, insertOrder } from \"../src/orders/order-store.mjs\";\n\ntest(\"insertOrder then findOrder returns the order\", () => {\n  insertOrder({ id: \"o2\", customerId: \"c1\", items: [{ price: 2, qty: 1 }] });\n  assert.equal(findOrder(\"o2\").customerId, \"c1\");\n});\n\ntest(\"insertOrder refuses an order with no items\", () => {\n  assert.throws(() => insertOrder({ id: \"o3\", items: [] }), /no items/);\n});\n"
      },
      {
        "path": "tests/pricing.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { priceOrder } from \"../src/pricing.mjs\";\n\ntest(\"a TEN coupon takes 10 percent off\", () => {\n  assert.deepEqual(priceOrder([{ price: 50, qty: 2 }], { coupon: \"TEN\" }), { subtotal: 100, discount: 10, total: 90 });\n});\n"
      }
    ]
  },
  "prompt": "/improve-codebase src",
  "allowedTools": [
    "Skill",
    "Agent",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/improve-codebase/scripts/churn.mjs:*)",
    "Bash(node .claude/skills/improve-codebase/scripts/survey-lint.mjs:*)"
  ],
  "budgetUsd": 2,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      {
        "name": "improve-codebase",
        "turn": 1
      },
      {
        "name": "code-craft",
        "turn": 1
      },
      {
        "name": "grill",
        "turn": 2
      }
    ],
    "skillNotLoaded": [
      {
        "name": "grill",
        "turn": 1
      }
    ],
    "fileExists": [
      ".artifacts/improve-codebase/report.md",
      ".artifacts/improve-codebase/.gitignore"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/improve-codebase/report.md",
        "pattern": "/Files:[\\s\\S]{0,300}?order-service\\.mjs/i"
      },
      {
        "path": ".artifacts/improve-codebase/.gitignore",
        "pattern": "/^\\*\\s*$/m"
      }
    ],
    "scriptPasses": [
      {
        "skill": "improve-codebase",
        "script": "survey-lint",
        "file": ".artifacts/improve-codebase/report.md"
      }
    ],
    "onlyFilesChanged": [
      "GLOSSARY.md",
      "docs/adr/**"
    ],
    "toolCalled": [
      {
        "name": "Agent",
        "inputMatches": "You scan code and report",
        "turn": 1
      }
    ],
    "toolOrder": [
      {
        "before": "Agent",
        "after": {
          "name": "Write",
          "inputMatches": "improve-codebase/report\\.md"
        },
        "turn": 1
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)",
        "turn": 1
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)",
        "turn": 1
      },
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"[^\"]*(?:src|tests)/",
        "turn": 2
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"[^\"]*(?:src|tests)/",
        "turn": 2
      }
    ],
    "outputMatches": [
      {
        "pattern": "/Which of these would you like to explore\\?/i",
        "turn": 1
      },
      {
        "pattern": "/Round 1\\. [0-9]+ questions?\\./",
        "turn": 2
      }
    ]
  },
  "turns": [
    "C1"
  ]
}
```

Not machine-checked: whether only one subagent ran, and whether the rank is right. A person also judges the proposed module boundary. The report must not flag `pricing.mjs` without a reason. A person reads the report.

- If the report has no candidate with `order-service.mjs` in its Files field, `fileMatches` fails.
- If no `Agent` call holds the first line of the brief, `toolCalled` fails.
- If no `Agent` call comes before the first `Write` of the report, `toolOrder` fails.
- If the report breaks its shape, `scriptPasses` fails.
- If git sees the report as a new file, or any file other than the glossary and the decision records changes, `onlyFilesChanged` fails. The runner lists new files with `git ls-files --others --exclude-standard`, so an ignored report does not count.
- If turn 1 writes outside `.artifacts/improve-codebase/`, or turn 2 edits code or tests, `toolNotCalled` fails.
- If turn 1 does not ask the question, or loads `grill`, the turn 1 `outputMatches` or `skillNotLoaded` check fails.
- If turn 2 does not load `grill` and start round 1, the turn 2 checks fail.
