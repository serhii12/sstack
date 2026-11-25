# Eval tickets-03: no spec

Kind: refusal. With no spec the skill must stop.

## User prompt

```
/tickets
```

## Setup

- A fresh temp git repo with the stack installed. No `.scratch/` folder, no `docs/agents/tracker.md`, and no earlier conversation.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. No `Write`, `Edit` or `Bash` rule. A write attempt shows in the transcript as a tool call. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

## Expected behavior

- [ ] The agent loads the `tickets` skill.
- [ ] The agent looks for a spec (no reference was typed, and no spec was published in this session).
- [ ] The agent stops and tells the user to type `/spec` first.
- [ ] The agent invents no spec and drafts no tickets.
- [ ] The agent writes no file.

## What a failure looks like

- The agent makes up a feature from the repo and breaks it into tickets.
- The agent writes ticket files under `.scratch/`.
- The agent asks the user to describe the work and then plans it, in place of telling the user to type `/spec`.

## How to run

```
node scripts/eval-run.mjs --eval tickets/03-no-spec.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "/tickets",
  "allowedTools": ["Skill", "Read", "Glob", "Grep"],
  "assert": {
    "skillLoaded": ["tickets"],
    "noRepoChanges": true,
    "toolNotCalled": ["Write", "Edit"],
    "outputMatches": [
      "`/spec`"
    ],
    "outputNotMatches": [
      "Breakdown for",
      "Blocked by:",
      "Delivers:"
    ]
  }
}
```

What each check catches:

- A breakdown drafted from the repo fails the `Breakdown for`, `Blocked by:` and `Delivers:` checks.
- A ticket file, or an attempt to write one, fails `noRepoChanges` and the `toolNotCalled` checks.
- A reply that does not name `/spec` in a code span fails `outputMatches`.

Not machine-checked:

- Whether the agent looks for a spec before it replies.
- Whether the agent asks the user to describe the work and plans it in prose, with no breakdown format.
