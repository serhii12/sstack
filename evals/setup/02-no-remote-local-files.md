# Eval setup-02: repo with no remote

Kind: task sort (local files). With no remote the skill must recommend local files and skip the tracker check.

## User prompt

```
/setup
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`) and one setup commit. No `docs/agents/tracker.md`, no `.scratch/`.
- No remote is set.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. The agent tool also runs some read-only shell commands with no rule, such as `git remote -v`.
- The runner always denies `gh`, `curl`, `wget` and `ssh`.

## Expected behavior

- [ ] The agent loads the `setup` skill and reads the remote. There is none.
- [ ] The reply recommends local files under `.scratch/`, says that no remote was found, and asks one question where "yes" accepts.
- [ ] The reply offers GitHub or GitLab as the other choices.
- [ ] The agent does not ask the user to log in and does not run `gh repo view` or `glab repo view`. The tracker check is skipped for local files.
- [ ] The agent shows no draft of the tracker file yet.
- [ ] The agent writes no file before the user confirms.

## What a failure looks like

- The agent recommends GitHub with no remote.
- The agent stops with an error such as "no remote" instead of offering local files.
- The agent writes `docs/agents/tracker.md` or `.scratch/` files before the user confirms.
- The agent runs `git remote add` without a URL from the user.

## How to run

```
node scripts/eval-run.mjs --eval setup/02-no-remote-local-files.md --models sonnet,opus --runs 3 --claude <path to the real claude binary>
```

Read each transcript in the output folder for the items that no check covers.

## Checks

The runner refuses `Bash(git remote -v)` in `allowedTools` without `--allow-network`. So the eval grants no Bash rule.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "/setup",
  "allowedTools": ["Skill", "Read", "Glob", "Grep"],
  "assert": {
    "skillLoaded": ["setup"],
    "noRepoChanges": true,
    "fileAbsent": ["docs/agents/tracker.md", ".scratch"],
    "toolNotCalled": [
      "Write",
      "Edit",
      { "name": "Bash", "inputMatches": "git remote (add|set-url)|\\b(gh|glab) (repo view|auth)" }
    ],
    "outputMatches": [
      "/\\bno (?:git |`?origin`? )?remote/i",
      "/Tracker: local/i",
      "local files",
      "\\.scratch/",
      "Recommended: yes",
      "GitHub|GitLab"
    ],
    "outputNotMatches": [
      "Tracker: GitHub",
      "auth login",
      "/\\?[\\s\\S]*\\?/",
      "/(couldn't|could not|cannot|can't|unable to|did not|didn't) (read|see|look at) (the |a |any )?(git )?remotes?\\b/i",
      "/tell me (which|what|the)|(allow|approve) `?(gh|bash)|paste the output|please confirm|what I need from you/i",
      "/Written by:|^#+ Actions/m"
    ]
  }
}
```

What each check catches:

- A recommendation of GitHub fails `Tracker: GitHub` in `outputNotMatches` and `Tracker: local` in `outputMatches`.
- A written tracker file or `.scratch` folder fails `fileAbsent` and `noRepoChanges`.
- A request to log in fails the `auth login` check. A `gh repo view` or `glab auth` call fails the `Bash` check.
- A second question fails the check for two `?` characters.
- A request written as an order, such as "allow Bash", "paste the output" or "please confirm", fails the `tell me` check. An earlier run on Sonnet asked this way and passed the old checks.
- A draft of the tracker file fails the `Written by:` and `Actions` check.
- A reply that says "I couldn't read the remote" fails the `remote` check. A run on Sonnet read nothing after one denied command and still matched the other checks.

Not machine-checked:

- Whether the reply explains the no-remote case clearly.
- Whether the agent read the remote before it asked. The runner cannot check "one of two tool calls". The `remote` check above is a proxy.
