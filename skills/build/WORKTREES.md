# Several agents in one repo

`build` follows these rules because other agents can work in the same repo at the same time. Each rule says what holds it.

## Rules

- **Never commit directly to `main` or `master`.** Held by: hooks/guard-git.mjs
- **One worktree and one branch per task and per agent.** Never reuse or change another agent's worktree, branch or uncommitted work. No fence yet
- Stop when the ticket is already in work, unless the user says "rebuild". Then print the branches to delete and use a new task name. `ticket-in-work.mjs` finds another worktree, a local branch or a remote branch for the ticket. It cannot find a branch that another machine did not push. Held by: skills/build/scripts/ticket-in-work.mjs, tests/scripts/ticket-in-work.test.mjs
- **Run a scope check before you start.** Skim the changed files of the open pull requests (`gh pr list`, `gh pr diff <n> --name-only`). Look for uncommitted work in shared checkouts. Read the overlapping diffs. Independent edits to the same file can go ahead in your own worktree. Ask only if the changes conflict in behavior, need unfinished work, or have no clear owner. Do not change the checkout of another task. No fence yet
- **No plain force push.** Never use `--force` or `-f`. Use `--force-with-lease` only on your own task branch. Never use it on `main`. Held by: hooks/guard-git.mjs
- **Resolve lockfile conflicts by regenerating, never by hand-merging.** Each worktree has its own copy of the tracked lockfile. Run the install command of the package manager and commit what it writes. No fence yet
- **Worktrees do not isolate shared resources.** Before you trust what a dev-server port serves, make sure that your process answers on it (`lsof -i :<port>`). Do not run schema experiments against a shared database. No fence yet
- **Stop instead of guessing.** If you cannot resolve a conflict with confidence, stop. Report the conflict. No fence yet

## Why one checkout per session

Several sessions in one checkout share one working directory, one index and one HEAD. One field report describes three faults in a single afternoon. A `git commit --amend` in one session landed on the commit of another session. A stash vanished from `refs/stash`. Commits landed on the wrong branch.

Worktrees fix the shared index and HEAD. They do not fix the stash, because `refs/stash` is shared across all worktrees of a repo. So `build` does not use `git stash` at all.

## Cleanup

Keep the worktree until the pull request is merged or closed. Then, from the main checkout, run:

```bash
git worktree remove <worktrees-dir>/<task-name>
git branch -D <branch-prefix>/<task-name>
```

Use `-D`. After a squash merge or a rebase merge, `-d` refuses even though the work is merged.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `git worktree add` says the branch or folder exists | Another session can own that name | Pick a new suffix. Run `ticket-in-work.mjs` again and show its message. Never force or reuse. |
| `ticket-in-work.mjs` exits with 1 | Another worktree or branch builds the ticket, or a failed run left a branch | Stop and make no worktree. The user can type `/build <ticket> rebuild`. Then print the branches to delete and use a new task name. |
| The commit hook says that the commit is on `main` | The shell left the worktree folder | Run the git command as `git -C <worktree> ...`. Make sure that `git -C <worktree> branch --show-current` prints the task branch. |
| The ticket file is not in the worktree | A local ticket is not in `origin/main` | Read the file at the path that step 1 noted. |
| `ticket-ready.mjs` exits with 3, or a blocker file named on `Blocked by:` does not exist | The name is wrong or the file moved | Stop. Tell the user to run `node .claude/skills/tickets/scripts/tickets-lint.mjs`. |

## Provenance

- `AGENTS.md` lines 54-72 from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. The rules list is copied and adapted. Wording is plainer. Em dashes and semicolons are gone. `master` is added. The lockfile and port lines have a reason. Each rule has a Held by or No fence yet line.
- `new-feature/SKILL.md` from rstack, same author, no license file. The cleanup commands and the `-D` reason are copied nearly word for word. The lockfile sentence is adapted.
- `docs/engineering/implement.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. The field report and the shared `refs/stash` point are close to his wording.
- New here: the troubleshooting table, the in-work rule and its "rebuild" path.
