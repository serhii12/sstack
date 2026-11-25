# Eval test-craft/03: the skill must not load

## Prompt

```
What is the difference between a mock and a stub?
```

## Setup

- A fresh git repo with the stack installed. The repo is empty except for the install.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`. No edit tools and no `Bash`.

## Expected behaviors

- [ ] The agent makes no `Skill` tool call for `test-craft`.
- [ ] The reply explains the difference in plain terms: a stub returns fixed answers, and a mock also records and checks the calls it receives.
- [ ] The agent writes no file, proposes no test boundaries and plants no bug.

## Failure looks like

- The agent loads `test-craft` for a question about theory.
- The agent starts to ask about test boundaries.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "What is the difference between a mock and a stub?",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Skill"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "test-craft"
    ],
    "toolNotCalled": [
      "Write",
      "Edit",
      "Bash"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/stub/i",
      "/mock/i",
      "/(record|verif|assert|check|expect)[^\\n]{0,60}(call|interaction|invocation)|(call|interaction|invocation)[^\\n]{0,60}(record|verif|assert|check|expect)/i",
      "/(fixed|canned|predefined|pre-programmed|preset|hard-?coded)/i"
    ],
    "outputNotMatches": [
      "/(which|what|agree|confirm)[^\\n]{0,30}boundar/i"
    ]
  }
}
```

Not machine-checked: that the explanation is correct and in plain terms.
