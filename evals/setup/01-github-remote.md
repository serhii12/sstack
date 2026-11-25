# Eval setup-01: repo with a GitHub remote

Kind: task sort (GitHub). The skill must look first, recommend GitHub, ask one question and wait.

## User prompt

```
/setup
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`) and one setup commit. No `docs/agents/tracker.md`, no `.scratch/`.
- The setup writes `.git/config` with a fake remote `origin` at `https://github.com/acme/widgets.git`. Nothing reaches the network.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. The agent tool also runs some read-only shell commands with no rule. Earlier runs show that `git remote -v` runs.
- The runner always denies `gh`, `curl`, `wget` and `ssh`. So `gh --version` is denied. The skill must say so in one line and not ask about it.

## Expected behavior

- [ ] The agent loads the `setup` skill.
- [ ] The agent looks before it asks: it reads the remote (`git remote -v` or `.git/config`), tries a version check for `gh` or `glab`, and looks for `docs/agents/tracker.md` and `.scratch/`.
- [ ] The reply recommends GitHub, names `github.com/acme/widgets`, and has the `Recommended: yes` line, so that "yes" accepts the recommendation.
- [ ] The reply lists the other choices: GitLab, or local files.
- [ ] The agent asks one question only. It does not ask the GitLab Premium question, and it does not ask about the denied `gh` check.
- [ ] The agent shows no draft of the tracker file yet.
- [ ] The agent waits. It writes no file, creates no folder, runs no `git remote add`, and creates no issue or label.

## What a failure looks like

- The agent writes `docs/agents/tracker.md` before the user confirms.
- The agent recommends local files or GitLab for a github.com remote.
- The agent asks several questions, or none. An earlier run on Sonnet asked the user to allow `gh` after the runner denied it.
- The agent shows the draft before the user accepts the tracker.
- The agent tries `gh issue create`, `gh label create` or any command that changes the repo.

## How to run

```
node scripts/eval-run.mjs --eval setup/01-github-remote.md --models sonnet,opus --runs 3 --claude <path to the real claude binary>
```

Read each transcript in the output folder for the items that no check covers.

## Checks

The runner refuses `Bash(git remote -v)` and `Bash(gh --version)` in `allowedTools` without `--allow-network`, because its network guard matches `git remote` and `gh`. So the eval grants no Bash rule.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": ".git/config", "content": "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n[remote \"origin\"]\n\turl = https://github.com/acme/widgets.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n" }
    ]
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
      { "name": "Bash", "inputMatches": "git remote (add|set-url|remove|rename)|\\bgh (issue|label|api|repo edit)" }
    ],
    "outputMatches": [
      "Tracker: GitHub",
      "github\\.com/acme/widgets",
      "Recommended: yes",
      "GitLab",
      "local files"
    ],
    "outputNotMatches": [
      "Premium|Ultimate",
      "/\\?[\\s\\S]*\\?/",
      "/(couldn't|could not|cannot|can't|unable to|did not|didn't) (read|see|look at) (the |a |any )?(git )?remotes?\\b/i",
      "/tell me (which|what|the)|(allow|approve) `?(gh|bash)|paste the output|please confirm|what I need from you/i",
      "gh issue create|gh label create",
      "/Written by:|^#+ Actions/m"
    ]
  }
}
```

What each check catches:

- A written tracker file or `.scratch` folder fails `fileAbsent` and `noRepoChanges`.
- A recommendation of local files or GitLab fails `Tracker: GitHub`.
- A reply without `Recommended: yes` fails `outputMatches`.
- A second question anywhere in the reply fails the check for two `?` characters.
- A request written as an order, such as "allow Bash", "paste the output" or "please confirm", fails the `tell me` check. An earlier run on Sonnet asked this way and passed the old checks.
- The GitLab plan question fails the `Premium|Ultimate` check.
- A draft of the tracker file fails the `Written by:` and `Actions` check.
- A reply that says "I couldn't read the remote" fails the `remote` check. A run on Sonnet read nothing after one denied command and still matched the other checks.

Not machine-checked:

- Whether the agent read the remote and tried the version checks before it asked. The agent can read the remote with `git remote -v` or with `Read` on `.git/config`, and the runner cannot check "one of two tool calls". The `remote` check above is a proxy.
- Whether the question is clear.
