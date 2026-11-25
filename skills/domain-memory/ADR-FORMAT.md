# Decision record format

Decision records (ADRs) live in `docs/adr/`. Each file is `NNNN-short-title.md`, numbered in order: `0001-short-title.md`, `0002-short-title.md`, and so on. Number `0000` is kept for the template. Create `docs/adr/` only when the first record is needed.

## Template

```md
# NNNN: <Short title of the decision>

**Status:** proposed
**Date:** YYYY-MM-DD

<One to three sentences: the context, what we decided, and why.>

## Revisit if

<Concrete conditions that would change the answer.>
```

That is all most records need. A record can be one paragraph plus the Revisit if section. The value is in recording that a decision was made, and why. Extra sections add nothing unless they carry real content. Keep each record to half a page.

Where it helps, phrase the decision as what not to do: "Do not add an ORM. We write SQL by hand because ...". A written "no" stops the next person from "fixing" something that was deliberate.

## Status

Every record has one status line with a bold label. Use exactly one of these:

| Line | Meaning |
|---|---|
| `**Status:** proposed` | Written during a grill. The user has not yet confirmed the grill summary. |
| `**Status:** accepted` | The decision is in force. |
| `**Status:** superseded by NNNN` | Record NNNN replaces this one. Record NNNN must exist. |

Do not write status as a plain `Status:` line, a `## Status` heading or frontmatter. A tool that reads status looks for the one form above and misses the others. To retire a decision with no replacement, write a short new record that says so, and supersede the old one with it.
No fence yet (planned: scripts/adr-lint.mjs)

## Revisit if

Every record has a `## Revisit if` section. List concrete conditions, such as "we pass 10,000 orders a day" or "the partner drops the XML API". Avoid vague ones such as "if needs change".
No fence yet (planned: scripts/adr-lint.mjs)

## Optional sections

Add these only when they add real value. Most records do not need them.

- `## Considered options`: only when the rejected alternatives are worth remembering.
- `## Consequences`: only when effects further down the line are not obvious and need saying.

## Numbering

Scan `docs/adr/` for the highest number and add one. Two agents that work in parallel can pick the same number. Check for a clash before you commit, and renumber your record if there is one.
No fence yet (planned: scripts/adr-lint.mjs)

## Changing a decision

Records are history. Do not rewrite an accepted record. Write a new record, and set the old record's status line to `**Status:** superseded by NNNN`. That line is the only edit to the old record.
No fence yet (planned: scripts/adr-lint.mjs)

## When to offer a record

All three of these must be true:

1. **Hard to reverse.** The cost of changing your mind later is real.
2. **Surprising without context.** A future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off.** There were real alternatives, and you picked one for specific reasons.

If a decision is easy to reverse, skip it: you will just reverse it. If it is not surprising, nobody will wonder why. If there was no real alternative, there is nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Of the libraries, only the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context. Other contexts reference it by ID only." The explicit no's are as valuable as the yes's.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is not obvious.** If you considered GraphQL and picked REST for subtle reasons, record it. Otherwise someone will suggest GraphQL again in six months.
- **Decisions an agent would otherwise propose again.** If an agent keeps suggesting the same change, record why the answer is no.

## Provenance

Adapted from `skills/engineering/domain-modeling/ADR-FORMAT.md` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock) and the decision record template in `skills/autopilot/references/templates.md` lines 177-199 of [kentcdodds/kcd-skills](https://github.com/kentcdodds/kcd-skills) (MIT, Copyright (c) 2026 Kent C. Dodds). The "When to offer" and "What qualifies" sections are Matt's text with small edits. The template merges both sources. The status rules, the `0000` template number and the Revisit if guidance are ours. Matt's optional `deprecated` status is dropped.
