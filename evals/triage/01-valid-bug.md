# Eval triage/01: a valid bug report becomes ready-for-agent

Kind: task sort (a confirmed bug). The skill must check the claim, recommend, wait, and then apply the state that the maintainer accepts.

## Prompt

```
/triage look at .scratch/reports/01-discount-ignored.md
```

Turn 2: `Yes, apply it. Priority P2.`

## Setup

- A fresh temp git repo with the stack installed and a local tracker in `docs/agents/tracker.md`.
- `src/cart.mjs` has a real bug: the discount applies to one unit of an item only. `node src/demo.mjs SAVE10` prints 38. The right total is 36.
- `.scratch/reports/01-discount-ignored.md` is a clear report with steps. `.scratch/reports/02-search-slow.md` is a second open report.
- No real tracker. The runner denies `gh`, `curl`, `wget` and `ssh`.

## Expected behavior

- [ ] Turn 1: the agent reads the report and the code, and runs the demo to check the claim.
- [ ] Turn 1: the reply has the recommendation block with `Category: bug` and `State: ready-for-agent`, and asks "Apply this?".
- [ ] Turn 1: the agent changes no file.
- [ ] Turn 2: the agent sets `Labels: bug, ready-for-agent, P2`, adds `Blocked by: None (can start immediately)` (the older `Blocked by: none` also passes), and appends an Agent Brief with the AI line and acceptance checks.
- [ ] Turn 2: the agent runs the triage check and names `/build` as the next command.
- [ ] The second report is not touched.

## Failure looks like

- The agent applies labels in turn 1, before the maintainer says yes.
- The agent recommends `needs-info` for a report with clear steps that reproduce.
- The brief has no acceptance checks, or no AI line, or names file paths and line numbers.
- The agent edits `src/cart.mjs`. Triage does not fix the bug.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{ \"name\": \"shop\", \"private\": true, \"type\": \"module\" }\n"
      },
      {
        "path": "src/cart.mjs",
        "content": "export const CODES = { SAVE10: 0.1 };\n\n// Returns the total of the cart after the discount code.\nexport function cartTotal(items, code) {\n  const rate = CODES[code] ?? 0;\n  let total = 0;\n  for (const item of items) {\n    total += item.price * (1 - rate) + item.price * (item.qty - 1);\n  }\n  return Math.round(total * 100) / 100;\n}\n"
      },
      {
        "path": "src/demo.mjs",
        "content": "import { cartTotal } from \"./cart.mjs\";\n\nconst code = process.argv[2];\nconsole.log(cartTotal([{ name: \"hat\", price: 20, qty: 2 }], code));\n"
      },
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\nWritten by: the `setup` workflow on 2026-11-25. If the layout changes, edit this file by hand.\n\nSpecs and tickets for this repo are markdown files under `.scratch/`. There is no command line tool. Every action is a file edit.\n\n## Layout\n\n- One folder per feature: `.scratch/<feature>/`. `<feature>` is a short lowercase name with dashes, such as `csv-export`.\n- The spec is `.scratch/<feature>/spec.md`.\n- Tickets are one file each at `.scratch/<feature>/tickets/NN-title.md`, numbered from `01`, blockers first. `NN-title` is the number, a dash and the title in lowercase words joined by dashes, such as `01-login-form.md`. Never put more than one ticket in a file.\n\n## Actions\n\n- Create an issue: write a new file at the path above. If the folder is missing, create it. If the file already exists, stop and ask the user.\n- Read an issue: read the file. The user normally gives the path or the ticket number.\n- List open issues: the files whose `Status:` line is not `closed`.\n- Comment: append the text under a `## Comments` heading at the bottom of the file.\n- Add a label: there are no labels. Add the word to a `Labels:` line near the top of the file. If the line is missing, create it.\n- Link a blocker: the `Blocked by:` line near the top names the blocking ticket files in the same folder. Separate the names with commas, such as `Blocked by: 01-login-form.md, 02-session-store.md`. With no blockers it says `Blocked by: none`. A ticket is unblocked when every file it names has `Status: closed`.\n- Make a sub-issue: a ticket belongs to the spec in its feature folder. Its `Spec:` line points to `../spec.md`.\n- Close an issue: append the reason under `## Comments`, then set `Status: closed`.\n\n## Publish a spec\n\nWrite `.scratch/<feature>/spec.md`.\n\n## Publish tickets\n\nWrite one file for each ticket under `.scratch/<feature>/tickets/`, blockers first, numbered from `01`.\n\n## Fetch a spec or ticket\n\nRead the file at the path the user gives. A bare number such as `03` means the file in `tickets/` that starts with `03-`.\n\n"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "content": "# Discount code ignored when I buy more than one\n\nStatus: open\nLabels: none\nReported by: Dana (customer support)\n\nWhen a customer buys two of the same item, SAVE10 only takes 10% off one of them.\n\nSteps:\n1. Put 2 hats (20 each) in the cart.\n2. Apply the code SAVE10.\n3. The total shows 38. It should be 36.\n\nYou can see it with `node src/demo.mjs SAVE10`.\n"
      },
      {
        "path": ".scratch/reports/02-search-slow.md",
        "content": "# Search is slow\n\nStatus: open\nLabels: none\nReported by: Sam\n\nSearch takes 5 seconds on the products page.\n"
      }
    ]
  },
  "prompt": "/triage look at .scratch/reports/01-discount-ignored.md",
  "turns": [
    "Yes, apply it. Priority P2."
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node:*)",
    "Bash(ls:*)",
    "Bash(echo:*)"
  ],
  "permissionMode": "acceptEdits",
  "budgetUsd": 2,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "triage"
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "turn": 1
      },
      {
        "name": "Edit",
        "turn": 1
      }
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "node[^\\n]*(demo|cart)",
        "turn": 1
      },
      {
        "name": "Bash",
        "inputMatches": "triage-check",
        "turn": 2
      }
    ],
    "outputMatches": [
      {
        "pattern": "/Category:\\s*`?bug/i",
        "turn": 1
      },
      {
        "pattern": "/State:\\s*`?ready-for-agent/i",
        "turn": 1
      },
      {
        "pattern": "/Apply this/i",
        "turn": 1
      },
      {
        "pattern": "/build",
        "turn": 2
      }
    ],
    "onlyFilesChanged": [
      ".scratch/reports/01-discount-ignored.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/^Labels:.*\\bbug\\b/m"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/^Labels:.*\\bready-for-agent\\b/m"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/^Labels:.*\\bP2\\b/m"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/^Status: open$/m"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/^Blocked by:/m"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/This was generated by AI during triage\\.[*_]?\\s*\\n\\s*\\n?#+ Agent Brief/"
      },
      {
        "path": ".scratch/reports/01-discount-ignored.md",
        "pattern": "/#+ Acceptance checks\\s*\\n(\\s*\\n)*\\s*- \\[ \\]/"
      }
    ]
  }
}
```

What each check catches:

- A label change or a comment in turn 1 fails the `toolNotCalled` checks of turn 1.
- A wrong state in the recommendation fails the `State:` check.
- A brief without the AI line right above it, or without a checkbox under `Acceptance checks`, fails `fileMatches`.
- An edit to the code or to the second report fails `onlyFilesChanged`.

Not machine-checked:

- Whether the brief is good: behavior over steps, no file paths, checks that fail before the fix. A person reads it.
- Whether P2 is the right priority. The maintainer decides that.
- Whether the agent quoted the right code path as the cause.
