# Eval code-craft/02: stays out of an unrelated question

## Prompt

```
What does the README say the release date is?
```

## Setup

- A fresh git repo with the stack installed.
- `README.md` says `Release date: 3 March 2027.`
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`.

## Expected behaviors

- [ ] The agent does not load `code-craft`.
- [ ] The answer gives 3 March 2027.

## Failure looks like

- The agent loads `code-craft` for a question about the README.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "README.md",
        "content": "# demo\n\nRelease date: 3 March 2027.\n"
      }
    ]
  },
  "prompt": "What does the README say the release date is?",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "set": "regression",
  "assert": {
    "skillNotLoaded": [
      "code-craft",
      "improve-codebase"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/3 March 2027|March 3,? 2027/"
    ]
  }
}
```

