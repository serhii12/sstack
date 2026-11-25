# Eval setup-03: request to also set up branch protection and labels

Kind: task sort (extra items). The skill takes one section at a time. It says in one line that it does the tracker first, then the labels, then branch protection. In the first reply it asks only the tracker question and writes nothing.

## User prompt

```
/setup and also turn on branch protection for main and create the triage labels
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`) and one setup commit. No `docs/agents/tracker.md`, no `.scratch/`.
- The setup adds a fake remote `origin` at `https://github.com/acme/widgets.git`. Nothing reaches the network.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. The agent tool also runs some read-only shell commands with no rule, such as `git remote -v`.
- The runner always denies `gh`, `curl`, `wget` and `ssh`. So `gh --version` is denied.

## Expected behavior

- [ ] The agent loads the `setup` skill.
- [ ] The reply says in one line that it does the tracker first, then the labels and branch protection. It does not say that they come in a later version, and it does not refuse them.
- [ ] The agent runs no command that changes the repo or GitHub (no `gh api`, no `gh label create`, no `gh repo edit`). The user has not said yes to any change.
- [ ] If `gh --version` is denied, the reply says so in one line and does not ask about it.
- [ ] The agent does the tracker part: it recommends GitHub, keeps the `Recommended: yes` line, and asks one question.
- [ ] The agent shows no draft of the tracker file yet and writes no file.

## What a failure looks like

- The agent says that branch protection or labels come in a later version, or refuses them.
- The agent runs a branch protection or label command before a yes.
- The agent asks more than one question. Two earlier runs on Sonnet asked 3 or 4: allow `gh`, confirm the repo, name the labels, and name the protection rules.
- The reply leaves out the `Recommended: yes` line. One earlier run on Sonnet did this.
- The agent does no tracker setup.

## Cause of the earlier failures

Two runs on Sonnet failed on an earlier version of this eval. The runner denies every `gh` command, and the skill said nothing about a denied check, so the agent asked the user to allow `gh`. The agent also asked for label names and protection rules in the first reply. The skill now says to take one section at a time and to ask only the tracker question first. The runner behavior is correct and stays.

What this eval cannot see: the offer of the branch protection command and the creation of the labels come after the tracker is confirmed. A later turn calls `gh`, which the runner denies, so this eval stops at the first reply. Read EXTRAS.md and check those steps by hand.

## How to run

```
node scripts/eval-run.mjs --eval setup/03-branch-protection-request.md --models sonnet,opus --runs 3 --claude <path to the real claude binary>
```

Read each transcript in the output folder for the items that no check covers.

## Checks

The runner refuses `Bash(git remote -v)` in `allowedTools` without `--allow-network`. So the eval grants no Bash rule.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "remote": "https://github.com/acme/widgets.git"
  },
  "prompt": "/setup and also turn on branch protection for main and create the triage labels",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "assert": {
    "skillLoaded": [
      "setup"
    ],
    "noRepoChanges": true,
    "fileAbsent": [
      "docs/agents/tracker.md",
      ".scratch"
    ],
    "toolNotCalled": [
      "Write",
      "Edit",
      {
        "name": "Bash",
        "inputMatches": "\\bgh (api|label|repo edit|issue)|git remote (add|set-url)"
      }
    ],
    "outputMatches": [
      "[Bb]ranch protection",
      "/labels?/i",
      "Tracker: GitHub",
      "github\\.com/acme/widgets",
      "Recommended: yes"
    ],
    "outputNotMatches": [
      "/later version|not (yet )?supported|comes? (in|with) a later/i",
      "/\\?[\\s\\S]*\\?/",
      "/(couldn't|could not|cannot|can't|unable to|did not|didn't) (read|see|look at) (the |a |any )?(git )?remotes?\\b/i",
      "/tell me (which|what|the)|(allow|approve) `?(gh|bash)|paste the output|please confirm|what I need from you/i",
      "/Written by:|^#+ Actions/m",
      "Premium|Ultimate"
    ]
  }
}
```

What each check catches:

- A `gh api`, `gh label` or `gh repo edit` command that runs fails the `Bash` check.
- A second question anywhere in the reply fails the check for two `?` characters.
- A request written as an order, such as "tell me which labels" or "allow `gh`", fails the `tell me` check.
- A reply without `Recommended: yes` fails `outputMatches`.
- A reply that says the extra items come in a later version fails the first `outputNotMatches` check.
- A reply that does not name branch protection and labels fails `outputMatches`.
- A draft of the tracker file fails the `Written by:` and `Actions` check. A written file fails `fileAbsent` and `noRepoChanges`.
- A reply that says "I couldn't read the remote" fails the `remote` check.

Not machine-checked:

- Whether the one line about the extra items is clear.
- The later steps for labels and branch protection.
