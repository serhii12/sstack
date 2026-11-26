# Eval prototype/05: the verdict leaves a pointer in the local ticket

Kind: task sort (logic) with a local ticket. As in Matt Pocock's `prototype`, the issue that holds the question gets a pointer to the branch. Here the issue is a local ticket file.

## Prompt

```
/prototype Can our order model handle a refund after only part of an order has shipped? Name the prototype refund-states. Keep it small. The question comes from the ticket .scratch/refunds/tickets/01-partial-refund.md.
```

Turn 2: `Verdict: yes. A partial refund works if we refund per shipment. Record the verdict.`

## Setup

- The repo of prototype/01: a fresh temp git repo on `main` with the stack installed and one setup commit. `src/orders.mjs` holds the order states.
- A local tracker in `docs/agents/tracker.md`, and the ticket `.scratch/refunds/tickets/01-partial-refund.md`, committed in the setup commit.
- No remote.

## Expected behavior

- [ ] Turn 1: the agent builds the prototype on `prototype/refund-states` and asks for the verdict. It does not touch the ticket.
- [ ] Turn 2: the agent writes the verdict, commits on `prototype/refund-states` and runs `git switch main`.
- [ ] Turn 2: on `main`, the agent appends one line under `## Comments` in the ticket. The line names `prototype/refund-states`.
- [ ] The prototype check exits 0. `main` has no new commit. The only change on `main` is the ticket file.

## Failure looks like

- The ticket has no line that names the branch.
- The agent writes the line in turn 1, before the verdict.
- The agent commits the ticket change on the prototype branch, so `main` never sees the line.
- The agent pushes, merges or rebases.

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
        "path": "src/orders.mjs",
        "content": "// Order states and the moves between them.\nexport const transitions = {\n  new: [\"paid\", \"cancelled\"],\n  paid: [\"shipped\", \"refunded\"],\n  shipped: [\"delivered\"],\n  delivered: [],\n  cancelled: [],\n  refunded: [],\n};\n\nexport function move(state, to) {\n  if (!transitions[state]?.includes(to)) throw new Error(`illegal move: ${state} -> ${to}`);\n  return to;\n}\n"
      },
      {
        "path": "README.md",
        "content": "# shop\n\nOrders move through the states in src/orders.mjs.\n"
      },
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\nWritten by: the `setup` workflow on 2026-11-25. If the layout changes, edit this file by hand.\n\nSpecs and tickets for this repo are markdown files under `.scratch/`. There is no command line tool. Every action is a file edit.\n\n## Layout\n\n- One folder per feature: `.scratch/<feature>/`. `<feature>` is a short lowercase name with dashes, such as `csv-export`.\n- The spec is `.scratch/<feature>/spec.md`.\n- Tickets are one file each at `.scratch/<feature>/tickets/NN-title.md`, numbered from `01`, blockers first. `NN-title` is the number, a dash and the title in lowercase words joined by dashes, such as `01-login-form.md`. Never put more than one ticket in a file.\n\n## Actions\n\n- Create an issue: write a new file at the path above. If the folder is missing, create it. If the file already exists, stop and ask the user.\n- Read an issue: read the file. The user normally gives the path or the ticket number.\n- List open issues: the files whose `Status:` line is not `closed`.\n- Comment: append the text under a `## Comments` heading at the bottom of the file.\n- Add a label: there are no labels. Add the word to a `Labels:` line near the top of the file. If the line is missing, create it.\n- Link a blocker: the `Blocked by:` line near the top names the blocking ticket files in the same folder. Separate the names with commas, such as `Blocked by: 01-login-form.md, 02-session-store.md`. With no blockers it says `Blocked by: none`. A ticket is unblocked when every file it names has `Status: closed`.\n- Make a sub-issue: a ticket belongs to the spec in its feature folder. Its `Spec:` line points to `../spec.md`.\n- Close an issue: append the reason under `## Comments`, then set `Status: closed`.\n\n## Publish a spec\n\nWrite `.scratch/<feature>/spec.md`.\n\n## Publish tickets\n\nWrite one file for each ticket under `.scratch/<feature>/tickets/`, blockers first, numbered from `01`.\n\n## Fetch a spec or ticket\n\nRead the file at the path the user gives. A bare number such as `03` means the file in `tickets/` that starts with `03-`.\n\n"
      },
      {
        "path": ".scratch/refunds/tickets/01-partial-refund.md",
        "content": "# 01: Partial refund\n\nBlocked by: None (can start immediately)\nStatus: open\nLabels: ready-for-agent\nEvidence level: behavior\n\n## What to build\n\nSupport staff can refund the shipped part of an order. One design question is open: can the order model handle a refund after only part of an order has shipped?\n\n## Acceptance checks\n\n- [ ] A refund of a partly shipped order moves the order to a state that the model allows.\n"
      }
    ]
  },
  "prompt": "/prototype Can our order model handle a refund after only part of an order has shipped? Name the prototype refund-states. Keep it small. The question comes from the ticket .scratch/refunds/tickets/01-partial-refund.md.",
  "turns": [
    "Verdict: yes. A partial refund works if we refund per shipment. Record the verdict."
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(git status:*)",
    "Bash(git branch:*)",
    "Bash(git switch:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git log:*)",
    "Bash(git diff:*)",
    "Bash(node .claude/skills/prototype/scripts/prototype-check.mjs:*)"
  ],
  "permissionMode": "acceptEdits",
  "budgetUsd": 3,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "prototype"
    ],
    "gitBranchExists": [
      "prototype/refund-states"
    ],
    "gitCommitCountOn": {
      "main": 0
    },
    "onlyFilesChanged": [
      ".scratch/refunds/tickets/01-partial-refund.md"
    ],
    "fileMatches": [
      {
        "path": ".scratch/refunds/tickets/01-partial-refund.md",
        "pattern": "/## Comments[\\s\\S]*prototype\\/refund-states/"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "01-partial-refund",
        "turn": 1
      },
      {
        "name": "Edit",
        "inputMatches": "01-partial-refund",
        "turn": 1
      },
      {
        "name": "Bash",
        "inputMatches": "git (merge|rebase|stash|push)\\b"
      }
    ],
    "scriptPasses": [
      {
        "skill": "prototype",
        "script": "prototype-check",
        "file": "refund-states"
      }
    ],
    "outputMatches": [
      {
        "pattern": "/verdict/i",
        "turn": 1
      },
      {
        "pattern": "prototype/refund-states",
        "turn": 2
      }
    ]
  }
}
```

What each check catches:

- A ticket with no pointer, or a pointer only on the prototype branch, fails `fileMatches`.
- A checkout left on the prototype branch fails `onlyFilesChanged`, because the prototype files count as changes there.
- A commit on `main` fails `gitCommitCountOn`.
- A ticket edit in turn 1 fails the turn 1 `toolNotCalled` checks.
- A prototype outside its place fails `scriptPasses`.

Not machine-checked:

- Whether the line holds the verdict. A person reads it.
