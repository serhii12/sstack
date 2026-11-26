# Grill reference

Background for [SKILL.md](SKILL.md). When you need to explain a rule to the user, or when a grill goes wrong, read it.

## Why there is no limit

The grill asks the whole frontier in each round. It has no limit on questions or rounds. This is an owner decision, and it follows Matt Pocock's grilling skill. His reasons are these:

- Some plans need three questions and some need fifty. A fixed limit cuts off the hard case, and it feels arbitrary on the easy case.
- The user steers with words. The user can end the questions at any time and accept the current state of the plan.
- A long grill has two causes. If the plan has many open decisions, the grill works as intended. If the questions are redundant or low in value, fix the questions. A counter does not fix them.

A long session fills the context window, and later questions can get worse. The user controls this risk. The user can end the questions, or split the subject and grill each part. Very long grills usually mean that the subject is too big for one session.

## Small changes

A small change usually has a small frontier, so its grill is short. Do not drop decisions to make it shorter. Ask each decision that is open. The rules that keep the grill short are the rules on what not to ask:

- Do not ask again about a decision that the user already made.
- Do not ask the user for a fact that you can look up.

## When the user ends the questions

The user can say "enough", "stop", "that is enough" or "write it up". Then stop asking at once. Post the summary. Put these items under "Still open":

- Each decision that is on the frontier.
- Each branch of the design tree that you did not reach.

Do not ask one last question first. The summary still waits for "confirm".

## Answering a round

The user can answer a whole round by number: "1 yes, 2 the second option, 3 no, because the API is public."

If the user wants one question at a time, ask one question in each round. The request of the user wins over the whole-frontier rule.

## The user owns the scope

The grill asks the questions, but the user steers. If the user accepts every recommendation without comment, tell the user this. A grill where the user never pushes back produces the agent's plan with the user's approval stamp. These are good signs:

- The user says "I don't know".
- The user says that the scope is drifting.
- The user asks for more detail on a question.

The opposite error is a grill so long that work never starts. The user prevents this error. The user ends the questions when they are enough.

## Known ways it goes wrong

| Sign | Likely cause | What to do |
|---|---|---|
| Every question at once, with no recommendations | The skill did not load. The agent invents an interview. | Ask the agent whether it loaded `grill`. |
| The agent posts the summary while the frontier still holds decisions | The agent decided by itself that the questions were enough. | Remind it that only the user ends the questions. |
| The agent asks a few questions and keeps others for later | The agent applied a limit that the skill does not have. | Ask for the whole frontier in one round. |
| The agent starts building after the last round | It skipped the confirm step. This happens most on weaker or faster models. | Show the agent the confirm step. A line in the `AGENTS.md` of the project, such as "Do not implement without permission", also helps. |
| The agent answers its own decision questions | This often happens when another skill ran the grill as a step. The agent took that as permission to continue. | Remind it that decisions are the user's. |
| A glossary term was settled but `GLOSSARY.md` did not change | `domain-memory` did not load. A skill that names another skill does not always cause it to load. | In a project repo, find the line "Loaded domain-memory." next to the round 1 status line. Find the Skill call for `domain-memory` too. If either is missing, ask the agent to load the skill. |
| "Yes" rejects the recommendation | The question was worded against the recommended answer. | Answer the recommendation. Say so. |
| `Recommended: Yes` on a question with choices | The agent read "yes accepts" as a rule for the answer text. | Ask for the choice itself, such as "(b) Keep old prices until renewal". |
| Notes or a plan come before the status line | The agent narrated its lookups. | Remind it that a round starts with its status line. Only "Loaded domain-memory." can come before it. |
| A question needs the answer to another question of the same round, for example "I will fix this when you answer Q2" | The agent picks the frontier by judgment. Nothing computes it. | Tell the agent. It moves that question to the next round. A plain reference, such as "see Q3", is not a fault. |
| A changed label, such as `Recommended (my guess):` | The agent marked a guess in the label. | Ask for the label `Recommended:` exactly, with `(a guess)` at the end of the answer. |
| Exact answers lose precision in later steps | Most decisions exist only in the conversation. | The summary keeps exact numbers, orderings and "must not" rules. Keep the conversation for the next step. |

## It is working if

- In a project repo, the round 1 message shows "Loaded domain-memory." just before or just after the status line.
- Each round arrives as a numbered list with a status line. Each question has a "Recommended:" line that holds the answer itself.
- Each round asks every decision on the frontier.
- Nothing in a round needs another question in the same round answered first.
- Later rounds ask things that the first round cannot ask.
- The agent finds facts and does not ask the user for them. Lookups do not delay the round.
- The grill ends with the summary and waits for "confirm".
