# Phase boundaries

A **phase** is a chunk of work inside a session: the grilling, the implementation, the QA. The definition is fuzzy on purpose. A phase ends when you think "ok, we're done with that".

The **phase boundary** is the gap between two phases. It is the only place this decision belongs. Mid-phase there is no decision to make: continue, or split the work that is left into subagents. Compacting mid-phase makes the agent lose the thread.

## The five options

| Option | What it does |
| --- | --- |
| **Continue** | Stay in the session. No context switch at all. |
| **Clear** (`/clear`) | Empty the context window and start from nothing. |
| **Hand off** | Write a handoff note (the format is in [SKILL.md](SKILL.md)) and start a session anywhere from it. |
| **Subagent** | Send the task to its own context window and get a report back. |
| **Compact** (`/compact`) | Compress this context and seed a fresh session with the summary. |

## The tree

Work top to bottom at the boundary. The first **yes** wins.

**1. Can you continue in this session?** The answer is yes in two cases. The next phase needs this phase as a **primary source** (the session as it happened). Or there is enough room left in the **smart zone** for the next phase to fit. The smart zone is the part of the context window in which the model still reasons sharply. Matt Pocock puts it at about 150k tokens on current models. Grilling into implementation is the standard yes: the implementation wants the reasoning word for word, and a summary loses it. Continue costs nothing and loses nothing, so rule it out before anything else.

**2. Is the context irrelevant to what comes next?** Is everything in this session (the exploration, the decisions, the dead ends) disposable? If so, **clear**. It is the cheapest move: it takes no time and hands back the whole window. Clearing is not final. The old session stays resumable.

The cost of getting this wrong is one-way. Clear a *relevant* context and you lose the **why** behind what you built. Reading the diff back does not return it.

**3. Do you need to hand off?** A handoff note is narrow. You need one only when you are:

- moving to a **new harness** (for example Claude Code to Codex),
- moving to a **new directory**, worktree or repo,
- sending the work to a **colleague**,
- or forking a side task you found **mid-phase** without derailing the current one.

That list is the whole rule. What a handoff note buys is **portability**: a file that travels. If nothing travels, you do not need one.

**4. Can the task run with nobody watching?** Is it scoped tightly enough to run with no steering? Then send it to a **subagent** and leave this session untouched. Automated review is the standard case: the agent reads the diff and reports, and you are not needed while it does.

**5. Otherwise, compact.** Relevant context, same harness, same directory, and you need to stay in the loop. The tree lands here often. Give `/compact` an instruction (`/compact we're going to QA this area`) so the summary keeps what the next phase needs.

Compact is the **default**, and it is the last option to try. It sits at the bottom because the four questions above it are all cheaper or more precise. When people start here, the usual failure is a fresh session that is confidently wrong about a decision the summary flattened.

## Primary and secondary sources

Every move except **Continue** turns a **primary source** into a **secondary source**: the session as it happened is replaced by a summary of it. The trade always has the same shape:

| Source | Information | Noise | Room to move |
| --- | --- | --- | --- |
| Primary (Continue) | Full | Lots | Little |
| Secondary (Compact, Hand off) | Lossy | Less | Lots |

This is why question 1 comes first. You pay for the loss only when staying costs more than it saves.

## These are judgement calls

The questions are not objective. Each has taste in it, and the same boundary can go two ways on two days. The value is in asking them **in order**, at the boundary, and never in the middle of the work.

## Provenance

`skills/engineering/ask-matt/PHASE-BOUNDARIES.md` from mattpocock-skills (github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. Copied and adapted. Most sentences are kept. Changes: `/handoff` became "Hand off" with a pointer to our handoff note format, since our stack has no handoff command. Removed the aihero.dev link and explained "smart zone" and "primary source" in place. Split long sentences and removed "not X but Y" framing to fit our writing rules. Changed "AFK" to plain words.
