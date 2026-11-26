---
name: retro
description: Lists the agent's mistakes in a session, proposes one fix for each, and waits for approval.
argument-hint: "[session to review, default this one]"
disable-model-invocation: true
---

# Retro

`retro` is a typed skill: it runs only when the user types `/retro`. It improves the environment of the coding agent, so that future runs go better. The environment is everything that the agent works inside: checks, hooks, reviewer standards, steering files and docs. Steering files are `AGENTS.md` and `CLAUDE.md`. `retro` changes the environment. It leaves the code from the session alone.

## Important

- `retro` proposes first. Until the user approves, write no file. Only a clear yes counts, by number or "all". Silence does not count. If the user says "apply all" or "skip the proposal" before you propose, that is the yes for every item. Then write the items and list each one in the report. No fence yet
- Do not propose a rule for `AGENTS.md` or `CLAUDE.md` on your own. These files load into every session. Add only pointers there. A pointer is a line that tells the agent where to find a file. If the user asks for a rule there, push back once, also after an up-front yes. Say why, and propose a check or a standards line. Change neither file in that reply. If the user asks again or confirms, write the rule. Name it in the report. No fence yet
- A mechanical mistake gets a deterministic check. Default to building the check over writing the rule. A check can fail. A sentence in a standards file cannot. No fence yet

## Steps

1. **Read the session.** Read the primary sources for the session that the user names. If the user names a log file, read that file. A search of the session logs on this machine can help. Claude Code keeps them as JSONL files under `~/.claude/projects/`. If the user names no session, use the current one. If the current session is too long to review, say so. The user can clear it, type `/retro` again, and point it at the log of this session.
2. **Read what already holds rules.** Read `docs/agents/enforcement.md` and the check command of the repo first. The check command has four parts. They are the `lint` and `check` scripts, `.stack/check`, `.githooks/`, and the CI workflow. If `docs/agents/enforcement.md` does not exist yet, there is no list to read. Continue. If a check exists but nothing runs it, or it is broken, report that as the finding. Do not build a second check.
3. **List the mistakes.** Give one line for each mistake. Add the moment that it happened: the tool call, the message, or the command output. Each moment must show the agent getting something wrong, or a check missing a real mistake. Drop any candidate that you cannot trace to such a moment. A flaw in the repo that caused no mistake in the session is not a mistake. Advice made up to fill a category is worse than a short list. No fence yet
4. **Sort each mistake into one class** (table below). If the session broke a rule, look it up in `docs/agents/enforcement.md`. A `No fence yet` rule that the session broke is the first candidate for a check.
5. **Propose.** Post the proposal in the format below. Put the most severe mistake first. Then stop. A quiet, expensive mistake can rank above a loud, cheap one.
6. **Write only what the user approved**, as the sections below say.
7. **Report** what changed. Tell the user the next command.

## Classes

| Class | Use when | The fix |
| --- | --- | --- |
| **Mechanical** | A script can catch it: a fixed pattern, a banned API, an import shape, a file-location rule, a step run out of order. | A check that fails on it. |
| **Judgment** | Only a reviewer can judge it: consistency across files, matching the surrounding style. | One line in the reviewer standards. |
| **Unwired check** | A check exists but did not run, or it is broken. | Wire it into the check command, or fix it. |
| **No guardrail** | The repo has no pre-commit hook and no CI job that runs lint, typecheck and tests. | Report it as a finding of its own. |
| **Pointer** | The agent took a long time to find a file or a fact. | A pointer from a file that the agent already reads. |
| **Information access** | The agent needed information and had no way to reach it. | Tee dev-server logs to a file, or give read-only access to a service. |
| **Tool economy** | A tool call cost a lot for what it returned. | Make the call or the tool cheaper. |
| **Steering bloat** | `AGENTS.md` or `CLAUDE.md` has lines that change nothing, or steering that belongs in a check or the standards. | Delete the line, or move it. |
| **Stale check** | A check fired on good code in this session. | Propose to remove or narrow it. |

Classify first. A mechanical mistake gets one of four fixes: a lint rule, a test, a git hook or a CI job. Use the cheapest one in this repo.

A check must not guess. If a script must guess what the code means, class the mistake as Judgment. An example is a rule that looks for two words in one function body.

When you choose the file for a rule, or create `docs/agents/enforcement.md`, read [REFERENCE.md](REFERENCE.md). It says why the reviewer owns the standards, which file holds what, and the format of the list. If a step fails, read the Troubleshooting table in the same file.

## Proposal format

Use this form exactly.

```markdown
## Retro: <session>
Status: WAITING FOR YOUR APPROVAL

1. <the mistake, one line>
   Moment: <the tool call, message or output, quoted or pointed to>
   Class: <class>
   Change: <file to add or edit, and the check or the line of text>
   Held by after: <path of the check, or "No fence yet" for a standards line>

Reply with the numbers to approve, for example "1, 3", or "none".
```

