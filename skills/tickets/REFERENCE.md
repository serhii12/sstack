# Tickets reference

Background for [SKILL.md](SKILL.md). Read it in three cases. A breakdown goes wrong. The spec is a wide refactor. You must explain a rule to the user.

## Why tickets are cut too fine

Matt Pocock's docs for `to-tickets` name over-decomposition as the most reported problem: "It produced twelve tickets for a three-line change." His docs say that the model defaults to atomic units. It loses the grouping that makes them meaningful. His fix is the quiz step, where the user asks for merges. We add a merge rule, so the first breakdown is already small. There is no cap on the number of tickets.

- A spec is worth writing when the work spans several sessions. A long breakdown can mean that the spec holds two features or that the tickets are cut too fine.
- One ticket is a valid result. If the whole spec fits in one context window, make one ticket. The user can also skip tickets and build from the spec.

## Tests that cannot fail

His docs report acceptance criteria that "graded nothing". Some of them passed before any work was done. Three shapes recur:

- a check that is already true at the starting commit
- a check that only another ticket's work can make pass
- a check that restates the request instead of naming something to observe

If all checks of a ticket have one of these faults, the ticket cannot be tested alone. Merge it into the ticket that it depends on. For each check, name the observation that shows the check false.

## Thin working pieces and layers

A horizontal slice ships one layer of the change, such as all the schema. Nothing works until every layer lands. Its checks reach into work that another ticket owns. A vertical slice, the thin working piece, ships one narrow path through all the layers, so the user can check it alone. His docs report a team that sliced a 26-ticket stack by layer. They needed about twenty agent runs for each closed ticket, mostly rework.

Ask of each ticket: "what can I demo or check when this is done?" A horizontal slice has no answer. Or the answer names a layer.

## Wide refactors

Wide refactors are the exception to vertical slicing. A wide refactor is one mechanical change (rename a column, retype a shared symbol). Its blast radius fans across the whole codebase. A single edit breaks thousands of call sites at once, so no vertical slice can land green. Do not force it into a thin working piece. Sequence it as expand and contract:

1. Expand: add the new form beside the old, so nothing breaks.
2. Migrate: move the call sites over in batches sized by blast radius (per package, per directory). Each batch is its own ticket, blocked by the expand. CI stays green after each batch, because the old form still exists.
3. Contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch.

If even the batches cannot stay green alone, keep the sequence and let the batches share an integration branch. All of them block a final integrate-and-check ticket. Only that ticket promises green.

A wide refactor can need many tickets. Each batch is still one ticket.

## Known ways it goes wrong

| Sign | Likely cause | What to do |
| --- | --- | --- |
| Many tiny tickets | The model split by unit of code. | Apply the merge rule before you show the breakdown. |
| One ticket per layer | Horizontal slicing. | Ask the demo question for each ticket. Recut. |
| On GitHub, tickets are not sub-issues of the spec | The publish step skipped the parent link. | Use `--parent <spec>` from the tracker doc. |
| "Blocked by" is body text on GitHub | The agent assumed that GitHub has no native blocking. It has native blocking: `gh issue create --blocked-by 12,15`. | Use native links. Use the body line only as the fallback. |
| The spec text from the tracker is cut off | A long spec does not come back in full. | Run `/tickets` in the same session as `/spec`. |
| A ticket that it blocks stays blocked after the build | The work of the blocker is not in `origin/main` yet. | On GitHub or GitLab, the merge of the pull request closes the issue. For a local ticket, `/build` sets `Status: closed` and writes a `Built on branch` line. `ticket-ready.mjs` waits until that commit is in `origin/main`. Merge the branch first. |
| The spec is out of date when the tickets start | The spec is a snapshot. The code or the plan changed. | Name the clash in the breakdown. The user can type `/grill` to settle it. Do not edit the spec to follow the code. |

## It is working if

- Every ticket answers "what can I demo or check when this is done?" with a behavior.
- The breakdown is numbered, with a `Blocked by` line on each ticket, before anything is published.
- The first ticket has no blockers.
- Prefactoring tickets, if any, are first in the order.
- No ticket body holds a source file path or a line number.

## A check for a restructure ticket

A restructure changes no behavior, so a plain behavior test passes before and after the work. Each check of the ticket must still fail before the work. Use one of three kinds:

- A test at the new interface. It fails because the interface does not exist yet.
- A dependency rule that fails today, such as "no import of `orders/price` from outside `orders/`".
- A count of the old form that reaches zero, such as the number of callers that import the old module.

`code-craft/RESTRUCTURE.md` has the same list and the order of the work.

The sources for this file are in the Provenance section of [SKILL.md](SKILL.md).
