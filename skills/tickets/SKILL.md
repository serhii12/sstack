---
name: tickets
description: Split one spec into small tickets, each a thin working piece with acceptance checks and named blockers. Shows the breakdown first.
argument-hint: "[spec issue number, URL or path]"
disable-model-invocation: true
---

# Tickets

`tickets` is a typed workflow. It runs only when the user types `/tickets`. It splits one spec into tickets. A ticket is a piece of work that a fresh session can finish alone. Each ticket names the tickets that block it. A blocking ticket must finish before the blocked ticket can start.

Each ticket is a thin working piece (Matt Pocock calls it a tracer bullet). It cuts a narrow path through every layer that the change touches, such as data, logic, interface and tests. When the ticket is done, something works, and the user can check it alone.

## Important

Publish nothing before the user gives a clear yes, such as "approve" or "yes".
No fence yet

## Steps

1. Find the tracker. Read `docs/agents/tracker.md` and use its "Publish tickets" section. If the file is missing, write local files under `.scratch/<feature>/tickets/`. Tell the user they can type `/setup` to choose a tracker.
2. Find the spec. If the user typed a reference after `/tickets` (an issue number, a URL or a path), fetch it. Read its full body and comments. If the user typed no reference, use the spec published in this session. If there is no spec, stop. Tell the user to type `/spec` first.
   No fence yet
3. Read the area. Read `GLOSSARY.md` and the decision records in `docs/adr/` that touch this change. Read enough of the code to see its current state. Use the words of the glossary in every title and description. Look for prefactoring: a change to the existing code that makes the feature easier to add. "Make the change easy, then make the easy change." Put prefactoring tickets first. To judge a prefactoring, call the Skill tool with "code-craft". A merge of shallow modules that the feature needs is a prefactoring ticket. Its acceptance check follows the restructure section of [REFERENCE.md](REFERENCE.md). Do not edit the spec. If the code now clashes with a decision in the spec, name the clash at the top of the breakdown. Then go on. If the spec has no agreed test boundary, name the gap at the top of the breakdown. Then go on. Pick a boundary for each acceptance check and mark it "proposed by the agent". The user can type `/grill` to settle a clash or a gap.
   No fence yet
4. Draft the tickets under the ticket rules and the size rules below.
5. Show the breakdown and ask (format below). Iterate until the user approves it.
6. Publish blockers first, so each ticket can name real blockers. Copy the evidence level of the handoff note in this session to the `Evidence level:` line of each ticket. If there is no note, write `behavior`. Follow `docs/agents/tracker.md`. Use the templates in [TICKET-FORMAT.md](TICKET-FORMAT.md). For local files, use the same `<feature>` folder as the spec. On GitHub or GitLab, make each ticket a sub-issue of the spec. If the tracker doc has native blocking links, use them. Add no label.
   No fence yet
7. Check local tickets. Skip this step for GitHub and GitLab. From the project root, run `node .claude/skills/tickets/scripts/tickets-lint.mjs`. Run it alone and with this relative path, so that a permission rule can match it. It checks every file under `.scratch/*/tickets/`. Fix every problem that it prints. It has no cap on the number of tickets. If the project or the user set a cap, add `--max <n>`. Run it again until it exits 0. Exit code 2 means that the script cannot run. If the script is missing or exits 2, read each file for the same checks. Then say in your report that the lint did not run. Held by: skills/tickets/scripts/tickets-lint.mjs
8. Report. Do not close or edit the spec. Reply with the list of tickets (link or path, title, blockers). Then show the frontier. List the tickets that can start now. For each other ticket, name the tickets that it waits on. Then name the next command. For a ticket on the frontier, type `/build <ticket>` in a fresh session. A ticket with open blockers waits.
   Before the first `/build`, run `git status --short -- GLOSSARY.md docs/`. If it lists files, name each one in the report. Tell the user to commit them and get them into `origin/main` first. `/build` makes every worktree from `origin/main`, so the build and its reviewers read the old glossary and records. Local spec and ticket files under `.scratch/` stay out of git. `/build` reads them from this checkout.

## Ticket rules

