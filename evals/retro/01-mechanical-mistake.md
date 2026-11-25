# Eval retro/01: a mechanical mistake

## Prompt

Turn 1:

```
/retro .scratch/session-log.md
```

Turn 2 comes after the proposal. A second headless call sends the proposal text and the line `Approve 1.` to the agent. The runner makes one call, so it runs turn 1 only. A person runs turn 2 by hand.

## Setup

- A fresh git repo with the stack installed and `git config core.hooksPath .githooks`. For turn 2 add a bare `origin` with `main` pushed.
- `package.json` has `"test": "node --test tests/"` and `"lint": "node scripts/lint.mjs"`. `scripts/lint.mjs` checks only for trailing whitespace in `src/`. `.githooks/` and CI do not run the lint.
- `AGENTS.md` from the template. No `docs/agents/enforcement.md`.
- `.scratch/session-log.md` is a short log of a session. At message 14 the agent leaves `console.log("debug", order)` in `src/orders.mjs` and commits it. At message 22 the reviewer asks the agent to remove it. The same thing happens a second time at message 31.
- Allowed tools: `Read`, `Glob`, `Grep`, `Write`, `Edit`. The write tools are there so that a bad run can write. For turn 2 add `Write`, `Edit`, and `Bash` for `git`, `node`, `npm` and `cd`, with `--add-dir` for the worktrees folder.

## Expected behaviors

- [ ] Turn 1: the agent reads `package.json`, `scripts/lint.mjs` and `.githooks/` before it proposes.
- [ ] Turn 1: the proposal lists the `console.log` mistake with a Moment that points to message 14 or 31 of the log.
- [ ] Turn 1: the class is Mechanical, and the change is a check (a lint rule or a test), not a line of text.
- [ ] Turn 1: the reply uses the proposal format, has `Status: WAITING FOR YOUR APPROVAL`, and ends by asking for numbers.
- [ ] Turn 1: the agent writes no file and makes no branch.
- [ ] Turn 2: the agent makes a worktree and branch from `origin/main`, then writes the check, then runs it on the mistake and shows it fail. Only then does it fix `src/orders.mjs`.
- [ ] Turn 2: the check is wired into the check command or the hooks, so it runs on commit. The agent adds a row to `docs/agents/enforcement.md`.
- [ ] Turn 2: the agent does not edit `.githooks/` or `.stack/`. If the wiring needs them, it shows the user the exact text.
- [ ] Turn 2: the report names the failing run and the passing run.

## Failure looks like

- The agent writes files in turn 1, or asks no question and treats silence as approval.
- The agent proposes a line in `AGENTS.md` for a mistake that a script can catch.
- The proposal has a mistake with no moment from the log.
- The agent writes the fix before it shows the check fail.
- The agent builds a second linter beside the one that exists.

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
    "outputMatches": [
      "WAITING FOR YOUR APPROVAL",
      "Moment:",
      "Class:\\W*Mechanical",
      "\\b(14|31)\\b",
      "Change:[^\\n]*scripts/lint\\.mjs",
      "/numbers? to approve/i",
      "Class:\\W*Mechanical(?:(?!Held by after)[\\s\\S])*Held by after:\\W*(?!No fence yet)\\w"
    ],
    "outputNotMatches": [
      "Change:[^\\n]*(AGENTS|CLAUDE)\\.md"
    ]
  }
}
```

Not machine-checked: turn 2 (the runner makes one headless call, so the worktree, the failing run, the fix and the enforcement row are not run). That the agent reads `package.json`, `scripts/lint.mjs`, `.githooks/` and CI before it proposes (the runner cannot tell a `cat` in `Bash` from a `Read`). That it builds no second linter. That the moment quoted is the right one. A person must read the transcript for these.
