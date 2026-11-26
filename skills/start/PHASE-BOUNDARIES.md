# Phase boundaries

A phase is a chunk of work inside a session, for example the grilling, the implementation or the QA. The definition is fuzzy on purpose. A phase ends when you think that the work on it is done.

The phase boundary is the gap between two phases. It is the only place where this decision belongs. In the middle of a phase there is no decision to make. Continue, or split the work that is left into subagents. If you compact in the middle of a phase, the agent loses the thread.

## The five options

| Option | What it does |
| --- | --- |
| **Continue** | Stay in the session. No context switch at all. |
| **Clear** (`/clear`) | Empty the context window and start from nothing. |
| **Hand off** | Write a handoff note (the format is in [SKILL.md](SKILL.md)) and start a session anywhere from it. |
| **Subagent** | Send the task to its own context window and get a report back. |
| **Compact** (`/compact`) | Compress this context and seed a fresh session with the summary. |

## The tree

Work from top to bottom at the boundary. The first yes wins.

**1. Can you continue in this session?** The answer is yes in two cases. In the first case, the next phase needs this phase as a primary source (the session as it happened). In the second case, enough room is left in the smart zone for the next phase to fit. The smart zone is the part of the context window in which the model still reasons sharply. Matt Pocock puts it at about 150k tokens on current models.

Grilling into implementation is the standard yes. The implementation needs the reasoning word for word, and a summary loses it. Continue costs nothing and loses nothing, so rule it out before anything else.

**2. Is the context irrelevant to what comes next?** Ask if everything in this session (the exploration, the decisions, the dead ends) is disposable. If it is, clear the context. Clear is the cheapest move: it takes no time and gives back the whole window. Clearing is not final. The old session stays resumable.

The cost of a wrong answer goes one way. If you clear a relevant context, you lose the why behind what you built. Reading the diff back does not return it.

**3. Do you need to hand off?** A handoff note is narrow. You need one only in these cases:

- You move to a new agent tool (for example from Claude Code to Codex).
- You move to a new directory, worktree or repo.
- You send the work to a colleague.
- You fork a side task that you found in the middle of a phase. The current phase must not derail.

That list is the whole rule. A handoff note gives you portability: a file that travels. If nothing travels, you do not need a note.

**4. Can the task run with nobody watching?** Ask if the task is scoped tightly enough to run with no steering. If it is, send it to a subagent and leave this session untouched. Automated review is the standard case. The agent reads the diff and reports, and nobody needs to be there while it works.

**5. Otherwise, compact.** If three things are true, use this option. The context is relevant. The agent tool and the directory stay the same. You must stay in the loop. The tree lands here often. Give `/compact` an instruction (`/compact we're going to QA this area`) so that the summary keeps what the next phase needs.

Compact is the default, and it is the last option to try. It is at the bottom because the four questions above it are all cheaper or more precise. When people start here, the usual failure is a fresh session. It is confidently wrong about a decision that the summary flattened.

## Primary and secondary sources

Every move except Continue turns a primary source into a secondary source. A summary of the session replaces the session as it happened. The trade always has the same shape:

| Source | Information | Noise | Room to move |
| --- | --- | --- | --- |
| Primary (Continue) | Full | Lots | Little |
| Secondary (Compact, Hand off) | Lossy | Less | Lots |

This is why question 1 comes first. You pay for the loss only when staying costs more than it saves.

## These are judgment calls

The questions are not objective. Each question has taste in it, and the same boundary can go two ways on two days. The value is in asking the questions in order, at the boundary, and never in the middle of the work.
