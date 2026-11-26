---
name: setup
description: Find the issue tracker this repo uses (GitHub, GitLab, local files or another), set up the triage labels, confirm with you, and write the files in docs/agents/.
argument-hint: "[github | gitlab | local | other]"
disable-model-invocation: true
---

# Setup

`setup` is a **typed workflow**. It runs only when the user types `/setup`. It finds out where this repo tracks work, asks the user to confirm, and writes `docs/agents/tracker.md`. That file is the **tracker mapping**. For each action that the other skills take, it gives the command or file edit to use. The actions are create an issue, add a label, link a blocker and close an issue. When the user types `/spec` or `/tickets`, those commands read the file. If the `triage` skill is installed, `setup` also writes `docs/agents/triage-labels.md`, the **label mapping**.

## Important

- Take one section at a time: the tracker, then the labels. Ask one question for each section, with its recommended answer. Wait for the answer before the next section. No fence yet
- In the first reply, ask only the tracker question. For GitLab, also ask the plan question. Then stop. No fence yet
- Write no file and create no label before the user confirms the draft. No fence yet
- `setup` never runs another typed workflow. It tells the user the next command to type. No fence yet
- The other skills read only the files in `docs/agents/`. To change a command later, the user edits those files by hand. Run `setup` again only to switch trackers. No fence yet

## Trackers

It knows four trackers: GitHub (with `gh`), GitLab (with `glab`), local markdown files under `.scratch/`, and **Other**. Other is any tracker with no seed doc, such as Jira or Linear. For Other, the user describes the workflow, and `setup` records it as free text.

Each known tracker has a seed doc that `setup` copies and fills in. The seed docs travel with this skill. In a project they are in `.claude/skills/setup/`. In the stack repo they are here:

- [tracker/github.md](tracker/github.md): GitHub issues through `gh`
- [tracker/gitlab.md](tracker/gitlab.md): GitLab issues through `glab`
- [tracker/local.md](tracker/local.md): markdown files under `.scratch/`
- [triage-labels.md](triage-labels.md): the label mapping

## More than the tracker

The user can also ask for branch protection, the git hooks or the risk settings. Do the tracker and the labels first. Say so in one line in the first reply. Then read [EXTRAS.md](EXTRAS.md) and follow it for each item. No fence yet

## Steps

1. **Look before you ask.** Read what exists. Do not assume. Run each check as its own command, so that a denied check hides no other check.
   - `git remote -v`: does a remote point at `github.com`, at `gitlab.com`, or at a host with "gitlab" in its name? If the command is denied, read the `[remote` sections of `.git/config`.
   - `gh --version` and `glab --version`: which tool is installed, and which version?
   - `docs/agents/tracker.md` and `docs/agents/triage-labels.md`: if they exist, read them.
   - `.scratch/`: if it exists, local files can already be in use.
   - `.claude/skills/triage/`: if it exists, the triage skill is installed, and step 5 runs.
   - If a check is denied or fails, say so in one line and do the next check. Do not ask the user about it. Step 4 checks the tool later.
2. **Recommend one tracker and ask one question.** Pick in this order: the tracker that the user typed or named, the host of the remote, then local files. Word the question so that "yes" accepts your recommendation. Use these three lines, and keep `Recommended: yes.` as it is:

   ```
   Tracker: GitHub. The origin remote is github.com/<owner>/<name> and gh 2.105 is installed.
   Use GitHub issues for specs and tickets? Recommended: yes.
   Other choices: GitLab, local files under .scratch/, or another tracker such as Jira or Linear.
   ```

   For GitLab, ask one more question: "Does this project have GitLab Premium or Ultimate (needed for native blocking links)? Recommended: no." End the reply with the question. Ask no other question. Show no draft yet. Start the next step only after the user answers. Only a clear yes or a named choice counts.
   No fence yet
3. **For Other, get the workflow.** If the user picks another tracker and has not described it yet, ask one question. Ask the user to describe the workflow in one paragraph. It names how to read, create, comment on, label and close an issue, and how to link a blocker. If the user already gave that, do not ask again.
   No fence yet
