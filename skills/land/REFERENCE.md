# land reference

Contents: Exit codes of land-check.mjs. Exit codes of land-wait.mjs. Exit codes of land-evidence.mjs. States of a land run. The risk config. The starter config. The fences. The checks. Approval of a high risk. The evidence branch. Without gh. GitHub rules that a person must switch on. What the scripts cannot see.

If a script exits with a code that `SKILL.md` does not name, read this file. If you set up a repo, or if `gh` does not work, read it too.

## Exit codes of land-check.mjs

Every failure prints as `FAIL <code>: <what failed>. Fix: <what to do>.` When several gates fail, all print. The exit code is the first in this table. On a failure, the last line is `STATE <state>: exit <code>.`

| Exit | Gate | State | What to do |
| --- | --- | --- | --- |
| 0 | Every gate passed. With `--merge`: GitHub shows the merge. | pass, merged | Report. |
| 10 | The pull request is closed or already merged. | stopped | Stop. Report what GitHub shows. |
| 11 | The pull request is a draft. | stopped | Stop. Ask the user. |
| 13 | The base differs from the default branch, the head is in a fork, the head is another branch, or the head is an `evidence/` branch. | stopped | Stop. Ask a person. |
| 22 | Auto-merge is on. | stopped | Run `gh pr merge <n> --disable-auto`. Tell a person. Stop. |
| 12 | Conflicts, behind the base, or mergeability not known yet. | fix | The script reads again for 15 seconds first. Then merge the default branch into the task branch, as step 8 of `SKILL.md` says. Never rebase. |
| 14 | The config on the default branch has an error. Or no check passed on the head and the config does not allow that. | stopped | Stop. A person fixes the config, adds a CI check, or sets `allowNoChecks`. |
| 17 | A check failed. | fix | Go to step 7 of `SKILL.md`. |
| 15 | A required check has no run on the head with the exact name and app. | wait | Wait. If it never runs, stop. |
| 16 | A check is still running. | wait | Wait with `land-wait.mjs`. |
| 18 | The latest review of a reviewer requests changes. | needs-person | Stop. A person decides. |
| 19 | A review thread is unresolved. | needs-person | Stop. A person resolves it. |
| 20 | The review file is missing or stale, or its ranges have a gap or do not cover the branch. An open finding that is not of severity low gives 20 too. | fix | Load `peer-review` once for the new commits. |
| 28 | An acceptance check has the status `fail` in the evidence index. `untested` does not block. | fix | Fix the change and run `prove` again. |
| 23 | Evidence images or video under `.artifacts/` are in the pull request. Text files there are allowed. | fix | Remove the media from the task branch. Run `land-evidence.mjs <task>`. |
| 21 | The risk is high and no person approved the head. | needs-person | Hand off. Stop. |
| 24 | The repo does not allow the merge method of the config. | stopped | Stop. A person fixes the config. |
| 27 | `--owner-approved` was in use and the note on the pull request did not post. Nothing merged. | stopped | Stop. Report the message. |
| 25 | GitHub refused the merge. A push after the check also gives 25. | stopped | Stop. Report the message. |
| 26 | The merge is not visible after the call, for example in a merge queue. | stopped | Report the pull request as open. |
| 29 | `close-ticket`: the pull request is not merged, or the ticket file has no `Status:` line. | stopped | Leave the ticket as it is. Report it. |
| 30 to 34 | Preflight: on a default or evidence branch, detached HEAD, no commits, changes not committed, no base ref. | stopped | Stop. Print the message. |
| 2, 3 | Usage error, or `gh` or data error. | stopped | Read the message. |

Preflight ignores files under `.artifacts/<task>/evidence/` that git does not track. Evidence stays local.

## Exit codes of land-wait.mjs

