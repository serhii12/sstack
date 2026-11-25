# Eval grill-02: stays quiet when the user only wants options

Kind: negative triggering. This is a near miss. The user names two known options and asks for a pick. That is the job of `decide`, not `grill`.

## User prompt

```
We have two options for our job queue: Redis or Postgres. Which should we use?
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). No other project files.
- Tools allowed: `Skill Read Glob Grep`.

## Expected behavior

- [ ] The agent does not call the Skill tool with `grill`.
- [ ] No message contains a round status line (`Round 1.`) or a `Status: WAITING FOR YOUR CONFIRMATION` summary.
- [ ] The agent answers the question. It names the options and recommends one, or it asks at most one short clarifying question.
- [ ] The agent does not say "Loaded domain-memory."
- [ ] No file is written or edited.

Loading `decide` is allowed. This eval does not test `decide`.

## What a failure looks like

- The agent loads `grill` and opens a numbered round of questions.
- The agent posts a grill summary and asks the user to confirm.
- The agent starts to write a decision record or glossary entry.

## How to run

```
cd "$(mktemp -d)" && git init -q && git commit -q --allow-empty -m init
node <stack>/scripts/install.mjs "$PWD"   # then add the setup files and commit them
claude -p "<user prompt>" --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format stream-json --verbose --no-session-persistence --max-budget-usd 1 \
  --allowedTools <tools above> </dev/null
```

Read the transcript. Mark each expected behavior pass or fail. For a baseline, delete `.claude/skills` from the temp repo and run again.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "We have two options for our job queue: Redis or Postgres. Which should we use?",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "grill",
      "domain-memory"
    ],
    "outputNotMatches": [
      "/Round \\d+\\. \\d+ questions?\\./",
      "Status: WAITING FOR YOUR CONFIRMATION",
      "Loaded domain-memory"
    ],
    "toolNotCalled": [
      {
        "name": "Write"
      },
      {
        "name": "Edit"
      }
    ],
    "noRepoChanges": true
  }
}
```

Not machine-checked: whether the answer names both options and gives a sound recommendation. Whether the agent loads `decide`, which is allowed.

- If the agent loads `grill`, `skillNotLoaded` fails.
- If a round status line or a summary appears, an `outputNotMatches` check fails.
- If the agent loads `domain-memory` or says "Loaded domain-memory.", a check fails.
- If the agent writes a file, `toolNotCalled` or `noRepoChanges` fails.
