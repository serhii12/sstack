---
name: start
description: Sort a task by type, record its evidence level in a handoff note, and tell you the next command to type.
argument-hint: "[what you want done]"
disable-model-invocation: true
---

# Start

`start` is a **typed workflow**: it runs only when the user types `/start`. An **agent skill** is one the agent can also load on its own. `start` sorts one task, writes a short handoff note, and tells the user which command to type next. It does no other work.

## Commands that exist today

Name only these commands. The purposes are short labels. Before you describe what a skill does, read its `SKILL.md`. No fence yet

A typed skill is hidden from the agent's own skill list, but it still runs when the user types it. Trust this block and never report a listed skill as missing. No fence yet

This block must list exactly the folders in `skills/`, each with the right type. Held by: scripts/skill-lint.mjs

<!-- skills:begin -->
start | typed | Sort a task by type, record its evidence level, and name the next command
grill | agent | Interview the user with recommended answers until they confirm the plan
domain-memory | agent | Keep GLOSSARY.md and ADRs current and challenge fuzzy terms
decide | agent | List options with effort and undo cost, recommend one, then wait
<!-- skills:end -->

**Not built yet:** `spec`, `tickets`, `build`, `test-craft`, `debug`, `review`, `prove`, `ship`, `pr-body`, `friction`, `retro`, `skill-craft`, `setup`, `security-review`. Mention one only as "not built yet", with what to do by hand in the meantime. Never tell the user to type one. No fence yet

## Steps

1. Read the text the user typed after `/start`. If there is none, ask one question: "What do you want done?"
2. Read the project's `AGENTS.md` if there is one. Its rules apply to every type below.
3. Sort the task into one type from the table. If two types fit, pick the one that needs more proof (bug, then code change, then docs-only, then read-only). If you still cannot tell, ask the user one question. If the user also wants a pull request, sort by the change itself and list `ship` under "Not built yet" in the note.
4. Take the evidence level from the same row.
5. Write the handoff note (format below).
6. Reply to the user with the type, the evidence level, one line on why, the note path, and the next command in a code span. List the steps that would follow as "not built yet" where they are.
7. Name the between-phases option that fits now. Going from `start` to the next command is usually **Continue**. If it is not clear, use the tree in [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md).

## Task types

| Type | How to tell | Evidence level | Next command today | Not built yet |
| --- | --- | --- | --- | --- |
| Read-only question | Explain, review, or investigate. Nothing changes in the repo. | `cite` | None. Ask the question in this session. | |
| Docs-only change | Edits only to docs, comments or text files. | `content` | `/grill` if the change is unclear. Otherwise none: edit by hand on a new branch. | `build`, `ship` |
| Code change | Changes behaviour, config or dependencies. | `behaviour` | `/grill` | `spec`, `tickets`, `build`, `test-craft`, `review`, `prove` |
| Bug | Something works wrong today. | `red-then-green` | `/grill` if the right behaviour is unclear. Otherwise none: reproduce it by hand first. | `debug`, `test-craft` |
| Ship request | The user wants the change delivered: a pull request or a finished change in the repo. | `checks` | None. Follow `AGENTS.md` by hand. | `prove`, `pr-body`, `ship` |

What each type needs:

- **Read-only:** no worktree, branch, commit or PR. If edits follow, the user runs `/start` again for them.
- **Docs-only:** its own worktree and branch, like any change. Run content and link checks. Do not make up runtime proof. The diff must touch only doc files. No fence yet
- **Code change:** its own worktree and branch, the repo's checks, and proof that the changed behaviour works.
- **Bug:** everything a code change needs. Get a command that fails on this bug before you fix anything.
- **Ship request:** only when the user asks for one. A plan, a review or a throwaway experiment is not a ship request.

When the user wants to weigh trade-offs at any point, they can type `/decide`.

## Evidence levels

| Level | What counts as proof |
| --- | --- |
| `cite` | Each claim points to a file and line, an issue, or a commit. |
| `content` | Links resolve. Commands and examples in the docs were run, or are marked untested. |
| `behaviour` | A test or command shows the new behaviour. The output is kept. |
| `red-then-green` | The same command failed before the fix and passes after it. |
| `checks` | The repo's checks and CI results on the head commit, as you saw them. |

At every level, `untested` is a valid result. Report it. Never report a pass you did not see. No fence yet

## Handoff note

Save it with the Write tool in the OS temp folder, outside the repo: `$TMPDIR/agent-stack/start-<short-task-name>.md`. Use `/tmp` when `TMPDIR` is not set. A note there travels to a new worktree or session and never gets committed by mistake.

```markdown
# Handoff: <one-line task>
Task type: <read-only | docs-only | code change | bug | ship request>
Evidence level: <cite | content | behaviour | red-then-green | checks>
Why this type: <one line>
Next command: <command, or "none: ask in this session">
Not built yet: <planned steps that would follow, or "none">
Pointers: <paths, issues, URLs, commits>
Open questions: <list, or "none">
```

- Point to specs, issues, ADRs and diffs by path or URL. Do not copy their content.
- Remove secrets and personal data: API keys, passwords, tokens, names, emails. No fence yet

## Rules

- `start` reads and sorts. It does not edit repo files, create branches, or run commands that change anything. The handoff note is the only file it writes. No fence yet
- `start` never calls another typed workflow. It tells the user the command to type. Docs say Claude Code blocks the agent from running a skill that has `disable-model-invocation: true` unless the user's message names it (confirm in Claude Code). No fence yet

## Notes

- Confirmed in the Claude Code docs (skills page): `disable-model-invocation: true` keeps a skill out of the agent's context and only the user can run it. An agent skill can also be typed as `/name`. Files beside `SKILL.md` load when `SKILL.md` links to them. `argument-hint` shows after the command name.
- Not confirmed: how one skill makes the agent load another skill (confirm in Claude Code). `start` does not rely on it. It only names commands for the user to type.
- Four planned names match Claude Code built-in commands: `debug`, `review`, `ship`, `security-review`. Docs say a user skill named `ship` is not loaded where the built-in `/ship` exists. Rename those before they are built (confirm in Claude Code).

## Provenance

- `skills/engineering/ask-matt/SKILL.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Took the idea of a typed router and the rule "read a skill's `SKILL.md` before you describe it", reworded. No flow map copied.
- `skills/engineering/ask-matt/PHASE-BOUNDARIES.md`, same repo, licence and holder. Copied and adapted into [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md). That file has its own provenance.
- `skills/productivity/handoff/SKILL.md`, same repo, licence and holder. Took the note rules, reworded: save in the OS temp folder, point to artifacts and do not copy them, redact secrets, name the next skill. Added our fixed fields (task type, evidence level, next command, not built yet).
- `.agents/invocation.md`, same repo, licence and holder. Took the typed and agent-loaded split and the rule that a typed skill never reaches another typed skill, reworded. Added the static list so hidden typed skills are not reported missing.
- `skills/rat-stack-mode/SKILL.md` from ratstack (github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. Ideas only, no text: list planned skills apart from built ones, and end each rule with what holds it. That router credits pstack by Lauren Tan (MIT). We copied nothing from it.
- `AGENTS.md` lines 3-13 from rstack (github.com/michaelshimeles/rstack). No licence. Idea only: sort the task by type, and let the type set the proof and the isolation it needs. The table, types and evidence levels are written in our own words. No sentences copied.
- New in this skill: the five task types as named here, the evidence levels, the skills block format, and the "not built yet" column.
