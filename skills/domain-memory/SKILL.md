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
- Add a `## Revisit if` section with the concrete conditions that change the answer.
- Write half a page at most.
- To change a decision, write a new record. Then set the status of the old record to `superseded by NNNN`. Change nothing else in the old record. NNNN must name a record that exists.
No fence yet (planned: scripts/adr-lint.mjs)

During a grill, write new records as `proposed`. When the user confirms the grill summary, change them to `accepted`. When the user states a decision as final outside a grill, write it as `accepted`.
No fence yet

## Provenance

- `skills/engineering/domain-modeling/SKILL.md` from [mattpocock/skills](https://github.com/mattpocock/skills), MIT license, Copyright (c) 2026 Matt Pocock. The base of this skill. We kept the file layout and lazy file creation. We kept the four moves during the talk and glossary updates at once. We kept no code detail in the glossary and the three-test rule for records. We rewrote it in plain English and renamed it. We changed these parts. Records are written only after the user agrees. Each glossary change is shown to the user. His "conflicts with the existing language" now names a word on an `_Avoid_` line, and the agent asks before it changes an existing term. A live run changed such a term with no question. We added placeholder handling for the starter glossary, the status rules and the `proposed` to `accepted` step, and Held by / No fence yet lines.
- `skills/engineering/domain-modeling/ADR-FORMAT.md` and `GLOSSARY-FORMAT.md`, same repo, license and holder. Adapted into the sibling files of the same names. Each file says what changed.
- `skills/autopilot/references/templates.md` lines 177-199 (the decision record template and its index rules) from [kentcdodds/kcd-skills](https://github.com/kentcdodds/kcd-skills), MIT license, Copyright (c) 2026 Kent C. Dodds. We took the `NNNN:` title, the Date line, the "Revisit if" section, "phrase the decision as what not to do", half a page, supersede instead of editing, and the number-clash warning. We changed the status line from plain `Status:` to `**Status:**`. The reason is that the checker of kcd (`skills/visual-recap/scripts/primitives-map.mjs`) reads only the bold form or a heading. We dropped the per-primitive `adrs` list, which belongs to Kent's setup.
- `docs/engineering/domain-modeling.md` from mattpocock/skills, same license and holder. Ideas in our words: "show the user each glossary change" and the guard against glossary bloat. Two sentences on splitting a glossary in GLOSSARY-FORMAT.md stay close to his wording.
- Removed: `agents/openai.yaml` and the links to Matt's other skills.
- Later change: the three tests moved to the start of the record rules, with a line in `## Important`. Matt's tests decide when the agent offers a record. A later version also refused a record that the user asked for. The owner did not ask for that refusal. Now the agent pushes back once, and the user decides.
