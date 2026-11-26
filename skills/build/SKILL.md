---
name: build
description: Build one ticket on its own branch, test first, then review, fix and report.
argument-hint: "[ticket reference]"
disable-model-invocation: true
---

# Build

`build` is a typed workflow. It runs only when the user types `/build`. It builds one ticket that the team already decided. It does not reopen the plan.

## Important

- If the ticket is unclear or clashes with the code, stop. Tell the user. If the ticket needs a design choice that `build` does not make, do the same. The user can type `/grill` to settle it. No fence yet
- `build` can run in the background, so it must not wait for an answer in the middle of a step. If a step says "ask" and nobody can answer, take the safe branch that the step names. Put the question in the report. No fence yet
- Never commit on `main` or `master`. Held by: hooks/guard-git.mjs (Claude Code plus Codex after the user trusts the hook)
  In other agent tools, nothing blocks the commit itself. Branch protection on the git host blocks the push to `main`. No fence yet
- Never skip the git hooks. Never use `--no-verify` or `-n`. If a hook fails, read its output. Fix the cause. Commit again. Held by: hooks/guard-git.mjs
- If the user asks you to skip a step, say in one line what is lost. Then skip it. Such a step can be the failing test first, the review or `prove`. Name each skipped step in the report. A request never lifts the two rules above. If a step cannot run, report it as `not run`. No fence yet
- Never report a pass that you did not see. At every step, `untested` is a valid result. No fence yet

## 1. Read the ticket

1. Read the text after `/build`. If there is no text and this conversation holds no plan, ask one question: "Which ticket?" If nobody can answer, stop. Report that no ticket was named. One run builds one ticket.
2. Read the `AGENTS.md` of the project. Its rules apply to every step below.
3. If the user passes a ticket reference, fetch it from the issue tracker. State its title before you start. If the reference is ambiguous, ask. If nobody can answer, stop and list the matches. `docs/agents/tracker.md` says where the tracker is. If that file does not exist, tell the user to type `/setup` or to paste the ticket text. If the plan lives only in this conversation, build from that.
4. Read the whole ticket and its spec now. Keep the text. For a local ticket, note its absolute path. A local ticket under `.scratch/` is not in `origin/main`, so another checkout of the repo does not have it.
5. Check the blockers. Read the `Blocked by:` line of the ticket. If it says `none`, go on. If not, follow [BLOCKERS.md](BLOCKERS.md). Every blocker must be closed before you go on, unless the user says to build anyway.
   Held by: skills/build/scripts/ticket-ready.mjs (local tickets only)
6. Restate in two or three lines what you will build. Name the Acceptance checks that the work will meet. If the ticket will not fit in one context window, stop. Tell the user to split it with `/tickets`.

## 2. Check the checkout and the branch

`build` works in the checkout that it gets. The user, the agent tool or a runner owns the isolation. `build` makes no new checkout. Held by: evals/build/06-tool-made-branch.md

Never build in a checkout that another task uses. Two sessions in one checkout share one index and one HEAD, so commits can land on the wrong branch. Do not switch, stash, reset or clean that checkout. Never use `git stash`. All checkouts that share one `.git` folder share one stash. No fence yet

1. Sync: `git fetch origin`.
2. In-work check: from the project root, run `node .claude/skills/build/scripts/ticket-in-work.mjs <ticket path or task key>`. Item 4 says what the task key is. If it exits 1 and the user did not say "rebuild", stop now. Make no branch. Start your reply with `Cannot build <ticket>. This ticket is already in work.` Print the message of the script. Tell the user the two ways on. To finish the work on its branch, switch a clean checkout to that branch and type `/build <ticket>` there. To start again, type `/build <ticket> rebuild`. If the user said "rebuild", say in one line that the new branch leaves the old commits behind. Print the branches that the user can delete. Then go on with a new task name. Never reuse, change or delete the branch of another session. If it exits 2 or 3, say in the report that the check did not run. Held by: skills/build/scripts/ticket-in-work.mjs, tests/scripts/ticket-in-work.test.mjs
3. Scope check: run `gh pr list`. Skim the changed files of the open pull requests with `gh pr diff <n> --name-only`. For shared files, read the overlapping diffs. Independent edits can go ahead. Ask for direction in three cases. The changes conflict in behavior. The changes need the unfinished work of another task. The changes have no clear owner. If nobody can answer, stop and report. If `gh` does not run or the host is not GitHub, use the pull request tools of that host. If there are none, report that the scope check did not run. Then go on.
4. Name the task: the task key, plus a short unique suffix with a digit, for example `user-auth-0816a`. The key of a local ticket is its file name with no number and no extension, for example `user-auth`. The key of a tracker ticket is `issue-<number>`. If item 5 keeps a branch, the task name is the last part of that branch. `peer-review`, `prove` and `land` find the same name.
5. Read the checkout: run `git status --short`, `git branch --show-current` and `git rev-list --count origin/main..HEAD`. Do the first case that fits. No fence yet
   - `git status --short` lists a change: the checkout holds work that is not yours. Stop as blocked.
   - HEAD is on `main`, `master` or the default branch, or HEAD is detached: run `git switch --no-track -c agent/<task-name> origin/main`. If the name exists, pick a new suffix. Never force or reuse.
   - The in-work check said that this checkout is on a branch of the ticket: keep the branch. Its commits are earlier work on this ticket.
   - The count is 0: keep the branch. The agent tool or a runner made it for this session. Do not make a second branch.
   - Any other branch holds the commits of another task. Stop as blocked.
   To stop as blocked, start your reply with `Cannot build <ticket>. Blocked: <why>.` Name the checkout path, the branch and what you found. Change no file and no branch.