- One thin working piece. Ask of each ticket: "what can I demo or check when this is done?". An answer that names a layer shows a horizontal slice. An example is "the schema is in". Recut it. No fence yet
- One context window. A fresh session that has never seen this conversation can finish the ticket. No fence yet
- Acceptance checks that can fail. Each check names what to observe and where. The "where" is a test boundary that the spec agreed and that exists when the ticket is done. Each check fails before the work of the ticket and passes after it. A check that already passes at the start checks nothing. Rewrite it or drop it. No fence yet
- Real blockers only. `Blocked by:` names only tickets that must finish before this ticket can start, or says `None (can start immediately)`. The first ticket has no blockers. No chain of blockers leads from a ticket back to itself. Held by: skills/tickets/scripts/tickets-lint.mjs (local tickets only)
- Shared code. If a ticket cannot be built correctly without the change of another ticket, that is a real blocker. An example is two tickets that must rewrite the same function. Tickets that only touch nearby code stay parallel. The user approves each edge in the breakdown. No fence yet
- No source file paths or code. They go stale. One exception: a snippet from a prototype that states a decision more exactly than prose. Mark it as from the prototype. No fence yet

## Fewer, bigger tickets

Too many tickets is the most reported problem of the skill that we started from. So follow these rules:

- Start from the fewest tickets that keep each ticket inside one context window. One ticket is a valid result.
- Merge what cannot be tested alone. If the checks of a ticket can pass only after the work of another ticket is in, merge the two. Also merge two tickets that always change together.
- Keep apart what can be tested alone. If two pieces can be tested alone and change apart, keep them apart. If a merge makes a ticket too big for one session, undo it.
- There is no cap on the number of tickets. If a breakdown is long, check if the spec holds two features. If it does, say so in the breakdown. The user can split the spec.

No fence yet

Read [REFERENCE.md](REFERENCE.md) for three things: why tickets are cut too fine, how to sequence a wide refactor, and the known ways that this goes wrong.

## Breakdown format

```
Breakdown for <spec title>. 4 tickets.
Gaps: <a clash or a missing test boundary, or "none">

1. <Title>
   Blocked by: None (can start immediately)
   Delivers: <the end-to-end behavior, in one line>
   Checks: <the acceptance checks, short>

2. <Title>
   Blocked by: 1
   Delivers: ...
   Checks: ...

Merged: <tickets you merged and why, or "none">
Is each ticket the right size, or is it too big or too small?
Are the blocking edges right? Does each ticket depend only on tickets that must finish before it can start?
Should any ticket be merged or split?
Reply "approve" to publish, or tell me what to change.
```

## Provenance

All sources are from [mattpocock/skills](https://github.com/mattpocock/skills), MIT license, Copyright (c) 2026 Matt Pocock.

- `skills/engineering/to-tickets/SKILL.md`: the base of this skill. We kept the tracer-bullet rules (complete path through every layer, checkable alone, one fresh context window, prefactoring first), blocking edges, "make the change easy" (verbatim), the quiz step with its questions on size and blockers, publishing blockers first, sub-issues of the source, the frontier, "do not close or modify any parent issue", no file paths with the prototype exception, and the wide-refactor section (in REFERENCE.md, close to verbatim). Changes: renamed to `tickets`, input is one spec only, the merge rule is new, each check must fail before the work, no `ready-for-agent` label, local tickets go to `tickets/` with blockers named by file name, a lint step, a gap line in the breakdown when the code clashes with the spec or the spec has no test boundary, and a breakdown format with a status line. An earlier version had a default cap of 6 tickets. The owner did not ask for it, and it is gone. The lint keeps `--max <n>` as an option for a project. The lint script lives in this skill folder, so the installer ships it to projects. The templates moved to [TICKET-FORMAT.md](TICKET-FORMAT.md), which has its own provenance.
- `docs/engineering/to-tickets.md`: ideas in our words, with a few sentences quoted in REFERENCE.md. Over-decomposition as the top complaint, the demo question, the 26-ticket layer example, sub-issues missed on GitHub, body-text blockers on GitHub, the truncated spec fix, and criteria that grade nothing.
- `skills/engineering/triage/AGENT-BRIEF.md`: ideas only. Describe behavior instead of steps, and each acceptance check is concrete and checkable alone.
- `skills/engineering/triage/SKILL.md`: not used. Triage handles reports from other people, and this skill handles work the user planned.
- Removed: `agents/openai.yaml`, the `/setup-matt-pocock-skills` pointer, the Linear mention, and links to his other skills.
