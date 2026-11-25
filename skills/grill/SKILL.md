---
name: grill
description: Interview the user in rounds about a plan, design, decision or idea until you share one understanding, then get a written summary confirmed. Use when the user wants to stress-test their thinking, says "grill me" or "grill this", or when a plan has open decisions to settle before work starts. The user can also type /grill.
---

# Grill

Interview the user until you both share one understanding of the subject. You look up the facts. The user makes the decisions. The grill ends only when the user confirms a written summary.

The subject can be a feature, a design, a business call or a piece of writing. It does not need a repo.

## The design tree and the frontier

Map the subject as a **design tree**: each decision branches into the decisions that hang off it.

The **frontier** is every open decision whose prerequisites are already settled. These are the questions you can ask now without guessing at answers you have not heard yet. If a question depends on another question that is still open, it belongs to a later round.

## Rounds

Work the tree in **rounds**. A round is one message that asks questions from the frontier. Then wait for the user's answers before you start the next round.

Start each round with a status line, then number the questions:

```
Round 2 of 6. 5 questions.

**Q1. <short title>**
<The question. It can run to several paragraphs and list choices.>
Recommended: <your answer>

---

**Q2. <short title>**
<The question.>
Recommended: <your answer>
```

Word each question so "yes" accepts your recommended answer. Before you send a round, read each question again. If "yes" would reject your recommendation, reword the question.
No fence yet

After each round, work out the frontier again. Answers settle decisions and open up the questions that hung off them. If an answer changes a decision from an earlier round, reopen that branch in the next round.

## Caps

- **At most 8 questions per round.** If the frontier holds more, ask the 8 that unblock the most other decisions. Carry the rest to the next round.
- **At most 6 rounds.** When round 6 is answered and decisions are still open, stop asking. Post the summary with the open decisions under "Still open". End it with one extra line: "Say 'keep going' to lift the cap, or 'split' to grill the open parts one at a time."

The user can lift or change either cap at any time, for example "keep going", "10 rounds" or "one question at a time". Use the new numbers from then on and show them in the status line.
No fence yet

[REFERENCE.md](REFERENCE.md) says how we chose these numbers.

## Facts are yours, decisions are the user's

Do not ask the user for a fact you can look up in the code, the files, the docs or with a tool. If you can start a subagent, give it a fresh context window and the one fact to find. If you cannot, look it up yourself. Do not hold the round for the lookup. Only the questions that need that fact wait. Ask the rest of the frontier now.
No fence yet

Put each decision to the user and wait for the answer. Never answer your own decision questions. This also holds when another skill or a ticket asked you to run the grill.
No fence yet

"I don't know" is a real answer. Record that decision as open. Some questions cannot be settled by talk, such as how a screen should feel. Say so, suggest a quick throwaway prototype, and record the question as open.
No fence yet

## New terms and hard-to-undo decisions

When you work in a project repo, call the Skill tool with "domain-memory" the first time one of these comes up:

- the user uses a project term that is new, vague, or clashes with `GLOSSARY.md`
- a decision looks hard to undo later

In your next message, say "Loaded domain-memory." If it will not load, tell the user and keep grilling. List the terms and decisions in the summary so nothing is lost.
No fence yet

With no project repo, or when the subject is not software, write no files. Keep the terms and decisions in the summary.
No fence yet

## The confirm step

A grill can stop in four ways: the frontier is empty, the round cap is reached, the user asks to wrap up, or another skill or task wants you to move on. Each one ends the same way. Post this summary and stop:

```
## Grill summary: <subject>
Status: WAITING FOR YOUR CONFIRMATION

### Decided
1. <decision>: <the answer, with exact numbers, orderings and "must not" rules as the user gave them>

### Assumed without asking
- <what you took as given, and why> (or "None")

### Still open
- <decision>: <why it is open> (or "None")

### Written to files
- <glossary terms added or changed, decision records and their status> (or "None")

Reply "confirm" to accept this summary, or tell me what to change.
```

- Put the summary last in its message. Ask no new questions and do no other work in that message. The one extra line allowed is the cap offer above.
- Only a clear yes counts, such as "confirm", "yes" or "looks right". Silence does not count. An answer to some other question does not count. A request from another skill does not count.
- If the user changes anything, update the summary and post it again with the same status line.
- Until the user confirms, do not edit code, write a spec or plan, or start other work. The only files you may change are the glossary and decision records, through domain-memory.
- If you notice that you are about to act without a confirmed summary, stop and post the summary.
No fence yet

After the user confirms:

1. Reply with `Status: CONFIRMED by the user` and the summary title.
2. Change each `proposed` decision record from this grill to `accepted`, as domain-memory says.
3. Say what you would do next, and wait. If a workflow started this grill, go back to it. Keep this conversation, because the next step needs what was said here.

## Provenance

All sources are from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock.

- `skills/productivity/grilling/SKILL.md`: the base of this skill. We kept the design tree, frontier, rounds, recommended answers, "yes" accepts, facts by a fresh subagent, decisions to the user, and no action before confirmation. We rewrote it in plain English. Changes: plain question markers in place of emoji, a self-check on the "yes" wording, a round status line, caps on questions and rounds (Matt declines caps on purpose in `.out-of-scope/question-limits.md`), a fixed summary and confirm step, a fallback when no subagent exists, and Held by / No fence yet lines.
- `skills/productivity/grill-me/SKILL.md`: a one-line wrapper. We kept its idea that a grill needs no repo and writes no files. We dropped the wrapper, because `/grill` can be typed directly.
- `skills/engineering/grill-with-docs/SKILL.md`: a one-line wrapper that loads grilling and domain-modeling. We kept the idea of writing the glossary and decision records during the grill. Here it happens by loading `domain-memory` when a trigger comes up.
- `docs/productivity/grilling.md`, `docs/productivity/grill-me.md`, `docs/engineering/grill-with-docs.md`: mostly ideas in our words, with a few sentences in REFERENCE.md close to his wording. These are the "I don't know" answer, prototypes for questions talk cannot settle, the cap numbers, and the known failures.
- Removed: `agents/openai.yaml`, the wrapper skills, links to Matt's other skills, and his `CLAUDE.md` opt-out text.
