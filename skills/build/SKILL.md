---
name: build
description: Build one ticket in its own worktree and branch, test first, then review, fix and report.
argument-hint: "[ticket reference] [pr]"
disable-model-invocation: true
---

# Build

`build` is a typed workflow. It runs only when the user types `/build`. It builds one ticket that the team already decided. It does not reopen the plan.

## Important

- If the ticket is unclear or clashes with the code, stop. Tell the user. If the ticket needs a design choice that `build` does not make, do the same. The user can type `/grill` to settle it. No fence yet
- `build` can run in the background, so it must not wait for an answer in the middle of a step. If a step says "ask" and nobody can answer, take the safe branch that the step names. Put the question in the report. No fence yet
- Never commit on `main` or `master`. Held by: hooks/guard-git.mjs (Claude Code only)
  In other agent tools, nothing blocks the commit itself. Branch protection on the git host blocks the push to `main`. No fence yet
- Never skip the git hooks. Never use `--no-verify` or `-n`. If a hook fails, read its output. Fix the cause. Commit again. Held by: hooks/guard-git.mjs
- If the user asks you to skip a step, say in one line what is lost. Then skip it. Such a step can be the failing test first, the review or `prove`. Name each skipped step in the report. A request never lifts the two rules above. If a step cannot run, report it as `not run`. No fence yet
- Never report a pass that you did not see. At every step, `untested` is a valid result. No fence yet

## 1. Read the ticket

1. Read the text after `/build`. If there is no text and this conversation holds no plan, ask one question: "Which ticket?" If nobody can answer, stop. Report that no ticket was named. One run builds one ticket.
2. Read the `AGENTS.md` of the project. Its rules apply to every step below.
3. If the user passes a ticket reference, fetch it from the issue tracker. State its title before you start. If the reference is ambiguous, ask. If nobody can answer, stop and list the matches. `docs/agents/tracker.md` says where the tracker is. If that file does not exist, tell the user to type `/setup` or to paste the ticket text. If the plan lives only in this conversation, build from that.
4. Read the whole ticket and its spec now. Keep the text. For a local ticket, note its absolute path. A local ticket under `.scratch/` is not in `origin/main`, so it is not in the new worktree.
5. Check the blockers. Read the `Blocked by:` line of the ticket. If it says `none`, go on. If not, follow [BLOCKERS.md](BLOCKERS.md). Every blocker must be closed before you go on, unless the user says to build anyway.
   Held by: skills/build/scripts/ticket-ready.mjs (local tickets only)
6. Restate in two or three lines what you will build. Name the Acceptance checks that the work will meet. If the ticket will not fit in one context window, stop. Tell the user to split it with `/tickets`.

## 2. Make the worktree and branch

Inspect existing isolation first. Run `git worktree list` and `git status --short`. Read the current branch and the task assignment of the session. If the environment already made a worktree for this ticket, keep its path and branch. Then skip items 4 and 5 of the list below. Do not infer isolation from the editor name or a branch prefix alone.

Never build in a checkout that another task uses. Two sessions in one checkout share one working directory, one index and one HEAD. One `git commit --amend` can land on the commit of the other session. Commits can land on the wrong branch. Uncommitted changes that you did not make are a sign of another task. A branch named for other work is another sign. So is a worktree that another session made. Do not switch, stash, reset or clean that checkout. If you cannot leave it for your own worktree, stop. Tell the user. No fence yet (planned: a worktree check script)
Do not use `git stash`. Every worktree of a repo shares one stash, so another session can pop yours. No fence yet

1. Sync: `git fetch origin`.
2. In-work check: from the project root, run `node .claude/skills/build/scripts/ticket-in-work.mjs <ticket path or task key>`. Item 4 says what the task key is. If it exits 1 and the user did not say "rebuild", stop now. Make no worktree. Start your reply with `Cannot build <ticket>. This ticket is already in work.` Print the message of the script. Tell the user to type `/build <ticket> rebuild` to build it again. If the user said "rebuild", say in one line that another session can still own that work. Print the branches and worktrees that the user can delete. Then go on with a new task name. Never reuse, change or delete the worktree or branch of another session. If it exits 2 or 3, say in the report that the check did not run. Held by: skills/build/scripts/ticket-in-work.mjs, tests/scripts/ticket-in-work.test.mjs
3. Scope check: run `gh pr list`. Skim the changed files of the open pull requests with `gh pr diff <n> --name-only`. For shared files, read the overlapping diffs. Independent edits can go ahead in your own worktree. Ask for direction in three cases. The changes conflict in behavior. The changes need the unfinished work of another task. The changes have no clear owner. If nobody can answer, stop and report. If `gh` does not run or the host is not GitHub, use the pull request tools of that host. If there are none, report that the scope check did not run. Make the worktree anyway.
4. Name the task: the task key, plus a short unique suffix with a digit, for example `user-auth-0816a`. The key of a local ticket is its file name with no number and no extension, for example `user-auth`. The key of a tracker ticket is `issue-<number>`. If `git worktree add` fails because the name exists, pick a new suffix. Another session can own that name. Never force or reuse.
5. Create the worktree from the repo root. `--no-track` stops the new branch from using `origin/main` as its upstream:

   ```bash
   git worktree add --no-track -b <branch-prefix>/<task-name> <worktrees-dir>/<task-name> origin/main
   ```

   If the repo has conventions for worktrees, follow them. If not, use `agent/` as the branch prefix and `../<repo-folder>-worktrees` as the worktrees folder. A folder outside the checkout, or a gitignored folder inside it, keeps worktrees out of a commit.

   Then push the new branch at once: `git -C <worktree> push -u origin <branch>`. The in-work check on another machine sees only pushed branches. If the repo has no `origin` remote, or the push fails, say so in the report and go on. No fence yet