4. **Check that the tracker works.** Skip this step for local files and for Other.
   - If the tool is missing, stop. Tell the user to install it (https://cli.github.com or https://gitlab.com/gitlab-org/cli), or offer local files.
   - Run `gh repo view --json nameWithOwner` or `glab repo view`. It must print the project from this folder. If it fails, stop and say what is missing.
   - If the user is not logged in, tell the user to run `gh auth login` or `glab auth login`.
   - If there is no remote, ask the user for the repo URL. Run `git remote add origin <url>` only after the user gives it.
   - The printed repo must be the user's own. In a fork, `gh` can default to the upstream repo. If the name looks like the repo of someone else, ask the user which repo gets the issues.
   - For GitHub, `gh` 2.94 or later has `--blocked-by` and `--parent`. If `gh` is older, tell the user that blockers will use the API or a text line, as the seed doc says.
   - For GitLab, run `glab issue create --help` and `glab issue note --help`. Check that every flag in the seed doc is in the help text. If a flag is missing, tell the user and fix the draft before you show it. The seed doc was written without `glab` installed.
   No fence yet
5. **Labels.** If the triage skill is not installed, skip this step. Otherwise ask one question: "Keep the default triage labels? Recommended: yes." The defaults are the label names in [triage-labels.md](triage-labels.md), each equal to its role. If the user says no, ask which names the tracker uses for which roles. Then the skills use the labels that exist and make no duplicates.
   No fence yet
6. **Draft the files.** For a known tracker, copy its seed doc. Fill in the `Repo:` line with the name from step 4 and the date. For GitLab, also fill in the `Blocking links:` line (`native` or `text line`). Change nothing else. For Other, write the file from the description of the user, with these lines and sections:
   - `Tracker: other`, `System: <the name, such as Jira>`, and a `Written by:` line with the date.
   - `## Actions`: read, create, comment, label, link a blocker and close, in the words and commands of the user.
   - `## Publish a spec`, `## Publish tickets` and `## Fetch a spec or ticket`, built from those actions.
   - Invent no command. If the user did not say how to do an action, write "Not described. Ask the user." for it.
   If step 5 ran, also copy [triage-labels.md](triage-labels.md) and fill in the second column. Show each whole draft to the user and let the user edit it.
   No fence yet
7. **Confirm, then write.** Write the files only after the user confirms the drafts. If `docs/agents/` is missing, create it. If a file already exists, show what will change and ask before you replace it. Change no other file. Do not commit.
   No fence yet
8. **Create the labels.** Skip this step for local files and for Other. On GitHub or GitLab, list the labels that exist (`gh label list --limit 200` or `glab label list`). Create each label of the label mapping that the tracker lacks, with `gh label create "<name>"` or `glab label create --name "<name>"`. The confirm of step 7 is the yes for this step. If a create fails, say which label and go on.
   No fence yet
9. **Report.** Reply with the tracker and the file paths. Add one line for each action that the file maps, and the labels that you created. Tell the user to commit the files in `docs/agents/` and get them into `origin/main` before the first `/build`. If the install files are not there yet, they go in the same commit. `/build` makes every worktree from `origin/main`, so a file that is only in this checkout is not in the build. Name the next command. Type `/grill` to plan a change. If a grill summary is already confirmed in this session, type `/spec`.

## Provenance

All sources are from [mattpocock/skills](https://github.com/mattpocock/skills), MIT license, Copyright (c) 2026 Matt Pocock.

- `skills/engineering/setup-matt-pocock-skills/SKILL.md`: the base of this skill. We kept "explore, recommend first, confirm, then write", one section and one answer at a time, the tracker choice from `git remote`, "done when `gh repo view` prints the project", the seed doc idea, Section B (the triage labels, the one question with "recommended: yes", the overrides, and the creation of each missing label), and the "Other" tracker recorded as free text. About a third of the steps keep his wording closely. Changes: renamed to `setup`. Dropped Section C (domain docs, with its look at `docs/adr/`, monorepo signals and a legacy `CONTEXT.md`) and the `## Agent skills` block in `CLAUDE.md` or `AGENTS.md`. The skills that need these files read them by path. The tracker skills read `docs/agents/tracker.md`. The skills that plan, test or debug read `GLOSSARY.md` and `docs/adr/`. `domain-memory` handles a repo with several contexts. Added the tool version check, the fork check at setup time, the GitLab plan question, the `Repo:` line, the replace-only-after-asking rule, the optional `P0` to `P3` rows, the extra items in EXTRAS.md, and Held by / No fence yet lines. One output file for the tracker, `docs/agents/tracker.md`, in place of `issue-tracker.md`.
- An earlier version dropped Section B and the "Other" tracker, and it refused requests for labels, hooks, risk settings and branch protection. The owner did not ask for that. The owner asked to "do what Matt does" for the tracker. Section B and "Other" are back, and the extra items follow the rule that the user decides.
- `skills/engineering/setup-matt-pocock-skills/issue-tracker-github.md`, `issue-tracker-gitlab.md`, `issue-tracker-local.md` and `triage-labels.md`: adapted into [tracker/github.md](tracker/github.md), [tracker/gitlab.md](tracker/gitlab.md), [tracker/local.md](tracker/local.md) and [triage-labels.md](triage-labels.md). Most command lines are his, lightly reworded. Changes: kept the "PRs as a request surface" flag, default off. Dropped the wayfinding operations. Added "Publish a spec", "Publish tickets", `--body-file` in place of a heredoc on GitHub, the `Repo:` and `Blocking links:` lines, a `Labels:` line and `Status: closed` for local files, and our ticket path `.scratch/<feature>/tickets/NN-title.md` (his was `issues/`). The `gh` flags were checked against the help text of `gh` 2.105. The `issue_dependencies_summary` field was read from a public issue. The `glab` commands, `gh label create`, `glab label create` and the `gh api` write calls were not run or checked.
- `docs/engineering/setup-matt-pocock-skills.md`: ideas only. Re-run only to switch trackers. His docs page says that labels are not created. His `docs/engineering/triage.md` names this bug #616. His skill text at commit 6f7f783 already creates them, and this version does the same after the confirm.
- Removed: `agents/openai.yaml`, `domain.md`, and the line that names his own repo as a place never to file into.
