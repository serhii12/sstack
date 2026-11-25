# How agents work in this repo

These rules apply to every coding agent in this repo. Claude Code reads this file through `CLAUDE.md`.

Sort each task with the table below. The user can also type `/start`. It sorts the task, writes a short handoff note, and names the next command. It also keeps the current list of commands.

## Task types

| Type | How to tell | Isolation | Proof needed | Skill |
| --- | --- | --- | --- | --- |
| Read-only question | Explain, review, or investigate. Nothing in the repo changes. | None. No worktree, branch, commit or PR. | Each claim cites a file and line, an issue, or a commit. | Ask in the session. `/decide` to weigh options. |
| Docs-only change | Edits only to docs, comments or text files. | Own worktree and branch. | Links resolve. Examples were run or are marked untested. No made-up runtime proof. | `/grill` if the change is unclear. |
| Code change | Changes behaviour, config or dependencies. | Own worktree and branch. | The repo's checks pass. A test or command shows the new behaviour. | `/grill` first. Spec, tickets and build are planned, not built yet. |
| Bug | Something works wrong today. | Own worktree and branch. | A command fails on the bug before the fix and passes after it. | `/grill` if the right behaviour is unclear. Debug is planned, not built yet. |
| Ship request | The user wants the change delivered: a pull request or a finished change in the repo. | The task's worktree and branch. | Checks and CI results on the head commit, as you saw them. | By hand, under the rules below. Ship is planned, not built yet. |

A plan, a review or a throwaway experiment is not a ship request. If a read-only task turns into edits, sort it again.

## Standing rules

Each rule ends with what enforces it. `Held by:` names the hook, script or test that blocks a break. `No fence yet` means nothing enforces it and the rule is only an instruction.

`.claude/hooks/guard-git.mjs` checks git commands the agent runs through Claude Code. It does not check a person typing in a terminal.

1. **One task per worktree and branch.** Start each task on a new branch from the latest default branch, in its own worktree. If this task already has a worktree, keep using it. Never mix two tasks on one branch.
   No fence yet
2. **No commits or direct pushes to `main` or `master`.** Commit on the task branch and merge through a pull request. The guard knows only these two names. If your default branch has another name, this rule is not enforced.
   Held by: .claude/hooks/guard-git.mjs
3. **No plain force push** (`git push --force` or `-f`). `git push --force-with-lease` is allowed on your own branch, never on `main` or `master`.
   Held by: .claude/hooks/guard-git.mjs
4. **Never skip checks.** No `--no-verify`, no `-n` on commit, and no other way around the repo's git hooks.
   Held by: .claude/hooks/guard-git.mjs
5. **Report the real result.** Say what you ran and what you saw. Never claim success you did not see. A check you did not run is reported as `untested`.
   No fence yet
6. **Error messages say what failed, why, and `Fix:`.** Every message from a script, hook, lint rule or check we write reads `<what failed>. <why>. Fix: <step>.` The step names a command, a file or a change, in a code span. Example: `Commit blocked on main. Work on main skips review. Fix: run git switch -c fix/login-timeout first.`
   No fence yet

## Checks in this repo

Replace this list with the commands for this repo.

- Install: `<command>`
- Test: `<command>`
- Lint and format: `<command>`
- Docs and links: `<command>`

<!-- Provenance: task-type idea from rstack AGENTS.md (no licence, idea only, our own words). Error grammar adapted from ratstack AGENTS.md (MIT, Copyright (c) 2026 Joel Hooks). Held by / No fence yet labels from ratstack. See NOTICE. -->