6. Enter the worktree and check it. `git -C <worktree> branch --show-current` must print your new branch. If it prints `main`, stop. The shell can forget its folder between commands. So run each later git command as `git -C <worktree> ...`. Start each other command with `cd <worktree> &&`. Make sure that the runtime version fits the repo. If the checks need dependencies, install them inside the worktree.

In an existing checkout that no other task uses, `git switch -c <branch> origin/main` makes the branch. Never use `git checkout <branch>` to make or change a branch.

If several agents work in one repo, or you must clean up, or a git command fails, read [WORKTREES.md](WORKTREES.md).

## 3. Write the failing test first

Load two skills before any other step of this section, in this order: the agent skill `code-craft`, then the agent skill `test-craft`. If a skill will not load, tell the user. Then go on. No fence yet

Then read `.claude/skills/code-craft/RULES.md`. If the ticket touches a file that ends in `.ts`, `.tsx`, `.mts` or `.cts`, also read `.claude/skills/code-craft/TYPESCRIPT.md`. Write one test at the test boundary of the ticket yourself. A test boundary is the public interface where a test watches behavior without reaching inside.

- `test-craft` waits for the user to confirm test boundaries. `build` must not wait. Tell `test-craft` that the boundaries are agreed. Give it the boundaries that the Acceptance checks of the ticket or the spec name. No fence yet
- If neither names a boundary, pick the public interface that the first Acceptance check of the ticket observes. Say which one in the report, under "Boundary chosen by build". If the ticket has no public interface to test at, stop. Report a design question. The user can type `/grill` to settle it. No fence yet
- Before you write the code, run the test. Watch it fail for the reason that the ticket describes. Keep the failing output for the report. No fence yet
- Work one slice at a time: one failing test, then its code, then the next test.

## 4. Write the code

- Limit the changes to the ticket. Run typechecking regularly. Run single test files regularly. Run the full test suite once at the end.
- If you see a shallow module or a missing module boundary outside the ticket, do not change it. Write it in the report under `Design notes:`. No fence yet
- Worktrees do not isolate dev-server ports or shared databases. Before you trust what a port serves, make sure that your process answers on it (`lsof -i :<port>`). Do not run schema experiments against a shared database. No fence yet
- Resolve lockfile conflicts by regenerating the lockfile with the package manager. Never merge it by hand. No fence yet
- If you cannot resolve a conflict with confidence, stop. Report the conflict. Do not guess. No fence yet

## 5. Commit

Commit on the task branch with a clear message. Add or delete every file that you made, so that `git status --short` prints nothing.

Commit before the review, every time. The review then has a saved commit to read. The fixes land in a separate commit. No fence yet
If the range is empty, `peer-review` stops. Held by: skills/peer-review/scripts/review-range.mjs (empty range only)

## 6. Review the commit

Load the agent skill `peer-review`. Give it these items. Then it does not need to ask:

- the base `origin/main`
- the task name from step 2, so the file is `.artifacts/<task-name>/review.md`
- the full text of the ticket, and of the spec if there is one
- the agreed test boundaries, or "none agreed"

If it will not load, tell the user. Report the review as `not run`. Do not review the code yourself in its place. An agent that reviews code that it just wrote favors its own solution. No fence yet

## 7. Fix the findings and commit again

Act on every finding. Fix the finding. Set its status in the findings file to `fixed`, as `peer-review` says. If you think a finding is wrong or outside the ticket, ask the user. Mark it `won't fix` only after the user agrees. If nobody can answer, leave it `open`. List it in the report. Run the touched tests. Then run the full suite once. Make a new commit. If the repo does not ignore `.artifacts/`, include `.artifacts/<task-name>/review.md` in the commit. Do not amend the reviewed commit. Then the review still matches a commit that exists. If the user asks, run the review a second time. If not, run it once. No fence yet

If a problem outside the ticket will hit the next agent too, load the agent skill `friction`.

## 8. Prove the checks

