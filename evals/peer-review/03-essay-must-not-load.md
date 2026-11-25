# Eval peer-review/03: the skill must not load

## Prompt

```
Review my essay in essay.md and tell me how to make the argument stronger.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit. `essay.md` has about 10 lines of prose that argue for a ban on cars in city centers.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`, `Agent`.

## Expected behaviors

- [ ] The agent makes no `Skill` tool call for `peer-review`.
- [ ] The agent reads `essay.md` and gives feedback on the argument.
- [ ] The agent starts no subagent and writes no `.artifacts/` file.
- [ ] The agent does not run `review-range.mjs`.

## Failure looks like

- The agent loads `peer-review` for a piece of prose.
- The agent starts a Standards reviewer and a Spec reviewer for an essay.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "essay.md",
        "content": "# Cars out of city centres\n\nCities should ban cars from their centres. Cars take up most of the space in a centre, yet they carry a small share of the people. A street with no cars holds more shops, more trees and more people on foot.\n\nCars also make noise and dirty air. Children and old people suffer most. Cities that closed streets to cars saw shop sales rise.\n\nSome say a ban hurts people who cannot walk far. That is true, so a city must keep buses and permits for them. The ban then helps most people and costs few.\n"
      }
    ]
  },
  "prompt": "Review my essay in essay.md and tell me how to make the argument stronger.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Skill",
    "Agent"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "peer-review"
    ],
    "toolCalled": [
      {
        "name": "Read",
        "inputMatches": "essay\\.md"
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
      "/argument|claim|evidence|premise|counter/i"
    ],
    "outputNotMatches": [
      "/## Standards|## Spec|review-range/"
    ]
  }
}
```

Not machine-checked: that the feedback is sound. The agent has no `Bash` tool, so a run of `review-range.mjs` cannot happen.
