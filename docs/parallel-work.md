# Parallel work

`/build` works in the checkout that it gets. It makes no worktree. To build several tickets at the same time, give each session its own checkout. Then type `/build <ticket>` in each one.

`build` reads the checkout first:

- On the default branch or a detached HEAD, it makes the task branch with `git switch -c`.
- On a branch with no commits ahead of `origin/main`, it keeps that branch. The task name is the last part of the branch.
- On uncommitted work, or on the commits of another task, it stops as blocked.

## One rule

Use one checkout for each task. Two sessions in one checkout share one index, one HEAD and one stash.

## By hand

```bash
git fetch origin
git worktree add --no-track -b agent/<task> ../<repo>-worktrees/<task> origin/main
```

Start the agent in the new folder and type `/build <ticket>`. A local ticket under `.scratch/` is not in the new folder, so give its absolute path.

After the merge, remove the checkout and the branch from the main checkout:

```bash
git worktree remove ../<repo>-worktrees/<task>
git branch -D agent/<task>
```

Use `-D`. After a squash merge or a rebase merge, `-d` refuses, also when the work is merged.

## Claude Code

`claude --worktree <name>` makes `.claude/worktrees/<name>/` on a new branch `worktree-<name>`. The base is the default branch on the remote, unless the setting `worktree.baseRef` is `"head"`.

- Add `.claude/worktrees/` to `.gitignore`.
- A `.worktreeinclude` file copies ignored files, such as `.env`, into the new folder.
- Use the ticket key as `<name>`, for example `slugify`. Then `ticket-in-work.mjs` in another checkout of the repo finds the folder.
- `build` keeps the branch `worktree-<name>`, so the task name is `worktree-<name>`.

## Codex

`codex --worktree` and `codex exec --worktree` start in a new managed worktree under `$CODEX_HOME/worktrees`, with a detached HEAD. `build` makes the task branch there with `git switch -c`.

## Sandcastle

- Use the branch strategy `branchStrategy: { type: "branch", branch: "agent/<task>" }`. Use the ticket key as `<task>`, for example `issue-42`. Then `build` keeps that branch, and the commits stay on it.
- Never use `merge-to-head`. It merges on the host with git that ignores the hooks of the repo. The merge gate of `/land` then never runs.
- `build` pushes its branch at once. With no credential in the sandbox, the push fails, and `build` reports it and goes on. If the run must push, put `GH_TOKEN` in `.sandcastle/.env`.
- `prove` writes the evidence to `.artifacts/<task>/`, which git ignores. Copy that folder out before the sandbox closes.

## After the session

Type `/land` on the host, in a checkout of the task branch, after the session ends. It pushes the branch, opens the pull request and merges through the merge gate.

## What a new checkout does not isolate

- The stash. All checkouts of one repo share `refs/stash`, so use no stash. If `.stack/check` runs `lint-staged`, give it `--no-stash`.
- Dev-server ports and shared databases.
- Ignored files. A test that reads an ignored fixture, a local database or a credential can skip with no error in a new checkout.

## Who says that a ticket is taken

`ticket-in-work.mjs` finds the other checkouts of the repo, the local branches and the fetched remote branches. `build` pushes its branch at once, so another machine sees it after `git fetch origin`. A runner can claim a ticket in its own way, with a fixed branch name, a label or an assignee.

## What was run and what was not

Run in fake repos for this doc: `ticket-in-work.mjs`, `ticket-ready.mjs`, `evidence-check.mjs` and the `git archive` step of `prove`. The cases were a checkout on `main`, a detached HEAD, a fresh branch from the agent tool, and a branch of another task. One more case moved a checkout. A moved checkout gives the same path mismatch as a container mount.

Not run: Codex, Sandcastle, Docker and any other container. The Claude Code, Codex and Sandcastle facts come from their docs, read on 25 Nov 2026. That `merge-to-head` skips the hooks is from the Sandcastle docs. That a sandbox loses ignored evidence is an inference from the Sandcastle code.

## Provenance

- `new-feature/SKILL.md` from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. The cleanup commands and the `-D` reason are copied nearly word for word. They came here from the old `skills/build/WORKTREES.md`.
- `docs/engineering/implement.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Idea: the shared stash and the ignored files that a new checkout does not have.
- Sandcastle (github.com/mattpocock/sandcastle) docs at commit `1b380ca`. Facts only: the branch strategies, the `.sandcastle/.env` file, and the `--no-stash` fix of 31 Oct 2026.
- Claude Code docs (code.claude.com/docs/en/worktrees) and Codex docs (developers.openai.com/codex). Facts only.