Load the agent skill `prove`, also when a finding is still `open`. An open `high` or `medium` finding keeps the ticket open in step 9, but the proof is done in this run. Give `prove` the task name from step 2, the full text of the ticket, and the head commit. Put its result for each Acceptance check in the report: `pass`, `fail` or `untested`. If it will not load, tell the user. Mark every check `untested`. `prove` keeps its evidence under `.artifacts/<task-name>/evidence/`. Never commit that folder to the task branch. The installed `.gitignore` keeps its media out of `git status`. `/land` pushes the media to `evidence/<task-name>`. No fence yet

## 9. Close a local ticket and report

Before you close the ticket, check what changed after the review. Read the commit at the end of the `Range:` line of `.artifacts/<task-name>/review.md`. Run `node .claude/skills/peer-review/scripts/review-range.mjs --stat --base <that commit> <worktree>`. Exit 3 means that only `.artifacts/` changed. Exit 0 lists the changed files. Put them on the `Changed after the review:` line. If product files changed, load `peer-review` once more with that base, as a follow-up. Fix its findings as in step 7. Do this once. Held by: skills/peer-review/scripts/review-range.mjs (exit 3 when only `.artifacts/` changed)

A local ticket has no pull request, so nothing else closes it. An open ticket blocks every ticket that names it. So close it here when the work is done:

- `peer-review` writes `Severity: high | medium | low` on each finding. A finding is open when its `Status:` is `open`. Before you close the ticket, make sure of three things. Every Acceptance check is `pass`. The review ran. No `open` finding has severity `high` or `medium`. An `open` finding of severity `low` does not block the close. List every `open` finding in the report.
- To close the ticket, append one line under `## Comments` in the file at the path from step 1. If the heading is missing, create it. The line reads: `Built on branch <branch>, last commit <short sha>. Merge the branch before you build a ticket that this one blocks.` Then set `Status: closed`.
- If any of these is true, leave `Status: open`. A check is `fail` or `untested`. The review is `not run`. A `high` or `medium` finding is `open`. Say in the report what blocks the close. Give the user the exact edit. When that blocker is gone, set `Status: closed` in `<path>`.
- A tracker ticket stays open. The pull request closes it.
No fence yet


Write the report in the exact form of [REPORT.md](REPORT.md). Read that file now.

## 10. Pull request and next command

If the text after `/build` asks for a pull request, push the branch. Then open the pull request. On GitHub, run:

```bash
git -C <worktree> push -u origin <branch>
cd <worktree> && gh pr create --head <branch> --title "<ticket title>" --body "Closes #<ticket number>"
```

On another host, use its own pull request tool. For a local ticket, name the ticket file in the body in place of `Closes`. Add the pull request link to the report. Never push to `main`. Held by: hooks/guard-git.mjs

If the user did not ask for a pull request, print these commands for the user to run. Then tell the user to type `/build <next ticket>` in a fresh session. If this session was harder than it needed to be, tell the user to type `/retro` in place of it. A new session starts from `origin/main`. If the next ticket needs this work, tell the user to merge this branch first.

`build` never runs another typed workflow. It tells the user the next command to type. No fence yet

## Provenance

- `skills/engineering/implement/SKILL.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Kept nearly word for word: fetch the ticket and state its title, ask when the reference is ambiguous, and the typecheck, single-file and full-suite rhythm. Changed: `tdd` became `test-craft` with a fallback and with agreed boundaries passed in. `code-review` became `peer-review`. The review now runs after the commit, and findings get action. The work goes on a new branch in a worktree, not on the current branch. Added a pull request step. Ideas in our words from `docs/engineering/implement.md` and `skills/engineering/implement-spec/SKILL.md`, same repo, license and holder: the corruption report from several sessions in one checkout, the shared stash, review before commit seeing nothing, self-review bias, one ticket per run, never reopen the plan, split a ticket that is too big, test boundaries that nobody agreed, the ticket staying open after the run, fix all review findings before the report, and the clash between `tdd` boundary confirmation and background runs.
- `new-feature/SKILL.md` and `AGENTS.md` lines 54-72 from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. Copied and adapted: the existing-isolation check, the sync, scope check, naming, create and check steps, the worktree location rule, the port rule, the lockfile rule, one worktree and branch for each agent, and stop instead of guessing. Changed: plain-English edits, no semicolons or dashes, `--no-track` and `git -C`, a default worktrees folder. Cleanup moved to WORKTREES.md.
- New here: the refusal to build in a checkout that another task uses, the user's choice to skip a step after one line of warning, "rebuild" over an in-work branch, "build anyway" over an open blocker, the no-stash rule, the new commit after review, the background rule, the report format, the blocker check before the worktree, the blocker script (its `Blocked by:` line parser follows `skills/tickets/scripts/tickets-lint.mjs` in this repo), the in-work check script and the push right after the worktree, the prove step, closing a local ticket only when no high or medium finding is open, and the Held by and No fence yet lines.