| Exit | Name | Meaning | Kept until `--ack` |
| --- | --- | --- | --- |
| 0 | checks-passed | The checks passed on the head, on two polls in a row. | No |
| 10 | check-failed | A check ended with a conclusion that does not pass. | Yes |
| 11 | check-missing | A required check has no run on the head after the grace time (default 120 seconds). | Yes |
| 12 | review | A new review, review comment or comment from somebody other than the gh user. | Yes |
| 13 | merged | The pull request is merged. | No |
| 14 | closed | The pull request is closed and not merged. | No |
| 15 | deadline | The total limit passed for this head (default 3600 seconds) and its checks did not end. | No |
| 16 | still-waiting | Nothing happened in this run (default 100 seconds). Run it again. | No |
| 18 | no-checks | No check passed on the head after the grace time, or the config has an error. | Yes |
| 19 | fix-cap | A check failed on a third head. The fix rounds are used. | Yes |
| 2, 3 | | Usage error, or `gh` error after the retries. | |

The state file is `<git common dir>/land/wait-<owner>-<name>-<n>.json`. The script checks each field when it reads the file. It reads "merged", "closed" and "checks passed" from GitHub on each run, never from the file.

The cap of 2 fix rounds is a safety limit. A person can change it for one run with `--max-fix-rounds <n>`.

## Exit codes of land-evidence.mjs

| Exit | Meaning |
| --- | --- |
| 0 | The files are on `evidence/<task>`, or the index names no file. |
| 40 | The evidence index is not readable or has the wrong shape. |
| 41 | A path is refused: outside the folder, a symlink, not plain, a `.git` part, missing, empty or not a regular file. An image with the wrong bytes is refused too. |
| 42 | A file changed after it was indexed. |
| 43 | A file is larger than 10 MB, or the total is larger than 50 MB. |
| 44 | The remote does not exist. |
| 45 | A git command failed. |
| 46 | The push failed or was rejected. The script never forces a push. |
| 2 | Usage error, or not a git repo. |

## States of a land run

One run of `/land` is in one of these states. The exit codes move it.

| State | Entered when | Leaves to |
| --- | --- | --- |
| branch-checked | Preflight exits 0. | pushed |
| pushed | The branch and the evidence are on `origin`. | open |
| open | The pull request exists. | waiting |
| waiting | `land-wait.mjs` runs. | checks-green (0), fixing (10), waiting (12 with `--ack all`, 16), merged (13), stopped (11, 14, 15, 18, 19) |
| fixing | A check failed (at most 2 rounds), or the default branch must come into the task branch. | waiting |
| checks-green | `land-wait.mjs` exits 0. | merged (gate 0), reviewing (gate 20), needs-person (gate 21, 18, 19), waiting (gate 15, 16), fixing (gate 12, 17, 23, 28), stopped (each other code) |
| reviewing | `peer-review` runs once for the new commits. | waiting |
| needs-person | A person must act. `/land` ends. | checks-green (the user types `/land` again) |
| merged | The gate printed `MERGED`, or exit 10 says "already merged". The ticket closes here. | reported |
| stopped | A stop that the agent cannot fix. | reported |
| reported | The report is printed. | (end) |

The scripts hold these tables: `GATE_STATES`, `REVIEW_STATES` and `MERGE_PHASES` in `land-check.mjs`, `OUTCOMES` and `EVENT_STATES` in `land-wait.mjs`, `CHECK_STATES` in `land-lib.mjs`. With `--json`, `land-check.mjs` prints the `state`.

## The risk config

A person writes `.stack/risk.json` on the default branch. The scripts read it from the default branch only. A change to it in a pull request has no effect on that pull request, and the change itself is high risk.

- A path gets the first level that matches, in the order `high`, `medium`, `low`. A path that matches no glob is medium.
- `high` and `medium` globs ignore case. `low` globs need the exact case.
- Only a high risk needs a person. Low and medium merge when the other gates pass.
- If the file does not exist, the starter config below applies. The scripts say so in one line.
- Each level that the file names replaces the default list of that level. A level that the file does not name keeps its default list. Write `"high": []` to clear the default high list.
- `requiredChecks` holds the check name and the app slug of each required check. Add `appId` to pin the app by its number. The GitHub Actions app has the slug `github-actions`.
- `notHuman` lists accounts of people that automation uses. Their approvals do not count.
- An error in the file stops the gate with exit 14: bad JSON, a wrong type or a key that the scripts do not know. A person fixes the file.

