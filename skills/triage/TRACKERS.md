# Triage on each tracker

How [SKILL.md](SKILL.md) reads, labels, comments on, closes and checks an issue on each tracker. Read this file before the first change on a tracker. `docs/agents/tracker.md` names the tracker of the repo. The commands there win if they differ from this file.

Contents:

- Labels on every tracker
- GitHub
- GitLab
- Local files

## Labels on every tracker

The roles are in SKILL.md: `bug`, `enhancement`, `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, and the optional `P0` to `P3`. If `docs/agents/triage-labels.md` exists, use its label name for each role. If not, the label name is the role name. The check reads the same file, or the file that `--labels <file>` names. The `setup` skill creates the labels. If a label is still missing, give the maintainer the command that creates it. Run it after a yes.

## GitHub

- List: `gh issue list --state open --json number,title,labels,createdAt --limit 100`. A list has no comments, so read each issue before you sum it up.
- Read: `gh issue view <n> --json number,title,body,labels,state,author,createdAt,comments`.
- Change the state: `gh issue edit <n> --add-label <new> --remove-label <old>`. Add the category and the priority the same way.
- Comment: write the comment to a file in the OS temp folder. Then run `gh issue comment <n> --body-file <file>`.
- Close a `wontfix` issue: post the Triage Decision first. Then run `gh issue close <n> --reason "not planned"`.
- Check: `gh issue view <n> --json number,labels,state,comments | node .claude/skills/triage/scripts/triage-check.mjs --json -`.
- Create a missing label: `gh label create "<name>"`.
- Pull requests, only when `docs/agents/tracker.md` says `PRs as a request surface: yes`, or when the maintainer names one:
  - List outside pull requests: the command in `docs/agents/tracker.md`. It keeps only authors who are not an owner, member or collaborator.
  - Read: `gh pr view <n> --json number,title,body,labels,state,author,createdAt,comments` and `gh pr diff <n>`.
  - Check the claim: `git fetch origin pull/<n>/head`, then `git worktree add --detach <OS temp folder>/pr-<n> FETCH_HEAD`. Run the tests there. Then run `git worktree remove <OS temp folder>/pr-<n>`. Make no branch.
  - Change the state, comment and close: `gh pr edit <n> --add-label <new> --remove-label <old>`, `gh pr comment <n> --body-file <file>`, `gh pr close <n>`. Never run `gh pr merge`.
  - Check: `gh pr view <n> --json number,labels,state,comments | node .claude/skills/triage/scripts/triage-check.mjs --json -`. A merged pull request counts as closed.

## GitLab

These `glab` commands were not run. The `setup` skill checks the flags of `glab` at setup time.

- List: `glab issue list -O json`.
- Read: `glab issue view <n> --comments`.
- Change the state: `glab issue update <n> --label <new> --unlabel <old>`.
- Comment: write the comment to a file in the OS temp folder. Then run `glab issue note <n> --message "$(cat <file>)"`.
- Close a `wontfix` issue: post the Triage Decision first. Then run `glab issue close <n>`.
- Check: `glab issue view <n> --comments -F json | node .claude/skills/triage/scripts/triage-check.mjs --json -`. The script reads `labels`, `state` and `notes`, but this output shape was not compared with a real `glab`. If the check exits 3, say that it did not run.
- Create a missing label: `glab label create --name "<name>"`.
- Merge requests, only when `docs/agents/tracker.md` says `MRs as a request surface: yes`: use `glab mr view <n> --comments`, `glab mr diff <n>`, `glab mr update`, `glab mr note` and `glab mr close`. Never run `glab mr merge`. These commands were not run.

## Local files

Reports from other people are files in `.scratch/reports/`, one file for each report. Edit them in the current checkout. A triage change needs no worktree, no branch and no commit. The name is `NN-title.md`: a number from `01`, a dash and lowercase words joined by dashes. A new report looks like this:

```markdown
# <title of the report>

Status: open
Labels: none
Reported by: <name>

<the report, as the reporter wrote it>
```

- List: read the files in `.scratch/reports/`. The `Labels:` line holds the category, the state and the priority.
- What is ready to build: read the reports and the ticket files in `.scratch/*/tickets/`. List each open file whose `Labels:` line has `ready-for-agent`. Name it by its path.
- Change the state: edit the `Labels:` line, such as `Labels: bug, ready-for-agent, P2`. Remove the old state.
- Comment: append the comment under a `## Comments` heading at the end of the file. If the heading is missing, create it. The check ignores a triage heading above the last `## Comments` heading, because that text is the report.
- Close a `wontfix` issue: post the Triage Decision under `## Comments`. Then set `Status: closed`.
- `ready-for-agent`: add one `Blocked by:` line under the `Labels:` line. It says `None (can start immediately)`, or names ticket files that exist next to the report, such as `../csv-export/tickets/01-login-form.md`. A reference such as `#12` does not work in a local file. `/build` reads that line and the Acceptance checks of the brief.
- Check: `node .claude/skills/triage/scripts/triage-check.mjs .scratch/reports/<file>`. Run it alone, with this relative path, so that a permission rule can match it.

The `Status:` line says only `open` or `closed`. Never write a triage state on it. `/build` reads it to find closed blockers.

## Exit codes of the check

- 0: the issue passes.
- 1: a rule is broken. Each line says what failed and how to fix it.
- 2: a usage error. Fix the command.
- 3: the script cannot read the issue. Say in the report that the check did not run.

## Provenance

New in this stack. The GitHub and GitLab commands follow the seed docs of our `setup` skill, which come from `skills/engineering/setup-matt-pocock-skills/issue-tracker-*.md` of [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). The `gh label create` advice comes from `docs/engineering/triage.md` of the same repo. The pull request commands follow "Pull requests as a triage surface" in his `issue-tracker-github.md`. The temporary checkout, the `.scratch/reports/` folder and the `Labels:` line for the state are new.
