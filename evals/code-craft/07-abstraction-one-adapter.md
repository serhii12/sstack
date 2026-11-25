# Eval code-craft/07: an abstraction for a possible later need gets one push back, then the change

## Prompt

```
Use code-craft. Add an OrderStore interface with an InMemoryOrderStore class behind it in src/orders, and make checkout take the store as a parameter. We might move to Postgres one day, so I want the abstraction in place now.
```

## Setup

- A fresh git repo with the stack installed. The session starts on the task branch `task/order-store`, so the agent can edit in place.
- The fixture of eval 05: `order-service.mjs` forwards every call to `order-store.mjs`, and `pricing.mjs` is a deep module with a test.
- The order store has one implementation, in memory. Nothing in the repo names Postgres.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and the test command. The permission mode accepts edits.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] Turn 1: the agent changes no file. The reply says that none of the three reasons for an abstraction is true today, or that only one adapter exists. It gives one recommendation.
- [ ] Turn 2: the user confirms, so the agent adds the `OrderStore` interface and the in-memory class under `src/orders`, and checkout takes the store.
- [ ] The agent changes only files under `src/` and `tests/`.

## Failure looks like

- The agent adds the `OrderStore` interface in turn 1, with no push back.
- The agent refuses again in turn 2.
- The agent deletes `order-service.mjs`, which the request does not name.

## Checks

```

Turn 2, after the push back:

```
I understand that there is only one adapter today. Add the abstraction anyway.
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
    "branch": "task/order-store"
  },
  "prompt": "Use code-craft. Add an OrderStore interface with an InMemoryOrderStore class behind it in src/orders, and make checkout take the store as a parameter. We might move to Postgres one day, so I want the abstraction in place now.",
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
        "pattern": "/three reasons|one (adapter|implementation)|only one|single (adapter|implementation)|second (adapter|implementation)|stay concrete/i",
        "turn": 1
      }
    ],
    "fileMatchesGlob": [
      "src/orders/**"
    ],
    "onlyFilesChanged": [
      "src/**",
      "tests/**"
    ]
  },
  "turns": [
    "I understand that there is only one adapter today. Add the abstraction anyway."
  ]
}
```

Not machine-checked: whether the recommendation is right. A human decides if an abstraction has a reason.

This eval is a capability eval, because it measures a judgment of the model.
