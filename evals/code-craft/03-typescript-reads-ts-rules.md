# Eval code-craft/03: a TypeScript file makes it read TYPESCRIPT.md

## Prompt

```
In src/orders.ts, should totalFor take the whole Order or only the fields that it reads? How should I shape this interface? Do not change any file.
```

## Setup

- A fresh git repo with the stack installed.
- A TypeScript repo with `tsconfig.json`, `src/types.ts` and `src/orders.ts`. `totalFor(order: Order)` reads only `items` and `shippingFee`.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] The agent reads `code-craft/TYPESCRIPT.md`.
- [ ] The agent changes no file.

## Failure looks like

- The agent never opens `TYPESCRIPT.md` for a TypeScript question.
- The agent edits `src/orders.ts`.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"devDependencies\": { \"typescript\": \"5.9.3\" }\n}\n"
      },
      {
        "path": "tsconfig.json",
        "content": "{\n  \"compilerOptions\": { \"strict\": true, \"target\": \"es2022\", \"module\": \"nodenext\", \"noEmit\": true },\n  \"include\": [\"src\"]\n}\n"
      },
      {
        "path": "src/types.ts",
        "content": "export type Order = {\n  id: string;\n  customerId: string;\n  items: { price: number; qty: number }[];\n  shippingFee: number;\n  createdAt: string;\n  notes: string;\n};\n"
      },
      {
        "path": "src/orders.ts",
        "content": "import type { Order } from \"./types.ts\";\n\nexport function totalFor(order: Order): number {\n  const items = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);\n  return items + order.shippingFee;\n}\n"
      }
    ]
  },
  "prompt": "In src/orders.ts, should totalFor take the whole Order or only the fields that it reads? How should I shape this interface? Do not change any file.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "set": "capability",
  "assert": {
    "skillLoaded": [
      "code-craft"
    ],
    "toolCalled": [
      {
        "name": "Read",
        "inputMatches": "code-craft/TYPESCRIPT\\.md"
      }
    ],
    "noRepoChanges": true
  }
}
```

Not machine-checked: whether the advice is right. The rule in `RULES.md` says to ask for the data that the function reads. If the function uses all the fields of a bundle, it takes the bundle.
