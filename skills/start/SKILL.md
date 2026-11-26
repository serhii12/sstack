---
name: start
description: Sorts a task by type, records its evidence level in a handoff note, and names the next command to type.
argument-hint: "[what you want done]"
disable-model-invocation: true
---

# Start

`start` is a typed skill. It runs only when the user types `/start`. An agent skill is a skill that the agent can also load on its own. `start` sorts one task, writes a short handoff note, and tells the user which command to type next. It does no other work.

## Important

- `start` reads and sorts. It does not edit repo files, create branches, or run commands that change anything. The handoff note is the only file that it writes. No fence yet
- If the user asks you to skip the sort or the note, say in one line what is lost. Then skip it, and name the skipped step in your reply. No fence yet
- `start` never calls another typed skill. It tells the user the command to type. The docs say that Claude Code blocks this. The agent cannot run a skill that has `disable-model-invocation: true` unless the user's message names it (to confirm in Claude Code). No fence yet

## Commands that exist today

Name only these commands. Their purposes are short labels. Before you describe what a skill does, read its `SKILL.md`. No fence yet

The agent's own skill list does not show a typed skill. The skill still runs when the user types it. Trust this block. Never report a listed skill as missing. No fence yet

This block must list exactly the folders in `skills/`, each with the right type. Held by: scripts/skill-lint.mjs

<!-- skills:begin -->
start | typed | Sort a task by type, record its evidence level, and name the next command
grill | agent | Interview the user with recommended answers until they confirm the plan
domain-memory | agent | Keep GLOSSARY.md and ADRs current and challenge fuzzy terms
decide | agent | List options with effort and undo cost, recommend one, then wait
setup | typed | Record which issue tracker the repo uses
spec | typed | Write the spec (the PRD) from the plan that the user confirmed
tickets | typed | Split one spec into small tickets with blocking links
build | typed | Work one ticket in its own worktree: failing test, code, commit, review
test-craft | agent | Pick the test, write it failing first, and plant a bug in each new check
peer-review | agent | Review a change with two fresh reviewers, Standards and Spec
diagnose | agent | Find the cause of a failure, starting from a command that fails
friction | agent | File a repeated problem as an issue with a priority
retro | typed | Turn the mistakes of a session into checks or reviewer standards
prove | agent | Gather proof that a change works and mark each acceptance check pass, fail or untested
code-craft | agent | Give the shared terms and rules for modules, interfaces and module boundaries
improve-codebase | typed | Scan the code for shallow modules and rule breaks, and write a ranked report
triage | typed | Sort issues that other people filed into a state, with a brief, questions or a close reason
prototype | agent | Build throwaway code on its own branch to answer one design question
land | typed | Push a finished ticket branch, open its pull request, wait for checks, and merge
<!-- skills:end -->

**Not built yet:** `pr-body`, `skill-craft`, `security-review`. Mention each one only as "not built yet". Say what to do by hand in the meantime. Never tell the user to type one. No fence yet

## Steps

1. Read the text that the user typed after `/start`. If there is no text, ask one question: "What do you want done?"
2. If the project has an `AGENTS.md`, read it. Its rules apply to every type below.
3. Sort the task into one type from the table. If two types fit, pick the type that needs more proof (bug, then code change, then docs-only, then read-only). If another person filed the bug or the request on the tracker, sort it as a report from someone else. If you cannot tell which type fits, ask the user one question. If the user wants a pull request for a change that is not made yet, sort by the change itself.
4. Take the evidence level from the same row.
5. Write the handoff note (format below). Fill every field. Write `none` in a field that has no value.
6. Reply to the user with five items. These are the type, the evidence level, one line on why, the note path, and the next command. Write the command in a code span. Then list the steps that follow as "not built yet" where they are not built.
7. Name the between-phases option that fits now. Going from `start` to the next command is usually Continue. If the option is not clear, use the tree in [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md).

## Task types

| Type | How to tell | Evidence level | Next command today | Not built yet |
| --- | --- | --- | --- | --- |
| Read-only question | Explain, review, or investigate. Nothing changes in the repo. | `cite` | None. Ask the question in this session. For a survey of the shape of the code, the user can type `/improve-codebase`. | |
| Docs-only change | Edits only to docs, comments or text files. | `content` | If the change is unclear, `/grill`. Otherwise edit by hand on a new branch, then type `/land`. | |
| Code change | Changes behavior, config or dependencies. | `behavior` | `/grill`. After it, the user types `/spec`, then `/tickets`, then `/build` for each ticket. | |
| Bug | Something works wrong today. | `red-then-green` | If the right behavior is unclear, `/grill`. Otherwise `/diagnose`. | |
| Report from someone else | A bug report or a request that another person filed on the tracker. | `cite` | The user types `/triage`. After it, `/build <issue>` for a `ready-for-agent` issue, or `/grill` for a design question. | |
| Design question | A question about logic or a screen that talk cannot settle. Nothing ships. | `behavior` | `/prototype`. After it, `/grill` with the verdict. | |
| Ship request | The change is made. The user wants it delivered, as a pull request or a finished change in the repo. | `checks` | The user types `/land`. It opens the pull request and merges only through its merge gate. | `pr-body` |

