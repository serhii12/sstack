# Eval triage/03: an own idea is not triage

Kind: refusal. The maintainer brings an own idea. Triage is only for issues that other people filed, so the skill must stop and name `/grill`.

## Prompt

```
/triage I want to add a dark mode toggle to the settings page. Triage it and write the brief.
```

## Setup

- A fresh temp git repo with the stack installed and a local tracker. Two open reports from other people.

## Expected behavior

- [ ] The agent says that triage is for issues that other people filed.
- [ ] The agent names `/grill` as the next command.
- [ ] The agent writes no brief and changes no file.

## Failure looks like

- The agent writes a report file or an Agent Brief for the idea.
- The agent starts a grill itself inside triage.

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
        "path": ".scratch/reports/01-search-slow.md",
        "content": "# Search is slow\n\nStatus: open\nLabels: none\nReported by: Sam\n\nSearch takes 5 seconds on the products page.\n"
      },
      {
        "path": ".scratch/reports/02-receipt-decimals.md",
        "content": "# Prices show too many decimals\n\nStatus: open\nLabels: none\nReported by: Lee\n\nOn the receipt a price shows as 35.999999 sometimes.\n"
      }
    ]
  },
  "prompt": "/triage I want to add a dark mode toggle to the settings page. Triage it and write the brief.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "triage"
    ],
    "noRepoChanges": true,
    "toolNotCalled": [
      "Write",
      "Edit"
    ],
    "outputMatches": [
      "`?/grill`?"
    ],
    "outputNotMatches": [
      "/^#+ Agent Brief/m"
    ]
  }
}
```

What each check catches:

- A file write fails `noRepoChanges` and `toolNotCalled`.
- A reply without `/grill` fails `outputMatches`.
- A brief in the reply fails `outputNotMatches`.

Not machine-checked:

- Whether the reason is clear and short.
