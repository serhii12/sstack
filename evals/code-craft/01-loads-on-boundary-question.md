# Eval code-craft/01: loads for a module boundary question

## Prompt

```
Where should the module boundary go between src/checkout.mjs and the payment provider? How should I shape that interface?
```

## Setup

- A fresh git repo with the stack installed.
- `src/checkout.mjs` adds up a cart and calls the payment provider with `fetch` in the same function. Its test is a `todo`.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] The answer uses "module boundary" or "system boundary". It does not use the bare word "boundary".
- [ ] The answer does not use the word `seam`.
- [ ] The agent changes no file.

## Failure looks like

- The agent answers with no load of the skill.
- The agent edits `src/checkout.mjs`.

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
        "path": "src/checkout.mjs",
        "content": "// Checks out a cart. It talks to the payment provider here, in the same function.\nexport async function checkout(cart, card) {\n  const total = cart.items.reduce((s, i) => s + i.price * i.qty, 0);\n  const res = await fetch(\"https://payments.example.invalid/v1/charges\", {\n    method: \"POST\",\n    headers: { \"content-type\": \"application/json\" },\n    body: JSON.stringify({ amount: Math.round(total * 100), card }),\n  });\n  if (!res.ok) throw new Error(`checkout: the charge failed with status ${res.status}`);\n  const charge = await res.json();\n  return { total, chargeId: charge.id };\n}\n"
      },
      {
        "path": "tests/checkout.test.mjs",
        "content": "import { test } from \"node:test\";\n\ntest.todo(\"checkout charges the card. It needs the network today, so it has no test.\");\n"
      }
    ]
  },
  "prompt": "Where should the module boundary go between src/checkout.mjs and the payment provider? How should I shape that interface?",
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
    "noRepoChanges": true,
    "outputMatches": [
      "/\\b(module|system) boundar(y|ies)\\b/i"
    ],
    "outputNotMatches": [
      "/\\bseams?\\b/i"
    ]
  }
}
```

Not machine-checked: whether the proposed interface is good, and whether a bare "boundary" is left in the answer. A person reads the answer. The place where checkout meets the payment provider is a system boundary, so the regex accepts that term too.
