# Spec format

The template for [SKILL.md](SKILL.md). The `##` sections and their order are those of the spec template in Matt Pocock's `to-spec`. The `###` sections hold the essentials and the notes that our flow needs.

Fill every section from the agreed plan. Write each section once. If the user said so, write "None" in a section. If the plan is silent on a section that is not essential, write "None" there too. If the plan is silent on an essential section, write "Not agreed. See Open questions." there. Add an open question for it. Write nothing else in that section. In "Testing Decisions", the "Prior art" line can stay. Invent no content. An open question is a missing essential, an item that the plan lists as still open, or a gap that the agent found. Mark a gap that the agent found with `(found by the agent)`.

```markdown
# Spec: <feature>

Status: draft
Agreed in: <"grill summary confirmed by the user on <date>", or "this conversation">

## Problem Statement

The problem that the user faces, from the user's side. Write one short paragraph.

## Solution

The solution, from the user's side, in one or two sentences. This line is optional.

### Who it is for

The people or systems that will use this. Use the words of the glossary.

### In scope

- <what this spec delivers>

### User-visible behavior

1. When <actor> <does something>, <what they see or get>.
2. When <the edge case>, <what happens>.

## User Stories

1. As a <actor>, I want <what>, so that <why>.

## Implementation Decisions

The implementation decisions the user agreed. These are modules to build or change, their interfaces, schema changes, API contracts, and technical choices. Write no source file paths and no code.

- <decision>

## Testing Decisions

The test boundaries that the user accepted in step 5 of SKILL.md. A test boundary is a public interface where a test can watch the behavior without reaching inside. Prefer a boundary that already exists. Prefer the highest boundary that works. Use as few boundaries as possible. One is ideal. A good test checks what a user can observe. A good test never checks how the code works inside.

- <boundary>: <what a test there checks>. <existing | new>

Prior art: <existing tests in the code that look like these, or "None found">

## Out of Scope

- <what the user chose to leave out, and why when they said why>

## Further Notes

### Assumed without asking

- <what was taken as given, and why> (copy from the grill summary, or "None")

### Open questions

- <question>: <why it is open> (or "None"). Every essential that the plan did not settle is a question here. Write it as "<essential>: not agreed yet". Copy each other item that the plan lists as still open. Add each gap that you found and end it with `(found by the agent)`.

### Glossary terms and decision records

- <Term>: <link to the term in GLOSSARY.md>
- <NNNN title>: <link to docs/adr/NNNN-title.md> (<status>)
```

## Essentials and their sections

| Essential | Section |
| --- | --- |
| Problem | `## Problem Statement` |
| Who it is for | `### Who it is for` |
| In scope | `### In scope` |
| User-visible behavior | `### User-visible behavior` |
| Test boundaries | `## Testing Decisions` |
| Out of scope | `## Out of Scope` |

## Earlier specs

An earlier version of this template used other headings. Examples are `## Problem`, `## Scope` with `### In` and `### Out`, `## Test boundaries` and `## Decisions`. The notes were `##` sections. `spec-lint.mjs` accepts a spec in that form too. Write a new spec in the form above. Held by: skills/spec/scripts/spec-lint.mjs

## Writing rules

- Every line comes from the plan. Each statement traces to something the user said or confirmed, or to a file you read. A statement that the user never made is a defect. Matt Pocock's docs put it this way: "You remember making every decision in it. It invented nothing to fill a section."
- Write short user stories. A story says who wants what and why. Write one story for each kind of user and each main goal in the plan. If the user gave no reason, leave out "so that". Do not pad the list. Matt's `to-spec` asked for an "extremely extensive" list, and users report that it adds stories nobody asked for. For a refactor or a change to an interface, skip the stories. Write "None" and use the decisions instead.
- Write each behavior as a numbered "When ..." line. Write one line for each behavior the user will see, including the edge cases that were discussed. A story says who and why. A behavior line says exactly what happens. Do not repeat one in the other.
- Write no source file paths and no code. They go stale fast. One exception: a prototype can produce a snippet that states a decision more exactly than prose. Examples are a state machine, a reducer, a schema or a type shape. Put the snippet inside its decision and say that it came from a prototype. Keep only the parts that carry the decision.
- Link what you used. List each glossary term and each decision record that the spec relies on. In a local spec at `.scratch/<feature>/spec.md`, use relative links such as `../../GLOSSARY.md` and `../../docs/adr/0003-title.md`. In a GitHub or GitLab issue, write the repo path in a code span. Relative links do not resolve in an issue body.
- Use the words of the project. Use the terms in `GLOSSARY.md`. Use no product-management boilerplate.

## Provenance

Adapted from the `<spec-template>` in `skills/engineering/to-spec/SKILL.md` of [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). Kept: his seven `##` sections with his names and in his order (Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes), the short description of each in our words, the prior art line, the "no file paths or code" rule with the prototype exception (close to his wording), and his rules for test boundaries (prefer existing, highest, fewest, one is ideal). Changed: "Solution" holds three `###` essentials (who it is for, in scope, and numbered behavior lines). "Further Notes" holds "Assumed without asking", "Open questions" and the glossary and decision record links, which match our grill summary and the rule that the skill asks nothing new. The long user story list became a short one. Added the status line, the "Agreed in" line, and the "Not agreed" rule for an essential. An earlier version of this file replaced his section names with our own. The owner did not ask for that, and his names are back. The lint still accepts specs in that earlier form. The quoted line, the user story complaint and the refactor limit come from `docs/engineering/to-spec.md` in the same repo.
