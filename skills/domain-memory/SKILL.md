---
name: domain-memory
description: Keeps a project's GLOSSARY.md and decision records (docs/adr/NNNN-title.md) current while the user discusses a plan. In a grill or design talk, use it for a project term that is settled, vague, or in conflict with GLOSSARY.md. Use it also for a decision that is hard to reverse, and for a request to add or fix a glossary term. Also use it to write or supersede an ADR or decision record. Do NOT use for a read-only question about GLOSSARY.md.
---

# Domain memory

This skill keeps two kinds of project memory current while you talk with the user:

- `GLOSSARY.md`: the project's own words, each with a short definition.
- Decision records in `docs/adr/`: one file for each decision that is hard to reverse. ADR means architecture decision record.

## Important

If you only read `GLOSSARY.md` and use its words, you do not need this skill. When you are about to change the words or record a decision, load it.

Before you write a decision record, apply the three tests in [Decision record rules](#decision-record-rules). If one test fails, do not offer a record. If the user asks for one, push back once, then write it if the user asks again.

## Where the files live

Most repos have one glossary and one decision folder:

```
/
├── GLOSSARY.md
└── docs/
    └── adr/
        ├── 0000-template.md
        └── 0001-event-sourced-orders.md
```

If `GLOSSARY-MAP.md` exists at the root, the repo has several contexts. Each context has its own `GLOSSARY.md` and `docs/adr/`. A `docs/adr/` at the root holds decisions that span contexts. To work with the map, read [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md).

If you have nothing to write in a file yet, do not create it. When the first term is settled, create `GLOSSARY.md`. When the first record passes the three tests, create `docs/adr/`. If `GLOSSARY.md` holds only the starter placeholders, replace them with the first real term.
No fence yet

## During the talk

### Challenge clashing terms at once

When the user uses a term that clashes with `GLOSSARY.md`, say so at once. "The glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

A word on an `_Avoid_` line is a clash too. Before you change or remove an existing term or its `_Avoid_` line, ask the user. Write the change after the answer.
Held by: evals/domain-memory/05-avoid-word-clash.md

### Sharpen vague words

When the user uses a vague or overloaded word, propose one precise term. "You said 'account'. Do you mean the Customer or the User? Those are different things."

### Use concrete scenarios

When the talk is about how concepts relate, invent specific scenarios that probe the edge cases. Ask the user to say exactly where one concept ends and the next concept begins.

### Compare with the code

When the user says how something works, compare it with the code. If the code does not agree, say so: "Your code cancels whole Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md at once

When a term is settled, write it to `GLOSSARY.md` right away. Do not collect terms for the end. Use the format in [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md). In your next message, show the user each change in one line, so that the user can correct it.
No fence yet

`GLOSSARY.md` holds no code detail: no file names, function names, types, tables, settings or implementation choices. It holds only terms and definitions. Do not use it as a spec, a scratch pad or a log of decisions. If an entry needs more than two sentences, the extra text belongs somewhere else.
No fence yet

### Offer a decision record only when it passes the three tests

When a decision comes up, apply the three tests in [Decision record rules](#decision-record-rules). If all three pass, offer a record. Most grills produce no records.

## Decision record rules

### Apply the three tests first

Before you write a record, check that all three of these are true:

1. Hard to reverse. Changing your mind later has a real cost.
2. Surprising without context. A future reader will ask "why did they do it this way?"
3. A real trade-off. There were real alternatives, and you picked one for specific reasons.

If one test fails, write no record. Tell the user which test failed.
If the user asks for a record that fails a test, push back once. Name the test that fails. Write no file in that reply. If the user asks again or confirms, write the record. Invent no trade-off to make it pass.
If all three tests pass, write the record after the user agrees. A request from the user for the record is agreement.
No fence yet

### Write the record

Use [ADR-FORMAT.md](ADR-FORMAT.md). If the project has `docs/adr/0000-template.md`, match that template. In short:

- File name: `docs/adr/NNNN-short-title.md`. Take the highest number in `docs/adr/` and add one. `0000` is the template.
- Write one status line, in exactly one of these forms: `**Status:** accepted`, `**Status:** superseded by NNNN` or `**Status:** proposed`. Use no other status format.
- If the user named a condition that changes the answer, add a `## Revisit if` section with it. Otherwise write no such section. Invent no condition.
- Write half a page at most.
- To change a decision, write a new record. Then set the status of the old record to `superseded by NNNN`. Change nothing else in the old record. NNNN must name a record that exists.
No fence yet (planned: skills/domain-memory/scripts/adr-lint.mjs)

During a grill, write new records as `proposed`. When the user confirms the grill summary, change them to `accepted`. When the user states a decision as final outside a grill, write it as `accepted`.
No fence yet