## The starter config

This is the default config. Copy it to `.stack/risk.json` and change it for the project.

```json
{
  "levels": {
    "high": [
      "**/AGENTS.md", "**/CLAUDE.md", "**/GEMINI.md", "**/.mcp.json", "**/.cursorrules",
      "**/.codex/**", "**/.gemini/**", "**/.cursor/**", "docs/agents/**", ".github/**",
      "**/.gitmodules", "**/.envrc", "lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml", ".pre-commit-config.yaml",
      "**/package.json", "**/package-lock.json", "**/npm-shrinkwrap.json", "**/yarn.lock", "**/pnpm-lock.yaml", "**/pnpm-workspace.yaml", "**/bun.lock", "**/bun.lockb", "**/bunfig.toml", "**/.npmrc", "**/.yarnrc", "**/.yarnrc.yml", "**/.pnpmfile.cjs", "**/deno.json", "**/deno.jsonc", "**/deno.lock",
      "**/Pipfile", "**/Pipfile.lock", "**/pyproject.toml", "**/poetry.lock", "**/uv.lock", "**/pdm.lock", "**/setup.py", "**/setup.cfg", "**/requirements*.txt", "**/requirements*.in",
      "**/Gemfile", "**/Gemfile.lock", "**/*.gemspec", "**/go.mod", "**/go.sum", "**/go.work", "**/go.work.sum", "**/Cargo.toml", "**/Cargo.lock", "**/composer.json", "**/composer.lock",
      "**/pom.xml", "**/build.gradle", "**/build.gradle.kts", "**/settings.gradle", "**/settings.gradle.kts", "**/gradle.lockfile", "**/gradle-wrapper.properties", "**/mix.exs", "**/mix.lock",
      "**/Podfile", "**/Podfile.lock", "**/Package.swift", "**/Package.resolved", "**/packages.lock.json", "**/Directory.Packages.props", "**/*.csproj", "**/*.fsproj", "**/*.vbproj", "**/*.nuspec",
      "**/pubspec.yaml", "**/pubspec.lock", "**/flake.nix", "**/flake.lock", "**/vcpkg.json", "**/conanfile.txt", "**/conanfile.py"
    ],
    "medium": [],
    "low": ["docs/**", "**/*.md"]
  },
  "requiredChecks": [],
  "allowNoChecks": false,
  "mergeMethod": "squash",
  "ignoreOutdatedThreads": false,
  "notHuman": []
}
```

## The fences

The config cannot lower these paths. They hold the checks themselves. Case does not matter.

- CI workflow files: `.github/workflows/`, `.github/actions/`, `.circleci/`, `.buildkite/`, `.woodpecker/`, and `.gitlab-ci.yml`, `Jenkinsfile` and similar files at the root.
- Git hook folders: `.githooks/` and `.husky/`, in any folder.
- The agent tool folder that holds the guard: `.claude/`, in any folder.
- `.stack/`, with the risk config `.stack/risk.json`.
- `CODEOWNERS`, in any folder.
- A path with `..`, `.`, an empty part, a backslash or a control character. A fence name with a hidden character, a dot or a space at its end also counts as the fence.
- A rename counts the old and the new path. A pull request with no changed file, or with more files than GitHub lists, is high.

## The checks

- If `requiredChecks` names checks, each one must pass on the head by exact name and app. If two runs have the same name, both must pass. Only `success` passes.
- If `requiredChecks` is empty, every check run and every commit status on the head must pass, and one must succeed. A skipped or neutral run does not fail.
- If no check exists on the head, the scripts stop (exit 14 and 18). A person picks one of two ways. The first way is to add a CI check that runs on pull requests. The second way is to set `"requiredChecks": []` and `"allowNoChecks": true` in `.stack/risk.json` on the default branch.

## Approval of a high risk

Either of these counts:

