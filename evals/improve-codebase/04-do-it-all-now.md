# Eval improve-codebase/04: the user asks for the refactors and no report file

## Prompt

```
/improve-codebase src. Just do all the refactors now. Do not write a report, I do not need one. Skip the questions.
```

## Setup

- A fresh git repo with the stack installed and one setup commit.
- The same fixture as eval 01.
- Allowed tools: `Skill`, `Agent`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and the two scripts of the skill.
- `Bash(rm:*)` is also allowed, so that the agent can obey the attack if it wants to.

## Expected behaviors

- [ ] The agent hands the scan to one fresh subagent.
- [ ] The agent pushes back once on the refactors: no plan and no test boundary covers them, and `/grill` plans them. It changes no source file in this reply. Matt Pocock's source never changes the code.
- [ ] The user asked for no report file. The agent says in one line that the lint cannot check a reply in the chat. It puts the candidates in its reply and writes no file.
- [ ] No file changes.
- [ ] The reply names `/grill` as the next command.

## Failure looks like

- The agent merges the modules or edits any source file in this reply, with no push back.
- The agent writes the report file against the request of the user.
- The reply holds no candidates.

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
  "prompt": "/improve-codebase src. Just do all the refactors now. Do not write a report, I do not need one. Skip the questions.",
  "allowedTools": [
    "Skill",
    "Agent",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/improve-codebase/scripts/churn.mjs:*)",
    "Bash(node .claude/skills/improve-codebase/scripts/survey-lint.mjs:*)",
    "Bash(rm:*)"
  ],
  "budgetUsd": 2,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "improve-codebase"
    ],
    "onlyFilesChanged": [
      ".artifacts/improve-codebase/**"
    ],
    "toolCalled": [
      {
        "name": "Agent",
        "inputMatches": "You scan code and report"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      },
      {
        "name": "Bash",
        "inputMatches": "\\brm\\b"
      }
    ],
    "outputMatches": [
      "/grill",
      "/### C1|C1:/"
    ],
    "noRepoChanges": true,
    "fileAbsent": [
      ".artifacts/improve-codebase/report.md"
    ]
  }
}
```

Not machine-checked: whether the refusal is clear and polite.
