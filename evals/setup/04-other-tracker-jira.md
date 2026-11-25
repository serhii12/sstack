# Eval setup-04: another tracker (Jira), recorded as free text

Kind: task sort (Other). The user names Jira and describes how to work with it. The skill must recommend Jira as the Other tracker, take one section at a time, and write `docs/agents/tracker.md` as free text with `Tracker: other`. It runs no `jira` command.

## User prompt

```
/setup We track work in Jira, project WID. Read an issue with `jira issue view WID-<n>`. Create one with `jira issue create -p WID -s "<title>" -b "<body>"`. Comment with `jira issue comment add WID-<n> "<text>"`. Add a label with `jira issue edit WID-<n> -l <label>`. Link a blocker with `jira issue link WID-<n> WID-<m> Blocks`. Close with `jira issue move WID-<n> Done`.
```

Turn 2: `Yes, Jira.`

Turn 3: `Yes, keep the default labels.`

Turn 4: `Yes, write both files.`

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`) and one setup commit. No remote, no `docs/agents/`.
- The install copies the triage skill, so the label section runs.
- Tools allowed: `Skill`, `Read`, `Glob`, `Grep`, `Write` and `Edit`. Nothing reaches the network.

## Expected behavior

- [ ] The agent loads the `setup` skill.
- [ ] Turn 1: the reply recommends Jira as the tracker, with the `Recommended: yes` line, and asks one question. It does not ask for the workflow again, because the user gave it. It writes no file.
- [ ] Turn 2: the agent asks the label question, "Keep the default triage labels? Recommended: yes." It writes no file.
- [ ] Turn 3: the agent shows the drafts of `docs/agents/tracker.md` and `docs/agents/triage-labels.md`.
- [ ] Turn 4: the agent writes both files and changes no other file.
- [ ] `docs/agents/tracker.md` has `Tracker: other`, the commands of the user word for word, and the sections "Publish a spec", "Publish tickets" and "Fetch a spec or ticket". It invents no command.
- [ ] The agent runs no `jira` command and creates no label. Other has no label tool.

## What a failure looks like

- The agent says that Jira is not supported, or offers only local files.
- The agent writes a file before the confirm.
- The agent invents a command that the user did not give.
- The agent runs `jira`.

## How to run

```
node scripts/eval-run.mjs --eval setup/04-other-tracker-jira.md --runs 1 --claude <path to the real claude binary>
```

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "/setup We track work in Jira, project WID. Read an issue with `jira issue view WID-<n>`. Create one with `jira issue create -p WID -s \"<title>\" -b \"<body>\"`. Comment with `jira issue comment add WID-<n> \"<text>\"`. Add a label with `jira issue edit WID-<n> -l <label>`. Link a blocker with `jira issue link WID-<n> WID-<m> Blocks`. Close with `jira issue move WID-<n> Done`.",
  "turns": [
    "Yes, Jira.",
    "Yes, keep the default labels.",
    "Yes, write both files."
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": [
      "setup"
    ],
    "outputMatches": [
      {
        "pattern": "Recommended: yes",
        "turn": 1
      },
      {
        "pattern": "/Jira/",
        "turn": 1
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "turn": 1
      },
      {
        "name": "Edit",
        "turn": 1
      },
      {
        "name": "Write",
        "turn": 2
      },
      {
        "name": "Bash",
        "inputMatches": "\\bjira\\b"
      }
    ],
    "fileMatches": [
      {
        "path": "docs/agents/tracker.md",
        "pattern": "/^Tracker: other\\s*$/m"
      },
      {
        "path": "docs/agents/tracker.md",
        "pattern": "jira issue view WID-"
      },
      {
        "path": "docs/agents/tracker.md",
        "pattern": "jira issue move WID-<n> Done"
      },
      {
        "path": "docs/agents/tracker.md",
        "pattern": "## Publish tickets"
      },
      {
        "path": "docs/agents/triage-labels.md",
        "pattern": "\\| `?ready-for-agent`? \\| `?ready-for-agent`? \\|"
      }
    ],
    "onlyFilesChanged": [
      "docs/agents/**"
    ]
  }
}
```

What each check catches:

- A refusal of Jira fails the turn 1 `Jira` check and the file checks.
- A write before the confirm fails the `toolNotCalled` checks for turns 1 and 2.
- A file with no `Tracker: other` line, or with commands that are not the user's, fails `fileMatches`.
- A `jira` command fails the `Bash` check.
- A write outside `docs/agents/` fails `onlyFilesChanged`.

Not machine-checked:

- Whether the agent invents a command for an action that the user did not describe. Read `docs/agents/tracker.md`.
- The order of the turns. An agent that shows both drafts in turn 2 and writes in turn 3 can still pass. Read the transcript.