6. Push the task branch once: `git push -u origin <branch>`. The in-work check on another machine sees only pushed branches. If the repo has no `origin` remote, or the push fails, say so in the report and go on. No fence yet
7. `git branch --show-current` must print the task branch. If it prints `main`, stop. Never use `git checkout <branch>` to make or change a branch. Make sure that the runtime version fits the repo. If the checks need dependencies, install them in this checkout.

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
- A checkout of its own does not isolate dev-server ports or shared databases. Before you trust what a port serves, make sure that your process answers on it (`lsof -i :<port>`). Do not run schema experiments against a shared database. No fence yet
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

Act on every finding. Fix the finding. Set its status in the findings file to `fixed`, as `peer-review` says. If you think a finding is wrong or outside the ticket, ask the user. Mark it `won't fix: <reason>` only after the user agrees. Write the reason of the user. If nobody can answer, leave it `open`. List it in the report. Run the touched tests. Then run the full suite once. Make a new commit. If the repo does not ignore `.artifacts/`, include `.artifacts/<task-name>/review.md` in the commit. Do not amend the reviewed commit. Then the review still matches a commit that exists. No fence yet

Then review the fix commits once, as a follow-up. Read the last `Range:` line of `.artifacts/<task-name>/review.md`. The reviewed commit is the sha after `to`. Run `node .claude/skills/peer-review/scripts/review-range.mjs --stat --base <that sha>`. Exit 3 means that only `.artifacts/` changed, so skip the follow-up. Exit 0 lists the changed files. Put them on the `Changed after the review:` line. Load `peer-review` with that base, as a follow-up. Fix its findings as above, in a new commit. If the user asks for more reviews, run them. If not, stop here. When the user types `/land`, it reviews the last fix commits. Held by: skills/peer-review/scripts/review-range.mjs (exit 3 when only `.artifacts/` changed)

If a problem outside the ticket will hit the next agent too, load the agent skill `friction`.

## 8. Prove the checks

After the last commit of step 7, load the agent skill `prove`, also when a finding is still `open`. An open `high` or `medium` finding keeps the ticket open in step 9, but the proof is done in this run. Give `prove` the task name from step 2, the full text of the ticket, and the head commit. Put its result for each Acceptance check in the report: `pass`, `fail` or `untested`. If it will not load, tell the user. Mark every check `untested`. `prove` keeps its evidence under `.artifacts/<task-name>/evidence/`. Never commit that folder to the task branch. The installed `.gitignore` keeps its media out of `git status`. `/land` pushes the media to `evidence/<task-name>`. No fence yet

Then commit `.artifacts/<task-name>/review.md` and `.artifacts/<task-name>/ticket.md` if git shows them as changed or new. A follow-up with no findings leaves the review file changed. When the user types `/land`, it stops while a file outside `evidence/` is not committed. Held by: skills/land/scripts/land-check.mjs (exit 33 of preflight)

## 9. Close a local ticket and report

A local ticket has no pull request, so nothing else closes it. An open ticket blocks every ticket that names it. So close it here when the work is done:

