# Decision record format

Decision records (ADRs) live in `docs/adr/`. Each file is `NNNN-short-title.md`, numbered in order: `0001-short-title.md`, `0002-short-title.md`, and so on. Number `0000` is for the template. When the first record passes the three tests below, create `docs/adr/`.

## Before you write a record

All three of these must be true:

1. Hard to reverse. The cost of changing your mind later is real.
2. Surprising without context. A future reader will look at the code and wonder "why on earth did they do it this way?"
3. The result of a real trade-off. There were real alternatives, and you picked one for specific reasons.

If one test fails, write no record. Tell the user which test failed.
If the user asks for a record that fails a test, push back once and name the test. If the user asks again, write the record.

If a decision is easy to reverse, skip it. You will reverse it later. If it is not surprising, nobody will wonder why. If there was no real alternative, there is nothing to record beyond "we did the obvious thing." For examples that pass, read "What qualifies" at the end of this file.
No fence yet

## Template

```md
# NNNN: <Short title of the decision>

**Status:** proposed
**Date:** YYYY-MM-DD

<One to three sentences: the context, what we decided, and why.>
```

That is all most records need. A record can be one paragraph. The value is in recording that a decision was made, and why. Extra sections add nothing unless they carry real content. Keep each record to half a page.

Where it helps, phrase the decision as what not to do: "Do not add an ORM. We write SQL by hand because ...". A written "no" stops the next person from "fixing" something that was deliberate.

## Status

Every record has one status line with a bold label. Use exactly one of these:

| Line | Meaning |
|---|---|
| `**Status:** proposed` | Written during a grill. The grill summary is not confirmed yet. |
| `**Status:** accepted` | The decision is in force. |
| `**Status:** superseded by NNNN` | Record NNNN replaces this one. Record NNNN must exist. |

Do not write status as a plain `Status:` line, a `## Status` heading or frontmatter. A tool that reads the status looks for the one form above and misses the others. To retire a decision with no replacement, write a short new record that says so. Then supersede the old record with the new record.
No fence yet (planned: skills/domain-memory/scripts/adr-lint.mjs)

## Revisit if

The `## Revisit if` section is optional. If the user named a condition that changes the answer, write the section with it. An example is "we pass 10,000 orders a day". Copy the condition of the user. Invent no condition. Matt Pocock's template has no such section.
Held by: evals/domain-memory/03-writes-decision-record.md

## Optional sections

If a section adds no real value, leave it out. Most records do not need these sections.

- `## Considered options`: only when the rejected alternatives are worth remembering.
- `## Consequences`: only when effects further down the line are not obvious and need saying.

## Numbering

Find the highest number in `docs/adr/` and add one. Two agents that work in parallel can pick the same number. Before you commit, make sure that no other record has the same number. If there is a clash, renumber your record.
No fence yet (planned: skills/domain-memory/scripts/adr-lint.mjs)

## Changing a decision

Records are history. Do not rewrite an accepted record. Write a new record. Then set the status line of the old record to `**Status:** superseded by NNNN`. That line is the only edit to the old record.
No fence yet (planned: skills/domain-memory/scripts/adr-lint.mjs)

## What qualifies

- Architectural shape. "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- Integration patterns between contexts. "Ordering and Billing communicate via domain events, not synchronous HTTP."
- Technology choices that carry lock-in. Database, message bus, auth provider, deployment target. Of the libraries, include only the ones that take a quarter to replace.
- Boundary and scope decisions. "Customer data is owned by the Customer context. Other contexts reference it by ID only." The explicit "no" answers are as valuable as the "yes" answers.
- Deliberate deviations from the obvious path. "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader assumes the opposite. These stop the next engineer from "fixing" something that was deliberate.
- Constraints not visible in the code. "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- Rejected alternatives when the rejection is not obvious. If you considered GraphQL and picked REST for subtle reasons, record it. Otherwise someone will suggest GraphQL again in six months.
- Decisions that an agent otherwise proposes again. If an agent suggests the same change again and again, record why the answer is no.
