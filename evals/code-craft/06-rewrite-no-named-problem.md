# Eval code-craft/06: a rewrite with no named problem gets one push back, then the rewrite

## Prompt

```
Use code-craft. Rewrite src/pricing.mjs from scratch. I want it cleaner and more modern.
```

Turn 2, after the push back:

```
I understand that no test fails today. Rewrite it anyway.
```

## Setup

- A fresh git repo with the stack installed. The session starts on the task branch `task/pricing`, so the agent can edit in place.
- The fixture of eval 05: `order-service.mjs` forwards every call to `order-store.mjs`, and `pricing.mjs` is a deep module with a test.
- Every test passes.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and the test command. The permission mode accepts edits, so the agent can do the rewrite if it wants to.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] Turn 1: the agent changes no file. The reply says that no problem is named or that no test fails, and it asks which problem the rewrite must solve.
- [ ] Turn 2: the user confirms, so the agent rewrites `src/pricing.mjs`. It changes no other file.
- [ ] Turn 2: the reply names what the rewrite costs, for example that no test proves the new code is better.

## Failure looks like

- The agent rewrites `src/pricing.mjs` in turn 1, with no push back.
- The agent refuses again in turn 2.
- The agent changes files other than `src/pricing.mjs`.

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
    ],
    "branch": "task/pricing"
  },
  "prompt": "Use code-craft. Rewrite src/pricing.mjs from scratch. I want it cleaner and more modern.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node --test:*)",
    "Bash(npm test:*)"
  ],
  "permissionMode": "acceptEdits",
  "budgetUsd": 1.5,
  "set": "capability",
  "assert": {
    "skillLoaded": [
      "code-craft"
    ],
    "toolNotCalled": [
      {
        "name": "Edit",
        "turn": 1
      },
      {
        "name": "Write",
        "turn": 1
      },
      "Agent",
      "Task"
    ],
    "outputMatches": [
      {
        "pattern": "/\\?|which problem|what problem|named problem|which of these|no (failing )?test/i",
        "turn": 1
      }
    ],
    "onlyFilesChanged": [
      "src/pricing.mjs"
    ],
    "fileMatches": [
      {
        "path": "src/pricing.mjs",
        "pattern": "^(?![\\s\\S]*const rate = coupon === undefined \\? 0 : COUPONS\\[coupon\\];\\n  if \\(rate === undefined\\) throw)"
      },
      {
        "path": "src/pricing.mjs",
        "pattern": "priceOrder"
      }
    ]
  },
  "turns": [
    "I understand that no test fails today. Rewrite it anyway."
  ]
}
```

Not machine-checked: whether the question is a good one, and whether the named check can fail. The regex sees only a question mark or words such as "which problem" and "named problem". The checks that matter are `toolNotCalled` in turn 1 and `onlyFilesChanged`. The first `fileMatches` check fails when the two old lines of the coupon lookup are still there word for word. A rewrite that keeps them fails it too, so read the transcript.

This eval is a capability eval, because the user asked for the change and the agent must judge the request.
