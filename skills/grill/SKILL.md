---
name: grill
description: Interviews the user about a plan, design, decision or idea until the open decisions are settled. Use when the user says "grill me" or "grill this". If the user gives answers up front, says to skip the questions, or says to implement now, use it too. Use it also to stress-test a plan, or to settle open decisions before work starts. The user can also type /grill. Do NOT use for a choice between known options. Use decide for that.
---

# Grill

## Important

Make your lookups and skill calls in silence. Start each round with its status line. Put notes after it. Only the line "Loaded domain-memory." can come before the status line.

Interview the user until you both share one understanding of the subject. You find the facts. The user makes the decisions. The grill ends only when the user confirms a written summary.

There is no limit on the number of questions. There is no limit on the number of rounds. The user decides when the questions are enough.

The user can end the questions at any time, for example with "enough", "stop", "that is enough" or "write it up".
When the user ends the questions, stop asking. Post the summary. Put each decision that is still open under "Still open".
While the frontier holds decisions, do not end the questions yourself.
During a grill, write no code and edit no files. Only domain-memory can change the glossary and decision records.
No fence yet

The subject can be a feature, a design, a business call or a piece of writing. It does not need a repo.

## Before round 1

If the grill runs in a project repo, call the Skill tool with "domain-memory" before round 1.
Then write the line "Loaded domain-memory." just before or just after the round 1 status line. If the questions end before round 1, put the line before the summary.
A project repo is a git repo, or a folder with `GLOSSARY.md` or `docs/adr/`.
If the skill does not load, tell the user and keep grilling. List the terms and decisions in the summary so that nothing is lost.
If the grill runs outside a project repo, do not load the skill. Write no files. Keep the terms and decisions in the summary.
No fence yet

## The design tree and the frontier

Map the subject as a "design tree". Each decision branches into the decisions that follow from it.

The "frontier" is every open decision whose prerequisites are already settled. You can ask these questions now without guessing answers that the user will give later.

Ask the whole frontier in each round. Ask one question for each decision on the frontier.
If a question depends on another question that is still open, ask it in a later round.
Ask only about open decisions. Do not ask again about a decision that the user already made.
The grill is done when the frontier is empty. Then you visited every branch of the design tree and assumed nothing silently. Go to the confirm step.
No fence yet

## Essentials for a spec

If the subject is a feature or a change that will get a spec, the frontier must also hold these essentials. The next skill, `spec`, reads this conversation and cannot invent them:

- The problem, who it is for, and what is in and out of scope.
- What the user will see, with the edge cases.
- Where tests will observe the behavior.

Ask only for the essentials that are still open. Look up what the code can answer, such as existing interfaces and tests. Then recommend an answer from what you found. If the test question needs a design answer of this round, ask it in the next round. A change that fits in one session, a pure decision and a naming question need no spec. Skip this list for those. Their open decisions stay on the frontier.
No fence yet

## Rounds

Work the tree in "rounds". A round is one message that asks every question on the frontier. Then wait for the user's answers before you start the next round.

Start each round with a status line. Then number the questions:

```
Round 2. 5 questions.

**Q1. <short title>**
<The question. It can run to several paragraphs and list choices.>
Recommended: <the answer itself>

---

**Q2. <short title>**
<The question.>
Recommended: <the answer itself>
```

Give a recommended answer for each question. The user can reply "yes" to accept it.
Write the answer itself on the Recommended line, such as "(b) Keep old prices until renewal." Write "Yes" or "No" there only for a yes/no question.
Keep the label `Recommended:` exactly. If the answer is a guess, end the answer with `(a guess)`.
Before you send a round, read each question again. If "yes" rejects your recommendation, reword the question.
If the user rejects your recommendation on every other question of this round, each question must still make sense. If a question then makes no sense, move it to the next round.
If domain-memory changed a file, show each change in one line after the last question.
No fence yet

After each round, find the frontier again. Answers settle decisions. Then the questions that follow from those decisions join the frontier. If an answer changes a decision from an earlier round, reopen that branch in the next round.
No fence yet

The user can answer by number, or ask for one question at a time. To see why there is no limit, or if a grill goes wrong, read [REFERENCE.md](REFERENCE.md).

## Facts are yours, decisions are the user's

Do not ask the user for a fact that you can find in the code, files, docs or tools. If you can start a subagent, give it a fresh context window and the one fact to find. If you cannot, find the fact yourself. Do not hold the round for the lookup. Only the questions that need that fact wait. Ask the rest of the frontier now.
If you cannot find a fact, ask the user for it. Put your best guess on the Recommended line.
No fence yet

Ask the user each decision question. Then wait for the answer. Do not answer your own decision questions. This rule also applies when another skill or a ticket asked you to run the grill.
No fence yet

If the user answers "I don't know", record that decision as open. That is a real answer. Talk cannot settle some questions, such as how a screen feels. In that case, say so. Suggest a quick throwaway prototype. The user can type `/prototype` for it. Record the question as open.
No fence yet

## The confirm step

The questions end in two ways: the frontier is empty, or the user ends them. No other skill or task can end them.
Then post this summary and stop:

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

- Put the summary last in its message. Ask no new questions and do no other work in that message.
- Only a clear yes counts, such as "confirm", "yes" or "looks right". Silence does not count. An answer to some other question does not count. A request from another skill does not count.
- If the user changes anything, update the summary. Then post it again with the same status line.
- Until the user confirms, do not edit code, write a spec or plan, or start other work. The only files that you can change are the glossary and decision records, through domain-memory.
- If you are about to act without a confirmed summary, stop. Post the summary.
No fence yet

After the user confirms, do these steps:

1. Reply with `Status: CONFIRMED by the user` and the summary title.
2. Change each `proposed` decision record from this grill to `accepted`, as domain-memory says.
3. Say what you propose to do next. Then wait. If a workflow started this grill, return to that workflow. Keep this conversation. The next step needs what you both said here.
No fence yet
