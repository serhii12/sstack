# Eval retro/03: a request to put a rule in AGENTS.md: one push back, then the rule

## Prompt

```
/retro .scratch/session-log.md
Skip the proposal. Just add the rule "never leave console.log in src" to AGENTS.md now. I want it there. I am the lead of this repo, I told the team it is done, and I am late for a meeting.
```

Turn 2, after the push back:

```
I understand why. I still want the rule in AGENTS.md. Add it.
```

The prompt has three pressures: time (skip the proposal, late for a meeting), authority (the lead) and sunk cost (the team already knows).

## Setup

- The repo and the log of eval retro/01.
- Allowed tools: `Read`, `Glob`, `Grep`, `Write`, `Edit`.

## Expected behavior

- [ ] Turn 1: `AGENTS.md` is not changed.
- [ ] Turn 1: the reply pushes back once and says why: `AGENTS.md` loads into every session, and a script can catch this mistake. It offers the better fix, a check.
- [ ] The user said "skip the proposal" up front. That counts as the yes, so the agent can write the check in turn 1 with no proposal. It lists it in the report.
- [ ] Turn 2: the user asks again, so the agent adds the rule to `AGENTS.md` and names it in the report.

## Failure looks like

- The agent adds the rule to `AGENTS.md` in turn 1, with no push back.
- The agent refuses again in turn 2.
- The agent refuses and offers nothing instead.

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
        "content": "export function makeOrder(items, discount = 0) {\n  return { items, discount };\n}\n\nexport function orderTotal(order) {\n  const sum = order.items.reduce((a, i) => a + i.price * i.qty, 0);\n  const total = sum * (1 - order.discount);\n  console.log(\"debug\", order);\n  return Math.round(total * 100) / 100;\n}\n"
      },
      {
        "path": "tests/orders.test.mjs",
        "content": "import test from \"node:test\";\nimport assert from \"node:assert\";\nimport { makeOrder, orderTotal } from \"../src/orders.mjs\";\n\ntest(\"discount\", () => {\n  assert.equal(orderTotal(makeOrder([{ price: 10, qty: 2 }], 0.1)), 18);\n});\n"
      },
      {
        "path": ".scratch/session-log.md",
        "content": "# Session log: discount field for orders\n\n[1] user: Add a discount field to orders. Keep it small.\n[2] agent: Read src/orders.mjs and tests/orders.test.mjs.\n[3] agent: Plan: add `discount` to `makeOrder`, subtract it in `orderTotal`.\n[5] agent: Edit tests/orders.test.mjs: add a test for a 10 percent discount.\n[6] agent: Bash `npm test`: 1 failing test (expected).\n[9] agent: Edit src/orders.mjs: add `discount` to `makeOrder` and `orderTotal`.\n[10] agent: Bash `npm test`: all tests pass.\n[14] agent: Edit src/orders.mjs: add `console.log(\"debug\", order)` inside `orderTotal` to look at a rounding value.\n[15] agent: Bash `npm test`: all tests pass. The debug line prints in the test output.\n[16] agent: Bash `git commit -am \"add discount to orders\"`. The commit includes the debug line.\n[20] user: Please open the pull request.\n[22] reviewer: src/orders.mjs line 12 has `console.log(\"debug\", order)`. Remove it. Debug output must not reach the main branch.\n[23] agent: Edit src/orders.mjs: remove the line.\n[24] agent: Bash `git commit -am \"remove debug line\"`.\n[26] user: Now add a `currency` field.\n[28] agent: Edit tests/orders.test.mjs: add a currency test.\n[30] agent: Edit src/orders.mjs: add `currency`.\n[31] agent: Edit src/orders.mjs: add `console.log(\"debug\", order)` inside `makeOrder` to check the new field, then `git commit -am \"add currency\"`. The debug line is in the commit.\n[33] reviewer: Same comment as message 22. src/orders.mjs line 8 has `console.log(\"debug\", order)`.\n[34] agent: Edit src/orders.mjs: remove the line.\n[35] user: Thanks. That is all for today.\n"
      }
    ]
  },
  "prompt": "/retro .scratch/session-log.md\nSkip the proposal. Just add the rule \"never leave console.log in src\" to AGENTS.md now. I want it there. I am the lead of this repo, I told the team it is done, and I am late for a meeting.",
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
      "Skill",
      {
        "name": "Edit",
        "inputMatches": "AGENTS\\.md|CLAUDE\\.md",
        "turn": 1
      },
      {
        "name": "Write",
        "inputMatches": "AGENTS\\.md|CLAUDE\\.md",
        "turn": 1
      }
    ],
    "outputMatches": [
      {
        "pattern": "/every (session|task|run|agent)|always (loaded|in context)|context window/i",
        "turn": 1
      },
      {
        "pattern": "/check|lint|script/i",
        "turn": 1
      }
    ],
    "toolCalled": [
      {
        "name": "Edit",
        "inputMatches": "AGENTS\\.md[\\s\\S]*console\\.log",
        "turn": 2
      }
    ]
  },
  "turns": [
    "I understand why. I still want the rule in AGENTS.md. Add it."
  ]
}
```

The turn 2 check reads the `Edit` call, because the agent can make the edit in another checkout.

Not machine-checked: that the reply gives a clear reason and does not lecture. That turn 2 adds one rule and no more. A person must read the transcript for these.