- `peer-review` writes `Severity: high | medium | low` on each finding. A finding is open when its `Status:` is `open`. Before you close the ticket, make sure of three things. Every Acceptance check is `pass`. The review ran. No `open` finding has severity `high` or `medium`. An `open` finding of severity `low` does not block the close. List every `open` finding in the report.
- To close the ticket, append one line under `## Comments` in the file at the path from step 1. If the heading is missing, create it. The line reads: `Built on branch <branch>, last commit <short sha>. Merge the branch before you build a ticket that this one blocks.` Then set `Status: closed`.
- If any of these is true, leave `Status: open`. A check is `fail` or `untested`. The review is `not run`. A `high` or `medium` finding is `open`. Say in the report what blocks the close. Give the user the exact edit. When that blocker is gone, set `Status: closed` in `<path>`.
- A tracker ticket stays open. The pull request closes it.
- The user can make a decision during the build that changes the spec. Then add it with the date under `## Comments` of the ticket and of the spec. A later ticket then reads it.
No fence yet

Write the report in this exact form:
```markdown
## Build report: <ticket title>
Checkout: <path>   Branch: <branch>
Commits: <short sha> <subject> (one per line)
Failing test first: <test>. Failed with: <message>. Passes now: yes | no
Boundary chosen by build: <interface> (or "none, the ticket named them")
Acceptance checks: <check>: pass | fail | untested (one per line)
Checks: <command>: pass | fail | untested (one per line)
Review: <n> findings. Fixed: <ids>. Won't fix (user agreed): <id>: <why>. Open: <id> (<severity>). Or: not run
Changed after the review: <short sha> <files> (one per line), and "follow-up review: <n> findings" (or "None")
Skipped at the user's request: <step>: <what is lost> (or "None")
Not tested: <behavior or case>: <why> (or "None")
Design notes: <a shallow module or a missing module boundary outside the ticket, not changed> (or "None")
Ticket: closed in <path> | issue #<n>, open, closes when the pull request merges | open, blocked by <what blocks the close>, edit for the user: <the exact edit>
```

## 10. Next command

Tell the user to type `/land` next, in this checkout. It pushes the branch and opens the pull request with the evidence. Then it waits for the checks and merges through the merge gate. If the user asked `build` for a pull request, say that `/land` opens it. `build` opens no pull request. Never push to `main`. Held by: hooks/guard-git.mjs

After the merge, the user can type `/build <next ticket>` in a fresh session. If this session was harder than it needed to be, tell the user to type `/retro` first. The next task branch starts from `origin/main`. If the next ticket needs this work, it must merge first.

`build` never runs another typed workflow. It tells the user the next command to type. No fence yet

## Provenance

- `skills/engineering/implement/SKILL.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Kept nearly word for word: fetch the ticket and state its title, ask when the reference is ambiguous, and the typecheck, single-file and full-suite rhythm. Changed: `tdd` became `test-craft` with a fallback and with agreed boundaries passed in. `code-review` became `peer-review`. The review now runs after the commit, and findings get action. The work goes on a task branch in the checkout that `build` gets. `build` makes a branch only when HEAD is on the default branch or detached. Added a step that tells the user the next command, `/land`. Ideas in our words from `docs/engineering/implement.md` and `skills/engineering/implement-spec/SKILL.md`, same repo, license and holder: the corruption report from several sessions in one checkout, the shared stash, review before commit seeing nothing, self-review bias, one ticket per run, never reopen the plan, split a ticket that is too big, test boundaries that nobody agreed, the ticket staying open after the run, fix all review findings before the report, and the clash between `tdd` boundary confirmation and background runs.
- `new-feature/SKILL.md` and `AGENTS.md` lines 54-72 from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. Copied and adapted: the sync, scope check, naming and check steps, the port rule, the lockfile rule, and stop instead of guessing. Changed: plain-English edits, no semicolons or dashes, `--no-track`. Removed: the worktree steps, the worktree location rule, the cleanup and WORKTREES.md (owner ruling: whatever starts the session owns isolation).
- New here: the refusal to build in a checkout that another task uses, the user's choice to skip a step after one line of warning, "rebuild" over an in-work branch, "build anyway" over an open blocker, the no-stash rule, the new commit after review, the background rule, the report format, the blocker check before the branch, the blocker script (its `Blocked by:` line parser follows `skills/tickets/scripts/tickets-lint.mjs` in this repo), the in-work check script and the push right after the branch, the cases of the checkout check, finishing a ticket on its existing branch, the prove step, closing a local ticket only when no high or medium finding is open, and the Held by and No fence yet lines.
