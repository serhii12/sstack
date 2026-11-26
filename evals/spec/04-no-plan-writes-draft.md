# Eval spec-04: no plan in the conversation

Kind: task sort (nothing agreed). The skill writes the spec also when nothing was agreed. Every essential is an open question, and the skill invents nothing. The plan has no behavior, so the boundary check of step 5 has nothing to sketch and the agent skips it.

## User prompt

```
/spec dark-mode
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). There is no `docs/agents/tracker.md`, so the skill must use local files.
- `GLOSSARY.md` has the term "Orders page". `docs/adr/` holds only the template.
- Tools allowed: `Skill`, `Read`, `Glob`, `Grep`, `Write`, `Edit` and `Bash(node .claude/skills/spec/scripts/spec-lint.mjs:*)`. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `spec` skill and asks the user no question.
- [ ] The agent writes `.scratch/dark-mode/spec.md` with `Status: draft`, and no other file.
- [ ] The agent runs `spec-lint.mjs` on the spec, and the lint exits 0.
- [ ] Each essential section reads `Not agreed. See Open questions.`, and each has its open question.
- [ ] The reply starts with the `Missing from the spec:` line and tells the user to type `/grill`.
- [ ] The agent invents no plan, no scope and no behavior for "dark mode".

## What a failure looks like

- The agent writes no spec and refuses.
- The agent fills a section from its own ideas about dark mode.
- The agent interviews the user.

## How to run

```
node scripts/eval-run.mjs --eval spec/04-no-plan-writes-draft.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Ordering\n\n**Orders page**:\nThe page where support staff see and filter customer orders.\n_Avoid_: Order list\n" }
    ]
  },
  "prompt": "/spec dark-mode",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Write", "Edit", "Bash(node .claude/skills/spec/scripts/spec-lint.mjs:*)"],
  "assert": {
    "skillLoaded": ["spec"],
    "fileExists": [".scratch/dark-mode/spec.md"],
    "onlyFilesChanged": [".scratch/dark-mode/spec.md"],
    "fileMatches": [
      { "path": ".scratch/dark-mode/spec.md", "pattern": "\\nStatus: draft\\s*\\n" },
      { "path": ".scratch/dark-mode/spec.md", "pattern": "\\n## Problem Statement\\s*\\n+Not agreed\\. See Open questions\\.\\s*\\n" },
      { "path": ".scratch/dark-mode/spec.md", "pattern": "\\n### User-visible behavior\\s*\\n+Not agreed\\. See Open questions\\.\\s*\\n" },
      { "path": ".scratch/dark-mode/spec.md", "pattern": "/Test boundaries: not agreed yet/i" }
    ],
    "toolCalled": [
      { "name": "Bash", "inputMatches": "spec-lint\\.mjs[^\\n]*dark-mode/spec\\.md" }
    ],
    "scriptPasses": [{ "skill": "spec", "script": "spec-lint", "file": ".scratch/dark-mode/spec.md" }],
    "outputMatches": [
      "/^Missing from the spec:/m",
      "/\\/grill/"
    ],
    "outputNotMatches": [
      "/\\?\\s*$/m",
      "Spec not written"
    ]
  }
}
```

What each check catches:

- A refusal fails `fileExists` and the `Missing from the spec` check.
- A section filled from the agent's own ideas fails the `Not agreed` file checks or `spec-lint`.
- A write to another file fails `onlyFilesChanged`.
- A reply that interviews the user fails the `?` check.

Not machine-checked:

- Whether the spec invents a scope or a decision in a section that is not essential. Read the spec.
