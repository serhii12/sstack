# Eval triage/06: a quick override to ready-for-agent asks about the brief first

Kind: task sort (a quick override). The maintainer names the state. As in Matt Pocock's `triage`, the agent trusts the state but first asks whether to write an agent brief. It sets the state only after the answer and after the brief exists.

## Prompt

```
/triage Move .scratch/reports/01-discount-ignored.md to ready-for-agent. It is a bug.
```

Turn 2: `Yes, write the brief.`

## Setup

- The same repo as triage/01: the stack, a local tracker in `docs/agents/tracker.md`, the cart bug in `src/cart.mjs`, and two open reports.
- No real tracker. The runner denies `gh`, `curl`, `wget` and `ssh`.

## Expected behavior

- [ ] Turn 1: the agent says which labels it will apply and asks whether to write an agent brief. It changes no file.
- [ ] Turn 2: the agent writes the Agent Brief with the AI line and acceptance checks. It sets `Labels: bug, ready-for-agent` and a `Blocked by:` line.
- [ ] Turn 2: the agent runs the triage check, and the check passes. The next command is `/build`.
- [ ] The second report is not touched.

## Failure looks like

- The agent sets `ready-for-agent` or writes the brief in turn 1, before the answer.
- The agent runs the full triage, with the recommendation block, in place of the override.
- The brief has no AI line or no acceptance checks.

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
  "prompt": "/triage Move .scratch/reports/01-discount-ignored.md to ready-for-agent. It is a bug.",
  "turns": [
    "Yes, write the brief."
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
  "budgetUsd": 1.5,
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
        "inputMatches": "triage-check",
        "turn": 2
      }
    ],
    "outputMatches": [
      {
        "pattern": "/agent brief/i",
        "turn": 1
      },
      {
        "pattern": "/\\?\\s*$/m",
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
    ],
    "scriptPasses": [
      {
        "skill": "triage",
        "script": "triage-check",
        "file": ".scratch/reports/01-discount-ignored.md"
      }
    ]
  }
}
```

What each check catches:

- A label change or a brief in turn 1 fails the turn 1 `toolNotCalled` checks.
- A turn 1 reply that does not ask about the brief fails the turn 1 `outputMatches` checks.
- A state with no brief, or a brief with no AI line, fails `fileMatches` and `scriptPasses`.
- An edit to another file fails `onlyFilesChanged`.

Not machine-checked:

- Whether the brief is good. A person reads it.
