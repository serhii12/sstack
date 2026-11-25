# GLOSSARY.md format

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment for an **Order**, sent to its **Customer** after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places an **Order**.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When several words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences at most. Say what the thing is. Leave out what it does.
- **Bold other glossary terms inside a definition.** When a definition mentions another term, write it as `**Order**`, and let the sentence around it say how the two relate.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) do not belong, even if the project uses them a lot. Before you add a term, ask: is this concept unique to this context, or a general programming concept? Only the first kind belongs.
- **No code detail.** No file names, function names, types, tables, settings or implementation choices. Those belong in the code, a spec or a decision record.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to one area, a flat list is fine.
- **Keep it short.** A long glossary has usually taken in detail that never belonged there. When asked to clean it up, cut that detail before you think about splitting the file.

## The starter file

A project may start with the stack's starter `GLOSSARY.md`, which holds only placeholders in angle brackets. Treat that file as empty. When the first term is settled, replace the placeholders with the real context name, description and term.

## Single and multi-context repos

**Single context (most repos):** One `GLOSSARY.md` at the repo root.

**Multiple contexts:** A `GLOSSARY-MAP.md` at the repo root lists the contexts, where they live, and how they relate to each other:

```md
# Glossary Map

## Contexts

- [Ordering](./src/ordering/GLOSSARY.md): receives and tracks customer orders
- [Billing](./src/billing/GLOSSARY.md): generates invoices and processes payments
- [Fulfillment](./src/fulfillment/GLOSSARY.md): manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events. Fulfillment consumes them to start picking.
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events. Billing consumes them to generate invoices.
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

Work out which structure applies:

- If `GLOSSARY-MAP.md` exists, read it to find the contexts.
- If only a root `GLOSSARY.md` exists, there is one context.
- If neither exists, create a root `GLOSSARY.md` when the first term is settled.

When there are several contexts, work out which one the current topic belongs to. If that is unclear, ask.

Split one glossary into several only when the file is already lean and still covers two areas that a reader would not want to hold at once. Splitting a bloated file gives you several bloated files.

## Provenance

Adapted from `skills/engineering/domain-modeling/GLOSSARY-FORMAT.md` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). The structure, the example and most rules are Matt's text with small edits (semicolons removed, wording simplified). Ours: the "No code detail" and "Keep it short" rules and the starter file section. The two sentences on when to split are close to Matt's wording in `docs/engineering/domain-modeling.md` (same repo, licence and holder).
