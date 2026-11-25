# Eval smoke/01: read-only question with the stack installed

This eval checks the runner and the stack together. It is cheap. It is a machine-readable version of the idea in `evals/start/01-read-only-question.md`.

## Prompt

```
/start what does the README say?
```

## Setup

- A fresh git repo with the stack installed (`node scripts/install.mjs <dir>`) and one `README.md`.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`, `Write` for the handoff note.

## Expected behaviors

- [ ] The `start` skill loads.
- [ ] The agent makes no change in the repo (no edit, no branch, no commit).
- [ ] The agent does not tell the user to type a command that is not built: `/prove`, `/ship`, `/pr-body`, `/skill-craft`, `/security-review`.
- [ ] The run ends with a normal result.

## Failure looks like

- The agent edits `README.md` or creates a branch.
- The reply tells the user to type `/ship` or another command that is not built.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "README.md", "content": "# demo\n\nA small demo project. It has no code yet.\n" }
    ]
  },
  "prompt": "/start what does the README say?",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Write"],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": ["start"],
    "noRepoChanges": true,
    "outputNotMatches": ["/(prove|ship|pr-body|skill-craft|security-review)\\b"]
  }
}
```
