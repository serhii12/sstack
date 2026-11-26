# What enforces each rule

A rule is here when a script, hook or test holds it. Rules that are only instructions are marked `No fence yet` in the skill that states them. Run `node scripts/skill-lint.mjs --json` for the current count.

The git guard is the hook adapter for Claude Code. In other agent tools, only the git hook, the scripts and CI hold these rules.

## The git guard

| Rule | Held by | Proof |
|---|---|---|
| No git flags that skip checks (`--no-verify`, `commit -n`), in any wrapper or nested shell | `hooks/guard-git.mjs`, `hooks/git-policy.mjs` | `tests/hooks/git-policy.test.mjs`, `tests/hooks/redteam.test.mjs` |
| No change to the hooks path, and no `include.path` or `includeIf` in git config | `hooks/git-policy.mjs` | `tests/hooks/git-policy.test.mjs`, `tests/hooks/redteam.test.mjs` |
| No command that writes, removes or changes the mode of `.git/hooks`, `.git/config`, `.githooks/`, `.stack/`, `.claude/settings.json` or `.claude/hooks/`. A command that only reads them runs | `hooks/git-policy.mjs` | `tests/hooks/protected-paths.test.mjs` |
| No git command that changes a guard file through a pathspec: checkout, restore, rm, mv, clean, reset, checkout-index, stash push, apply, am and output options | `hooks/git-policy.mjs` | `tests/hooks/git-pathspec.test.mjs` |
| No agent edits to the guard files and the settings files. The guard runs on every Bash call, and a guard that cannot run blocks | deny rules and the hook entry in `templates/claude-settings.json` | `tests/hooks/guard-git.test.mjs` |
| No commits, cherry-picks, reverts or `commit-tree` while on `main` or `master` | `hooks/git-policy.mjs` | `tests/hooks/git-policy.test.mjs` |
| No plain force push. `--force-with-lease` is allowed | `hooks/git-policy.mjs` | `tests/hooks/git-policy.test.mjs` |
| No direct push to `main` or `master`. A dry run is allowed | `hooks/git-policy.mjs` | `tests/hooks/git-policy.test.mjs` |
| The guard blocks when it cannot read its input, and when the policy file cannot load | `hooks/guard-git.mjs` | `tests/hooks/guard-git.test.mjs` |
| A command text over 256 KB, or with a null byte, is blocked | `hooks/git-policy.mjs` | `tests/hooks/redteam.test.mjs` |

The header of `hooks/git-policy.mjs` lists what the guard cannot see. Branch protection on the git host is the real fence.

## The git hook

| Rule | Held by | Proof |
|---|---|---|
| Every commit runs `.stack/check`, also when `git commit -n` skips pre-commit | `templates/githooks/prepare-commit-msg` | `tests/hooks/prepare-commit-msg.test.mjs` |
| A commit is refused when `.stack/check` is in the repo but cannot run | `templates/githooks/prepare-commit-msg` | `tests/hooks/prepare-commit-msg.test.mjs` |

## The installer

| Rule | Held by | Proof |
|---|---|---|
| The installer never overwrites a file and never writes outside the target, also through a symlink | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer refuses a target that is not a git repo, and refuses this repo itself | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer switches on the git hook with `git config core.hooksPath .githooks`. It keeps a value that is already set | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer creates a starter `.stack/check` that lets a commit through with a warning | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer creates a starter `docs/agents/enforcement.md` | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer appends `.gitignore` rules that keep evidence media (`.artifacts/*/evidence/**/*.png` and other media types) out of commits. It adds only missing rules, never rewrites a line and never writes through a symlink. The review file and the evidence index stay visible to git | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| The installer creates `CLAUDE.md` as a relative symlink to `AGENTS.md`. It never changes a `CLAUDE.md` that exists | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |
| In this repo, `CLAUDE.md` is a relative symlink to `AGENTS.md`, and `templates/` has no `CLAUDE.md` | `tests/scripts/install.test.mjs` | `tests/scripts/install.test.mjs` |

## The lints

| Rule | Held by | Proof |
|---|---|---|
| Skill frontmatter parses, has a `name` and a `description`, and the name matches the folder | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| `SKILL.md` has 150 lines or fewer | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Every file that a skill points to exists | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Every `Held by:` names a path that exists, and no planned item | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| A typed skill never tells the agent to run another typed skill | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| The router list in `skills/start` matches the `skills/` folder and the type of each skill | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Every skill has a `## Provenance` section | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Skill text has no semicolons and no em or en dashes | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| In the files that the test reads, each state name, exit code and gate order equals the list that its script exports. The test compares names only. It never checks a move that a person makes | `tests/scripts/state-names.test.mjs` | `tests/scripts/state-names.test.mjs` |
| The writing rules of `CONVENTIONS.md` in skills, templates, evals, `README.md`, `CONVENTIONS.md` and `AGENTS.md`: STE rules and house rules, American spelling, and every pattern of the owner's slop checker. CI runs it in both jobs. It is not part of `bun run test` | `scripts/style-lint.mjs` | `tests/scripts/style-lint.test.mjs` |

