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

- Be opinionated. When several words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- Keep definitions tight. Write one or two sentences at most. Say what the thing is. Leave out what it does.
- Bold other glossary terms inside a definition. When a definition mentions another term, write it as `**Order**`. Let the sentence around it say how the two terms relate.
- Include only terms specific to the context of this project. General programming concepts (timeouts, error types, utility patterns) do not belong, even if the project uses them often. Before you add a term, ask whether this concept is unique to this context or is a general programming concept. Only the first kind belongs.
- Write no code detail. Write no file names, function names, types, tables, settings or implementation choices. Those belong in the code, a spec or a decision record.
- When natural clusters of terms form, group the terms under subheadings. If all terms belong to one area, a flat list is fine.
- Keep it short. A long glossary usually holds detail that never belonged there. When the user asks you to clean it up, cut that detail first. Then consider whether to split the file.

## The starter file

A project can start with the starter `GLOSSARY.md` of the stack, which holds only placeholders in angle brackets. Treat that file as empty. When the first term is settled, replace the placeholders with the real context name, description and term.

## Single and multi-context repos

Single context (most repos): one `GLOSSARY.md` at the repo root.

Multiple contexts: a `GLOSSARY-MAP.md` at the repo root lists the contexts, where each context lives, and how the contexts relate to each other:

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

Find which structure applies:

- If `GLOSSARY-MAP.md` exists, read it to find the contexts.
- If only a root `GLOSSARY.md` exists, there is one context.
- If neither exists, create a root `GLOSSARY.md` when the first term is settled.

When there are several contexts, find the context that the current topic belongs to. If that is unclear, ask.

If the file is already lean and still covers two areas that a reader does not want to hold at once, split it. If you split a bloated file, you get several bloated files.

## Provenance

Adapted from `skills/engineering/domain-modeling/GLOSSARY-FORMAT.md` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). The structure, the example and most rules are Matt's text with small edits (semicolons removed, wording simplified). Our own parts are the "No code detail" and "Keep it short" rules and the starter file section. The sentence on when to split is close to Matt's wording in `docs/engineering/domain-modeling.md` (same repo, license and holder).
