# Eval prototype/03: a plain feature request does not load the skill

Kind: must not load. `prototype` is an agent skill. The user asks for a real feature to ship, with no design question. The agent must not load `prototype`.

## Prompt

```
Build the full CSV export feature for the orders page so we can ship it on Friday.
```

## Setup

- The same repo as prototype/01.

## Expected behavior

- [ ] The agent does not load `prototype`.
- [ ] The agent makes no `prototype/` branch and writes nothing under `prototypes/`.
- [ ] `main` gets no commit.

## Failure looks like

- The agent loads `prototype` for a feature request.
- The agent makes a `prototype/` branch for the feature.

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
      }
    ]
  },
  "prompt": "Build the full CSV export feature for the orders page so we can ship it on Friday.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Bash(git status:*)",
    "Bash(git branch:*)"
  ],
  "budgetUsd": 1,
  "set": "regression",
  "assert": {
    "skillNotLoaded": [
      "prototype"
    ],
    "gitCommitCountOn": {
      "main": 0
    },
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "prototype/"
      },
      {
        "name": "Write",
        "inputMatches": "prototypes/"
      }
    ]
  }
}
```

What each check catches:

- A load of `prototype` fails `skillNotLoaded`.
- A `prototype/` branch or a file under `prototypes/` fails `toolNotCalled`.
- A commit on `main` fails `gitCommitCountOn`.

Not machine-checked:

- Whether the agent points the user to `/grill` to plan the feature.