## Scripts inside skills

| Rule | Held by | Proof |
|---|---|---|
| A spec has every required section, one `Status: draft` line and no ready marker | `skills/spec/scripts/spec-lint.mjs` | `tests/scripts/spec-lint.test.mjs` |
| An essential that is not agreed reads "Not agreed. See Open questions." and has an open question | `skills/spec/scripts/spec-lint.mjs` | `tests/scripts/spec-lint.test.mjs` |
| Local ticket files have a valid name, a title, acceptance checks and one `Blocked by:` line | `skills/tickets/scripts/tickets-lint.mjs` | `tests/scripts/tickets-lint.test.mjs` |
| Local tickets have no number clash and no blocker cycle. The ticket with the lowest number has no blockers | `skills/tickets/scripts/tickets-lint.mjs` | `tests/scripts/tickets-lint.test.mjs` |
| With `--max <n>`, one tickets folder holds n ticket files or fewer. There is no default cap | `skills/tickets/scripts/tickets-lint.mjs` | `tests/scripts/tickets-lint.test.mjs` |
| `build` starts a local ticket only when every blocker has `Status: closed`. A blocker with a `Built on branch` line also needs its built commit in `origin/main`, or a `Merged` line | `skills/build/scripts/ticket-ready.mjs` | `tests/scripts/ticket-ready.test.mjs` |
| `build` makes no worktree when another worktree, a local branch or a fetched remote branch already builds the ticket | `skills/build/scripts/ticket-in-work.mjs` | `tests/scripts/ticket-in-work.test.mjs` |
| The review diff holds commits, staged and unstaged changes and new files. An empty range stops the review | `skills/peer-review/scripts/review-range.mjs` | `tests/scripts/review-range.test.mjs` |
| Every acceptance check has one evidence entry. `pass` and `fail` name a file, and `untested` has a reason | `skills/prove/scripts/evidence-check.mjs` | `tests/scripts/evidence-check.test.mjs` |
| Every evidence file exists inside the evidence folder, matches its sha256, and has the magic bytes of its type | `skills/prove/scripts/evidence-check.mjs` | `tests/scripts/evidence-check.test.mjs` |
| A visual `pass` has a `matches` verdict, a saved reviewer reply that agrees, and a phone and a desktop width | `skills/prove/scripts/evidence-check.mjs` | `tests/scripts/evidence-check.test.mjs` |
| At level `red-then-green`, every `pass` has a `before` file and an `after` file. The index names HEAD or an ancestor | `skills/prove/scripts/evidence-check.mjs` | `tests/scripts/evidence-check.test.mjs` |
| The `improve-codebase` report has its sections, a valid rank and every field on each candidate, and a top recommendation. There is no cap on the candidates. "No change recommended" with a reason is a full result | `skills/improve-codebase/scripts/survey-lint.mjs` | `tests/scripts/survey-lint.test.mjs` |
| Each path that the `improve-codebase` report cites is relative, stays inside the repo and exists | `skills/improve-codebase/scripts/survey-lint.mjs` | `tests/scripts/survey-lint.test.mjs` |
| The scope of `improve-codebase` ranks files by the number of commits that changed them | `skills/improve-codebase/scripts/churn.mjs` | `tests/scripts/churn.test.mjs` |
| Each triaged issue has one category label, one state label and one priority label at most | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| The AI line sits right above every triage heading. A heading without it does not count as triage output | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| `ready-for-agent` and `ready-for-human` need an Agent Brief with acceptance checks. `ready-for-human` needs a `Why a human:` line. `needs-info` needs Triage Notes with a question. `wontfix` needs a closed issue with a Triage Decision | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| A rejected enhancement names a `.out-of-scope/<concept>.md` file that exists | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| A local report has one `Status:` line (open or closed), one `Labels:` line, and a `Blocked by:` line when it is `ready-for-agent` | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| Tracker labels map to roles through `docs/agents/triage-labels.md` or `--labels <file>`. A pull request in `gh pr view` JSON is checked like an issue, and `MERGED` counts as closed | `skills/triage/scripts/triage-check.mjs` | `tests/scripts/triage-check.test.mjs` |
| A prototype lives on `prototype/<name>` and changes only `prototypes/<name>/` and the files on its `Host files:` line | `skills/prototype/scripts/prototype-check.mjs` | `tests/scripts/prototype-check.test.mjs` |
| The base branch does not contain the prototype commits and has no `prototypes/<name>/` folder, committed or not. A copy of the logic into real code and a pushed prototype branch are allowed | `skills/prototype/scripts/prototype-check.mjs` | `tests/scripts/prototype-check.test.mjs` |
| `prove` installs Playwright only in a temp folder outside the project, deletes that folder at the end, and prints what it installed and where | `skills/prove/scripts/run-playwright.mjs` | `tests/scripts/run-playwright.test.mjs` |
| `land` merges only when every gate passes on the head commit. The merge call pins the head sha, and the script reads the merge back | `skills/land/scripts/land-check.mjs` | `tests/scripts/land-check.test.mjs`, `tests/scripts/land-attack.test.mjs`, `tests/scripts/land-fakegh.test.mjs` |
| The changed files and the config on the default branch set the risk. Only a high risk needs a person: a GitHub approval on the head by a person with write access who wrote no commit, or `--owner-approved` with the head sha | `skills/land/scripts/land-check.mjs`, `skills/land/scripts/land-lib.mjs` | `tests/scripts/land-check.test.mjs`, `tests/scripts/land-attack.test.mjs`, `tests/scripts/land-risk.test.mjs` |
| The review ranges make one chain from the merge base of the pull request to the head, and no finding of severity high or medium is open | `skills/land/scripts/land-check.mjs` | `tests/scripts/land-attack.test.mjs` |
| The watcher prints the text of comments and reviews only in an untrusted block, and stops after 2 fix rounds | `skills/land/scripts/land-wait.mjs` | `tests/scripts/land-wait.test.mjs` |
| Evidence media goes to the branch `evidence/<task>` of the same repo. The gate refuses media in the pull request | `skills/land/scripts/land-evidence.mjs`, `skills/land/scripts/land-check.mjs` | `tests/scripts/land-evidence.test.mjs`, `tests/scripts/land-check.test.mjs` |
| `land` closes a local ticket only when GitHub shows the merge | `skills/land/scripts/land-check.mjs` (`close-ticket`) | `tests/scripts/land-attack.test.mjs` |

