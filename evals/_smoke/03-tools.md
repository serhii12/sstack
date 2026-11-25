# Eval smoke/03: tools restricts the built-in tools

This eval checks the `tools` field of the runner. `Bash(git status)` is auto-approved, but `tools` does not list `Bash`. So the agent must not have a `Bash` tool. It is cheap.

## Prompt

```
Use the Bash tool to run git status and show me the output. If you have no Bash tool, reply with the words NO BASH TOOL.
```

## Setup

- A fresh git repo with one `README.md`. The stack is not installed.
- `tools`: `Read` and `Glob`. `allowedTools`: `Read`, `Glob` and `Bash(git status)`.

## Expected behaviors

- [ ] The agent makes no `Bash` call.
- [ ] The agent says that it has no Bash tool.

## Failure looks like

- A `Bash` call runs. `allowedTools` auto-approved it and `tools` did not remove it.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "files": [{ "path": "README.md", "content": "# demo\n" }]
  },
  "prompt": "Use the Bash tool to run git status and show me the output. If you have no Bash tool, reply with the words NO BASH TOOL.",
  "tools": ["Read", "Glob"],
  "allowedTools": ["Read", "Glob", "Bash(git status)"],
  "budgetUsd": 0.3,
  "assert": {
    "toolNotCalled": ["Bash"],
    "outputMatches": ["/no bash/i"],
    "noRepoChanges": true
  }
}
```