Example of one filled item:

```markdown
1. The agent called `eval` in a build script, and the reviewer rejected it.
   Moment: message 9, the reviewer wrote "Do not use eval here" on the pull request.
   Class: Mechanical
   Change: Add a lint rule that bans a call to `eval` in the build scripts.
   Held by after: the lint config of the repo
```

## Writing an approved check

1. Make a new branch in its own worktree from `origin/main`, as rule 1 of `AGENTS.md` says. Run `git fetch origin`. Then run `git worktree add --no-track -b agent/<name> <folder> origin/main`.
2. Start each later command with `cd <folder> &&`. Write every file below inside that worktree.
3. Call the Skill tool with "test-craft". It teaches how to prove a new check with a planted bug. If it will not load, tell the user and follow the steps below.

Then do these steps for each approved check:

1. Write the lint rule or test that fails on the mistake first. Put it beside the other checks of the repo. Run it on the mistake, or on a planted copy of it. Watch it fail. Keep that output. No fence yet
2. Then fix every existing instance, so the rule starts at zero findings.
3. If some findings must stay for now, record them as a baseline. Prefer to shrink the baseline. A baseline can grow only with a one-line reason in the pull request.
4. Wire the check into the check command of the repo, so it runs on every commit and in CI.
5. Write its message as `<what failed>. <why>. Fix: <step>.`, as rule 6 of `AGENTS.md` says.

If a check cannot catch the pattern, change the code so the wrong version is hard to write. If neither works, write a standards line.

## Writing an approved standards line

Add one line to the reviewer standards: CODING_STANDARDS.md at the repo root, or the standards file that the repo already keeps. `peer-review` reads it. If the file does not exist, create it. Write the line in plain English. Say what to flag, and why.

## Updating the enforcement list

Add or change one row in `docs/agents/enforcement.md` for every rule that this retro touched. The row says what holds the rule now. Keep the format of the file. If the file does not exist, create it, and `docs/agents/` too, with the format in [REFERENCE.md](REFERENCE.md). The agent can write this file. The stack repo itself keeps its own list at `.stack/enforcement.md`. Leave that one alone.

The settings template denies agent edits under `.stack/`, `.githooks/`, `.claude/hooks/` and to the `.claude/` settings files. This stops an agent from weakening its own fences. Held by: templates/claude-settings.json (Edit deny rules), hooks/guard-git.mjs (shell writes)

If a change needs one of those paths, do not use a shell command to get around the deny rule. Show the user the exact text. Ask the user to apply it. No fence yet

## Report and next command

List each approved item. Give the files written and the failing run that you saw. Give the passing run after the fix. Name each rule that is still `No fence yet`. Commit on the branch. Never skip the git hooks. Held by: hooks/guard-git.mjs

Tell the user to type `/peer-review` next and to commit its review file. Then `/land` pushes the branch, opens the pull request and merges it through the merge gate. `/land` stops when the branch has no review file. If the user declined every item, there is no next command.

`retro` never runs another typed skill. It tells the user the next command to type. No fence yet

## Provenance

- `skills/engineering/retro/SKILL.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. The base of this skill. Kept close to his words: the opening sentence, reading the session logs, the current session by default, reading the check command of the repo first, the mechanical and judgment split, "default to building the check", and the categories (as the class table). Changed: no `writing-for-agents` step, "not X but Y" phrasing rewritten, a fixed proposal format and approval gate, Unwired check, No guardrail and Stale check made into classes, writes after approval, and the enforcement list.
- `docs/engineering/retro.md`, same repo, license and holder. Ideas in our words: trace each candidate to a moment, a check can fail and a sentence cannot, severity order as a first draft, a fresh session for a long one, pruning stale checks. The push back on a rule in `AGENTS.md` follows its answer to "Should I add a line to `CLAUDE.md`?": "Usually not, and retro pushes back".
- `skills/gardener/SKILL.md` from ratstack (github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. Steps 1 to 4 of "Remove prohibited patterns" are copied and adapted into "Writing an approved check": rule first, watch it fail, fix every instance, a baseline that only shrinks. The "hard to write, prose last" paragraph is adapted. Removed: pins, peers, oxlint, Effect and rat-stack paths.
- `skills/uncomplect/SKILL.md` line 63, same repo, license and holder. Idea only: the `No fence yet` label that the enforcement list is built on.
- New here: the enforcement list (kept at `docs/agents/enforcement.md` in a project, because the agent may not write under `.stack/`) and promoting broken `No fence yet` rules from it, the rule about paths the agent may not edit, the rule that a check must not guess, and the filled example item. The rule against rules in `AGENTS.md` follows the source: retro pushes back once, then writes the rule if the user asks again. An earlier version declined every time, and it counted no up-front "apply all" as a yes. The owner did not ask for either, and both are gone.
