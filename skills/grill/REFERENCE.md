# Grill reference

Background for [SKILL.md](SKILL.md). Read it when you need to explain a rule to the user, or when a grill goes wrong.

## Why there are caps

Matt Pocock's grilling skill has no cap, on purpose. His reasons: some plans need three questions and some need fifty, and a fixed ceiling cuts off the hard case. We add caps anyway:

- Users of his skill report runs of about 200 questions.
- A long session fills the context window, and the questions get worse.
- A cap forces a written summary at a known point, so the user sees where things stand.

A cap is a checkpoint. When the grill hits one, the user picks what happens next: lift the cap, or split the subject and grill each part. Very long grills usually mean the subject is too big for one session.

## How we chose the numbers

Matt's docs give two data points. A typical session is 13 questions in about 3 rounds. A session of 46 questions in 4 rounds is ordinary.

- **8 questions per round** keeps a round short enough to read and to answer by number.
- **6 rounds** at 8 questions gives 48 questions, which covers the ordinary case.

These are first guesses. Change them when real sessions show they are wrong.

## Answering a round

The user can answer a whole round by number: "1 yes, 2 the second option, 3 no, because the API is public."

If the user wants one question at a time, set the per-round cap to 1. Ask whether to raise the round cap too, because 6 rounds of 1 question is only 6 questions.

## The user owns the scope

The grill asks the questions, but the user steers. Tell the user this if they accept every recommendation without comment. A grill where the user never pushes back produces the agent's plan with the user's approval stamp. Good signs are the user saying "I don't know", saying the scope is drifting, or asking for more detail on a question.

The opposite error is rarer: grilling so long that work never starts. The caps guard against it.

## Known ways it goes wrong

| Sign | Likely cause | What to do |
|---|---|---|
| Every question at once, with no recommendations | The skill did not load. The agent is making up an interview. | Ask the agent whether it loaded `grill`. |
| The agent starts building after the last round | It skipped the confirm step. This happens most on weaker or faster models. | Point at the confirm step. A line in the project's `AGENTS.md` such as "Do not implement without permission" also helps. |
| The agent answers its own decision questions | Often happens when another skill ran the grill as a step and the agent took that as permission to keep going. | Remind it that decisions are the user's. |
| A glossary term was settled but `GLOSSARY.md` did not change | `domain-memory` did not load. A skill that names another skill does not always cause it to load. | Look for the "Loaded domain-memory." line. If it is missing, ask the agent to load it. |
| "Yes" would reject the recommendation | The question was worded against the recommended answer. | Answer the recommendation and say so. |
| Two questions in one round depend on each other | The agent picks the frontier by judgement. Nothing computes it. | Tell the agent. It reopens that branch in the next round. |
| Exact answers get softer in later steps | Most decisions live only in the conversation. | The summary keeps exact numbers, orderings and "must not" rules. Keep the conversation for the next step. |

## It is working if

- Each round arrives as a numbered list with a status line, and each question has a "Recommended:" line.
- Nothing in a round needs another question in the same round answered first.
- Later rounds ask things the first round could not have asked.
- The agent looks facts up instead of asking for them, and lookups do not stall the round.
- The grill ends with the summary and waits for "confirm".

Sources for this file are listed under Provenance in [SKILL.md](SKILL.md).