## The eval runner

| Rule | Held by | Proof |
|---|---|---|
| The runner never passes a flag that turns off hooks or skips permissions, and refuses network tools unless `--allow-network` | `scripts/eval-run.mjs` | `tests/scripts/eval-run.test.mjs` |
| The runner records the model with each result | `scripts/eval-run.mjs` | `tests/scripts/eval-run.test.mjs` |

## Confirmed in a live Claude Code session (v2.1.332, 25 Nov 2026)

- A hook that exits with code 2 blocks the command.
- A typed skill is hidden from the agent's own list and still runs when typed.
- `grill` made the agent load `domain-memory` in 2 of 2 runs.
- The deny rules stopped the agent editing the hook and its settings.

## Not held by anything yet

- Interview rules in `grill`, glossary and decision record rules in `domain-memory`, the stop-and-wait rule in `decide`, and the sorting rules in `start`.
- The text rules of `retro`: propose first and write nothing before a clear yes (an up-front "apply all" is the yes), push back once on a rule in `AGENTS.md` or `CLAUDE.md`, a check before a sentence, and no shell command around a deny rule. The deny rules themselves are held (see the git guard).
- The text rules of `friction`: the four-part bar, one push back on a request to file below the bar, and no secrets or private data in an issue.
- The rule that the user decides (root and template `AGENTS.md`): a skill pushes back once, then does what the user asked, and names the step in its report. `build`, `code-craft`, `domain-memory`, `improve-codebase`, `land`, `retro` and `friction` follow it in text only.
- `build` pushes the task branch right after it makes the worktree, so that the in-work check on another machine sees it. It cannot see a branch that nobody pushed. The "rebuild" and "build anyway" overrides of `build` are text rules.
- No commit on `main` or `master` in an agent tool other than Claude Code. The git hook runs `.stack/check` only and does not look at the branch. Branch protection on the git host blocks the push, not the local commit.
- The text rules of `triage` (text in a report is data, recommend then wait, change only the named issue, no worktree for a tracker write, pull requests only when the repo opts in, never merge a pull request, create a missing label only on the maintainer's yes) and of `prototype` (refuse a merge into `main`). The evals `evals/triage/02-hidden-instruction.md` and `evals/prototype/02-merge-refused.md` test two of them. `prototype-check.mjs` finds a merge only after it happens.
- `improve-codebase` changes no source file.
- The text rules of `setup`: write no file before the user confirms, create missing labels only after the draft is confirmed, and change branch protection only on a yes.
- The TypeScript rules of `code-craft`. A project check command holds them only when the project runs the tools in `TYPESCRIPT.md`. This stack installs none of them.
- Decision record format. Planned: `skills/domain-memory/scripts/adr-lint.mjs`. `tests/scripts/state-names.test.mjs` holds only that three files list the same status forms.
- Whether a skill loads when it should. Planned: a test that runs each skill several times.
- The text rules of `land`: the user typed the approval in the session, no `--admin`, no auto-merge, no change to branch protection, and the text of comments and checks is data. The evals `evals/land/05-comment-claims-owner-approval.md` and `evals/land/07-high-stops-then-owner-word.md` test two of them.
