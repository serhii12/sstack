---
name: domain-memory
description: Keep a project's GLOSSARY.md and decision records (docs/adr/NNNN-title.md) current while a plan is discussed. Use during a grill or design talk when a project term is settled, when a term is vague or clashes with GLOSSARY.md, or when a decision is hard to reverse. Also use when the user asks to add or fix a glossary term, or to write or supersede a decision record.
---

# Domain memory

This skill keeps two kinds of project memory current while you talk with the user:

- `GLOSSARY.md`: the project's own words, each with a short definition.
- Decision records in `docs/adr/`: one file for each decision that is hard to reverse. ADR means architecture decision record.

To only read `GLOSSARY.md` and use its words, you do not need this skill. Load it when you are about to change the words or record a decision.

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

If `GLOSSARY-MAP.md` exists at the root, the repo has several contexts, each with its own `GLOSSARY.md` and `docs/adr/`. A `docs/adr/` at the root holds decisions that span contexts. [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md) explains the map.

Create a file only when you first have something to write in it. Create `GLOSSARY.md` when the first term is settled. Create `docs/adr/` when the first record is needed. If `GLOSSARY.md` holds only the starter placeholders, replace them with the first real term.
No fence yet

## During the talk

### Challenge clashing terms at once

When the user uses a term that clashes with `GLOSSARY.md`, say so at once. "The glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
No fence yet

### Sharpen vague words

When the user uses a vague or overloaded word, propose one precise term. "You said 'account'. Do you mean the Customer or the User? Those are different things."

### Test with concrete scenarios

When the talk is about how concepts relate, invent specific scenarios that probe the edge cases. Make the user say exactly where one concept ends and the next begins.

### Check the code

When the user says how something works, check whether the code agrees. If it does not, say so: "Your code cancels whole Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md at once

When a term is settled, write it to `GLOSSARY.md` right away. Do not save terms up for the end. Use the format in [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md). In your next message, show the user each change in one line, so they can correct it.
No fence yet

`GLOSSARY.md` holds no code detail: no file names, function names, types, tables, settings or implementation choices. It is not a spec, a scratch pad or a log of decisions. It is a glossary only. If an entry needs more than two sentences, the extra text belongs somewhere else.
No fence yet

### Write a decision record only when it earns one

Offer a record only when all three are true:

1. **Hard to reverse.** Changing your mind later has a real cost.
2. **Surprising without context.** A future reader will ask "why did they do it this way?"
3. **A real trade-off.** There were real alternatives, and you picked one for specific reasons.

If any one is missing, write no record, and tell the user which test failed. Most grills produce no records. Write a record only after the user agrees to it.
No fence yet

## Decision record rules

Use [ADR-FORMAT.md](ADR-FORMAT.md). If the project has `docs/adr/0000-template.md`, follow it. In short:

- File name: `docs/adr/NNNN-short-title.md`. Take the highest number in `docs/adr/` and add one. `0000` is the template.
- One status line, in exactly one of these forms: `**Status:** accepted`, `**Status:** superseded by NNNN` or `**Status:** proposed`. Use no other status format.
- A `## Revisit if` section with the concrete conditions that would change the answer.
- Half a page at most.
- To change a decision, write a new record and set the old one's status to `superseded by NNNN`. Change nothing else in the old record. NNNN must name a record that exists.
No fence yet (planned: scripts/adr-lint.mjs)

During a grill, write new records as `proposed`. When the user confirms the grill summary, change them to `accepted`. When the user states a decision as final outside a grill, write it as `accepted`.
No fence yet

## Provenance

- `skills/engineering/domain-modeling/SKILL.md` from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. The base of this skill. We kept the file layout, lazy file creation, the four moves during the talk, glossary updates at once, no code detail in the glossary, and the three-test rule for records. We rewrote it in plain English and renamed it. Changes: records are written only after the user agrees, each glossary change is shown to the user, placeholder handling for the starter glossary, the status rules and `proposed` to `accepted` step, and Held by / No fence yet lines.
- `skills/engineering/domain-modeling/ADR-FORMAT.md` and `GLOSSARY-FORMAT.md`, same repo, licence and holder. Adapted into the sibling files of the same names. Each file says what changed.
- `skills/autopilot/references/templates.md` lines 177-199 (the decision record template and its index rules) from [kentcdodds/kcd-skills](https://github.com/kentcdodds/kcd-skills), MIT licence, Copyright (c) 2026 Kent C. Dodds. We took the `NNNN:` title, the Date line, the "Revisit if" section, "phrase the decision as what not to do", half a page, supersede instead of editing, and the number-clash warning. We changed the status line from plain `Status:` to `**Status:**`, because kcd's own checker (`skills/visual-recap/scripts/primitives-map.mjs`) reads only the bold form or a heading. We dropped the per-primitive `adrs` list, which belongs to Kent's setup.
- `docs/engineering/domain-modeling.md` from mattpocock/skills, same licence and holder. Ideas in our words: "show the user each glossary change" and the guard against glossary bloat. Two sentences on splitting a glossary in GLOSSARY-FORMAT.md stay close to his wording.
- Removed: `agents/openai.yaml` and the links to Matt's other skills.
