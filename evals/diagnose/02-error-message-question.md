# Eval diagnose/02: a quick question about an error message

## Prompt

```
What does the Node error ERR_MODULE_NOT_FOUND mean?
```

## Setup

- A fresh git repo with the stack installed. The repo is empty except for the install.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`. No edit tools and no `Bash`.

## Expected behaviors

- [ ] The agent makes no `Skill` tool call for `diagnose`. If it does load the skill, it answers the question directly and does not start the phases.
- [ ] The reply explains that Node did not find the module or package that an `import` named.
- [ ] The agent runs no command and writes no notebook.
- [ ] The agent does not ask the user for a failing command or a reproduction.
- [ ] If the reply offers a diagnosis, the offer is one line.

## Failure looks like

- The agent starts Phase 1 and asks for a command that reproduces the error.
- The agent writes a notebook or lists ranked causes for a question that has one answer.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "What does the Node error ERR_MODULE_NOT_FOUND mean?",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Skill"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "diagnose"
    ],
    "toolNotCalled": [
      "Write",
      "Edit",
      "Bash"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/(could not|couldn't|cannot|can't|unable to|fails? to|does not|doesn't) (find|locate|resolve)|not found/i",
      "/\\b(import|module|package)\\b/i"
    ],
    "outputNotMatches": [
      "Ranked causes",
      "/Phase [1-6]/",
      "/(give|send|share|paste|tell) me (the|a|your)[^\\n]{0,40}(command|reproduc|steps)/i"
    ]
  }
}
```

Not machine-checked: that the reply is correct and short, and that any offer of a diagnosis is one line.
