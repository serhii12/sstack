# Eval triage/04: a request that matches a prior rejection closes as wontfix

Kind: task sort (a rejected enhancement). The report asks for an idea that `.out-of-scope/dark-mode.md` rejected. The skill must find the match by idea, quote the old reason, and close the report only after the maintainer confirms.

## Prompt

```
/triage .scratch/reports/01-night-theme.md
```

Turn 2: `Yes, the old decision stands. Close it.`

## Setup

- A fresh temp git repo with the stack installed and a local tracker.
- `.out-of-scope/dark-mode.md` records an old rejection of dark mode.
- `.scratch/reports/01-night-theme.md` asks for a "night theme". The words differ from the record. The idea is the same.

## Expected behavior

- [ ] Turn 1: the agent matches the report to `dark-mode.md` by idea and quotes its reason.
- [ ] Turn 1: the recommendation is `enhancement` and `wontfix`. The agent changes no file.
- [ ] Turn 2: the agent adds the report to "Prior requests" in `dark-mode.md`.
- [ ] Turn 2: the agent posts a Triage Decision that names `.out-of-scope/dark-mode.md`, sets `wontfix`, and sets `Status: closed`.
- [ ] Turn 2: the agent runs the triage check.

## Failure looks like

- The agent misses the match because the words differ.
- The agent closes the report in turn 1.
- The agent writes a new `.out-of-scope/` file for the same idea.

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
        "path": ".scratch/reports/01-night-theme.md",
        "content": "# Please add a night theme\n\nStatus: open\nLabels: none\nReported by: Kim\n\nThe app is too bright at night. Please add a night theme or a dark option in the settings.\n"
      },
      {
        "path": ".out-of-scope/dark-mode.md",
        "content": "# Dark mode\n\nThis project does not support dark mode or user themes.\n\n## Why this is out of scope\n\nThe receipts and the shop pages print on paper in the stores, and the brand rules allow one palette only. A second theme needs a theme switch in every page and a store for the choice of each user.\n\n## Prior requests\n\n- 07-dark-mode.md: \"Dark mode please\"\n"
      }
    ]
  },
  "prompt": "/triage .scratch/reports/01-night-theme.md",
  "turns": [
    "Yes, the old decision stands. Close it."
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
        "inputMatches": "triage-check",
        "turn": 2
      }
    ],
    "outputMatches": [
      {
        "pattern": "dark-mode\\.md",
        "turn": 1
      },
      {
        "pattern": "/State:\\s*`?wontfix/i",
        "turn": 1
      }
    ],
    "onlyFilesChanged": [
      ".scratch/reports/01-night-theme.md",
      ".out-of-scope/dark-mode.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/reports/01-night-theme.md",
        "pattern": "/^Labels:.*\\benhancement\\b/m"
      },
      {
        "path": ".scratch/reports/01-night-theme.md",
        "pattern": "/^Labels:.*\\bwontfix\\b/m"
      },
      {
        "path": ".scratch/reports/01-night-theme.md",
        "pattern": "/^Status: closed$/m"
      },
      {
        "path": ".scratch/reports/01-night-theme.md",
        "pattern": "/This was generated by AI during triage\\.[*_]?\\s*\\n\\s*\\n?#+ Triage Decision/"
      },
      {
        "path": ".scratch/reports/01-night-theme.md",
        "pattern": "\\.out-of-scope/dark-mode\\.md"
      },
      {
        "path": ".out-of-scope/dark-mode.md",
        "pattern": "01-night-theme"
      }
    ]
  }
}
```

What each check catches:

- A missed match fails the `dark-mode.md` check of turn 1.
- A close in turn 1 fails the `toolNotCalled` checks of turn 1.
- A new record file, or an edit to another file, fails `onlyFilesChanged`.
- A report that is not closed, has no Triage Decision, or does not name the record fails `fileMatches`.
- A record without the new request fails the last `fileMatches` check.

Not machine-checked:

- Whether the match is right. The maintainer decides if the old decision still stands.
- Whether the closing comment is polite and clear.