What each type needs:

- Read-only: use no worktree, branch, commit or PR. If edits follow, the user runs `/start` again for them.
- Docs-only: use its own worktree and branch, like any change. Run content and link checks. Do not make up runtime proof. The diff must touch only doc files. No fence yet
- Code change: use its own worktree and branch. Run the repo's checks. Show proof that the changed behavior works.
- Bug: do everything that a code change needs. Before you fix anything, get a command that fails on this bug.
- Report from someone else: use no worktree and no branch. A triage change is a tracker write. The maintainer approves each change.
- Design question: use a `prototype/<name>` branch and the folder `prototypes/<name>/`. Never merge the branch into `main`. The verdict goes to `/grill`.
- Ship request: sort a task as this type only when the user asks for one. A plan, a review or a throwaway experiment is not a ship request.

If the user wants to weigh trade-offs, the user can type `/decide`.

## Evidence levels

| Level | What counts as proof |
| --- | --- |
| `cite` | Each claim points to a file and line, an issue, or a commit. |
| `content` | Links resolve. You ran the commands and examples in the docs, or marked them untested. |
| `behavior` | A test or command shows the new behavior. Keep the output. |
| `red-then-green` | The same command failed before the fix and passes after it. |
| `checks` | The repo's checks and CI results on the head commit, as you saw them. |

At every level, `untested` is a valid result. Report it. Never report a pass that you did not see. No fence yet

## Handoff note

Save the note with the Write tool in the OS temp folder, outside the repo, at `$TMPDIR/sstack/start-<short-task-name>.md`. To find the folder, run `echo $TMPDIR` as a command of its own. If the output is empty, use `/tmp`. A note there travels to a new worktree or session. Nobody commits it by mistake.

Use this template. It is strict: keep every field name.

```markdown
# Handoff: <one-line task>
Task type: <read-only | docs-only | code change | bug | report from someone else | design question | ship request>
Evidence level: <cite | content | behavior | red-then-green | checks>
Why this type: <one line>
Next command: <command, or "none: ask in this session">
Not built yet: <planned steps that would follow, or "none">
Pointers: <paths, issues, URLs, commits>
Open questions: <list, or "none">
```

Example of a filled note:

```markdown
# Handoff: Retry the upload on a 503 error
Task type: code change
Evidence level: behavior
Why this type: The task changes how the client behaves when the server fails.
Next command: /grill
Not built yet: none
Pointers: issue #412
Open questions: How many retries?
```

- Point to specs, issues, ADRs and diffs by path or URL. Do not copy their content.
- Remove secrets and personal data: API keys, passwords, tokens, names, emails. No fence yet

## Troubleshooting

- Error: the user asks `start` to make the change. Cause: `start` only sorts. Fix: sort the task, name the next command, and tell the user to type it.
- Error: the Write tool fails in `$TMPDIR`. Cause: the folder is not writable. Fix: save the note in `/tmp/sstack/` and give that path.

## Notes

Platform facts that this skill relies on, and open questions, are in [NOTES.md](NOTES.md). When you change this skill or add a skill, read that file.

## Provenance

- `skills/engineering/ask-matt/SKILL.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Took the idea of a typed router and the rule "read a skill's `SKILL.md` before you describe it", reworded. No flow map copied.
- `skills/engineering/ask-matt/PHASE-BOUNDARIES.md`, same repo, license and holder. Copied and adapted into [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md). That file has its own provenance.
- `skills/productivity/handoff/SKILL.md`, same repo, license and holder. Took the note rules, reworded: save in the OS temp folder, point to artifacts and do not copy them, redact secrets, name the next skill. Added our fixed fields (task type, evidence level, next command, not built yet).
- `.agents/invocation.md`, same repo, license and holder. Took the typed and agent-loaded split and the rule that a typed skill never reaches another typed skill, reworded. Added the static list so hidden typed skills are not reported missing.
- `skills/rat-stack-mode/SKILL.md` from ratstack (github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. Ideas only, no text: list planned skills apart from built ones, and end each rule with what holds it. That router credits pstack by Lauren Tan (MIT). We copied nothing from it.
- `AGENTS.md` lines 3-13 from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. Idea only: sort the task by type, and let the type set the proof and the isolation it needs. The table, types and evidence levels are written in our own words. No sentences copied.
- New in this skill: the task types as named here, the evidence levels, the skills block format, and the "not built yet" column.