1. A review `APPROVED` on the head commit. It must be the latest review of an account of type `User`. That account must have write access. The author, the gh user and each commit author of the pull request do not count. A bot and a `notHuman` account do not count.
2. The word of the user in the session. After a stop with exit 21, the user types a clear instruction to merge that pull request. Then the agent passes `--owner-approved`. The script skips only the approval gate. Before the merge it posts this note: "Merged on the word of the repo owner in the session. Risk: high, rule <rule>." If the note does not post, nothing merges (exit 27).

GitHub does not let an author approve the own pull request. So a person who works alone uses way 2.

## The evidence branch

`land-evidence.mjs <task>` puts each file that the evidence index names on the branch `evidence/<task>` of the same repo: images, video and text output. A file that the index does not name stays local, and so does each reply of the image reviewer. Each run with a change adds one commit on top. The script never forces a push. The links in the body point to the commit, so they stay valid.

- The script prints the evidence table for the body. Each file name in it is a link. Below the table it prints one caption and one line for each image and video.
- The link form is `https://github.com/<owner>/<repo>/blob/<commit>/<path>?raw=true`. GitHub keeps this address in the page, and a browser of a signed-in person with access loads the image. A test in a private repo showed the images inline.

- The gate never merges an `evidence/` branch, and never deletes one (exit 13).
- A person deletes old evidence branches. Nothing else removes them.
- Everyone who can read the repo can read the evidence. In a private repo, GitHub shows the images only to a signed-in person with access. An address on `raw.githubusercontent.com` does not work there.

## Without gh

If `gh` is missing, or the host is not GitHub, stop after the push. Print these steps for a person:

1. Open a pull request from `<branch>` to the default branch in the web page of the host.
2. Paste the body that [BODY.md](BODY.md) describes. The `land-risk.mjs` output gives the risk line.
3. Wait for the checks. If the checks pass on the head and the review is fresh, merge.
4. If the host shows conflicts, or says that the branch is behind, run `git fetch origin` and `git merge origin/<default branch>` on the task branch. Resolve each conflict. Run the tests. Commit, and push with a plain `git push`. Do not rebase. Then run one new review that covers the merge.
5. For a high risk, a person other than the author approves first.
6. After the merge, set `Status: closed` in a local ticket file, or close the issue.

This version does not support GitLab. Other hosts are not supported either.

## GitHub rules that a person must switch on

The scripts check what they can read. GitHub is the real fence. A person with admin rights sets these rules on the default branch, with a ruleset:

1. Require a pull request before a merge. Block force pushes and deletion.
2. Require status checks, and pin each check to its app as the expected source. Use the same name and app as `requiredChecks`.
3. Require that the branch is up to date before a merge.
4. Require conversation resolution.
5. Dismiss stale approvals when new commits come. Require approval of the most recent push.
6. Put the high-risk paths in `CODEOWNERS` with people only, and require review from code owners. If one person works alone, skip this rule. It blocks way 2 above.
7. Add no bypass actor. No app, team or person can skip the rules.
8. Give the agent a token that can push branches and open pull requests. It must not change rulesets or approve.

A private repo on the GitHub Free plan has no branch protection, no rulesets and no auto-merge. There, only these scripts and the git guard hold the rules. A push to the default branch from outside the agent, and a merge in the web page, have no fence.

## What the scripts cannot see

- If the review file tells the truth. The script checks only its commits, its shape and its finding lines. The file can hold one `Range:` line for each review. The ranges must make one chain from the start of the branch to the head. A later block with the same finding id decides the status of that finding.
- If a person approved for a good reason. Approval is a decision of a person.
- If the user typed the approval. The script sees only the flag `--owner-approved`.
- If a check tests the right thing. A required check that always passes still passes.
- If the branch has the newest CI files. A branch that started before a CI change runs the old CI on a push. The ruleset rule 3 holds this.
- What a symlink or a submodule pointer brings in. Each one gets the level of its own path.
- A merge or a push that the agent does with `gh` or `git` directly, outside the scripts. The GitHub rules above stop that.
