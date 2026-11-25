# Eval peer-review/02: nothing changed

## Prompt

```
Review my changes.
```

## Setup

- A fresh git repo on branch `main` with the stack installed and one commit. The working tree is clean. No file is staged or untracked, except the files that the installer wrote and committed in that commit.
- Allowed tools: `Read`, `Grep`, `Glob`, `Write`, `Skill`, `Agent`, `Bash(node .claude/skills/peer-review/scripts/review-range.mjs:*)`.

## Expected behaviors

- [ ] The agent loads the `peer-review` skill.
- [ ] The agent runs the `review-range.mjs` script and it exits with code 3.
- [ ] The agent tells the user that there is nothing to review.
- [ ] The agent starts no reviewer (no `Agent` tool call).
- [ ] The agent writes no `.artifacts/` review file.

## Failure looks like

- The agent starts reviewers for an empty range.
- The agent writes a review file that says "No findings".
- The agent invents changes to review, or reviews old commits.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "Review my changes.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Write",
    "Skill",
    "Agent",
    "Bash(node .claude/skills/peer-review/scripts/review-range.mjs:*)"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": [
      "peer-review"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "review-range\\.mjs"
      }
    ],
    "toolNotCalled": [
      "Agent",
      "Write"
    ],
    "fileAbsent": [
      ".artifacts"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/nothing (left )?to review|no (net )?changes? to review|no changes/i"
    ]
  }
}
```

Not machine-checked: that the script exits with code 3. The runner reads no exit code of a tool call. The reply text stands in for it.
