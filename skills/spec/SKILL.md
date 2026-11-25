---
name: spec
description: Turn this conversation, usually a confirmed /grill summary, into one draft spec in the tracker. Asks nothing new.
argument-hint: "[feature name]"
disable-model-invocation: true
---

# Spec

`spec` is a typed workflow. It runs only when the user types `/spec`. It reads this conversation and turns it into one spec. A spec is a written record of what the user decided. A fresh session can then pick up the work without the user explaining it again. A spec records decisions the user made. It is never the place to make new decisions.

## It asks nothing new

Work only from this conversation, the code, `GLOSSARY.md` and the decision records in `docs/adr/`. Do not interview the user. Do not settle an open decision yourself. Invent nothing. If little was agreed, still write the spec. If an essential is missing, write it as an open question.
No fence yet

## Gaps that you find

An open question comes from the conversation: a missing essential, or an item that the user or the grill summary names as open. You can also find a gap yourself, such as a case that nobody discussed. Put each such gap under "Open questions" and end it with `(found by the agent)`. List it in the reply too, as a statement. Do not settle it. If the summary says "Still open: None", settles every essential, and you find no gap, write "None" under "Open questions".
No fence yet

## Never mark it ready

The status of the spec is `draft`. Add no label, such as `ready-for-agent`. Set no other status. Only the user marks a spec ready, by hand. An agent that polls for ready work will try to build the whole spec in one run.
Held by: skills/spec/scripts/spec-lint.mjs

## The spec is a snapshot

The spec records what the user agreed on one day. Do not edit it later to follow the code. A dated note under `## Comments` that records a later decision of the user is not an edit. Lasting terms and decisions belong in `GLOSSARY.md` and `docs/adr/`, which `/grill` writes.
No fence yet

## Steps

1. Find the tracker. Read `docs/agents/tracker.md` and use its "Publish a spec" section. If the file is missing, write `.scratch/<feature>/spec.md`. Tell the user they can type `/setup` to choose a tracker.
2. Find the plan. Look for a grill summary with `Status: CONFIRMED by the user`. A summary that still says `WAITING FOR YOUR CONFIRMATION` is not agreed yet. If there is no confirmed summary, use what the user stated or agreed in this conversation. A proposal of yours that the user did not accept is not a decision. Put it under "Open questions" with `(found by the agent)`. If the conversation has no subject and `/spec` has no name, ask one question: "Which feature?"
   No fence yet
3. Check the essentials. Check that the conversation settled each item in this table:

   | Essential | What counts |
   | --- | --- |
   | Problem | What is wrong or missing today, from the user's side |
   | Who it is for | The people or systems that will use it |
   | In scope | What this spec delivers |
   | Out of scope | At least one thing left out, or the user saying nothing is left out |
   | User-visible behavior | What a user will see or get, including the edge cases discussed |
   | Test boundaries | Where tests will observe the behavior, agreed with the user |

   If an essential is missing, or the grill summary lists it under "Still open", still write the spec. Do not invent it. Write "Not agreed. See Open questions." in its section. Add one open question for it. Start your reply with this line:

   ```
   Missing from the spec: <essentials, separated by commas>. Type `/grill` to settle them.
   ```

   If nothing was agreed, every essential is missing. Still write the spec, with an open question for each one.

   Held by: skills/spec/scripts/spec-lint.mjs (not-agreed rule only)
4. Read the area. Read `GLOSSARY.md` and the decision records in `docs/adr/` that touch this change. Read enough of the code to use the right names. Use the words of the glossary throughout. Note each term and each record you use, so the spec can link to them.
5. Write the spec in the format in [SPEC-FORMAT.md](SPEC-FORMAT.md). Each line must trace to the plan or to a file you read. Copy exact numbers, orderings and "must not" rules as the user gave them. Write the user stories short. Under "Open questions", put each missing essential and each item that the user or the summary names as open. Add each gap that you found, marked `(found by the agent)`. Put the "Assumed without asking" items of the grill in the section of that name.
   Held by: skills/spec/scripts/spec-lint.mjs (sections only)
6. Check the spec. From the project root, run `node .claude/skills/spec/scripts/spec-lint.mjs <spec-file>`. Run it alone and with this relative path, so that a permission rule can match it. Its last line gives the count of problems. For a tracker, save the body to a file first. Fix every problem that it prints. Run it again until it exits 0. Exit code 2 means that the script cannot run. If the script is missing or exits 2, check the spec by hand against [SPEC-FORMAT.md](SPEC-FORMAT.md). Then say in your report that the lint did not run. Held by: skills/spec/scripts/spec-lint.mjs
7. Publish it as `docs/agents/tracker.md` says. If the user typed text after `/spec`, use it as the feature name. Otherwise make a short lowercase name with dashes. If a local file already exists, ask before you replace it. On GitHub or GitLab, run the check from the tracker doc before the first write.
   No fence yet
8. Report. Reply with the link or path, the list of open questions and assumptions, and the next command. Name the gaps that you found as statements. Ask no question in the report. If an essential is missing, the first line is the "Missing from the spec" line. The next command is then `/grill`, then `/spec` again. Otherwise, the next command is `/tickets`, typed in this same session. In the same session, `/tickets` does not have to fetch a long spec from the tracker.

## When to skip the spec

A spec is worth its cost when the work spans several sessions. If the agreed change fits in one session, say so in the report. The user can then skip the spec and the tickets. This is advice only. If the user typed `/spec`, still write the spec.

## Provenance

All sources are from [mattpocock/skills](https://github.com/mattpocock/skills), MIT license, Copyright (c) 2026 Matt Pocock.

- `skills/engineering/to-spec/SKILL.md`: the base of this skill. We kept "do not interview the user, just synthesize what you know", the glossary vocabulary, respect for decision records, the user stories (now short), and his rules for test boundaries (now in the template). His "Do not interview the user" line is kept word for word. The test boundary sentences in the template stay close to his wording. The rest is reworded. Changes: renamed to `spec`, his step where the user confirms the test boundaries is gone because the skill asks nothing new, the essentials check and the "Missing from the spec" line are new, a missing essential becomes an open question instead of a stop, a gap that the agent finds goes into the open questions marked `(found by the agent)` and into the reply, the `ready-for-agent` label is dropped, the user stories must stay short, a local file is used when no tracker is set up, and glossary terms and decision records are linked. The template moved to [SPEC-FORMAT.md](SPEC-FORMAT.md), which has its own provenance.
- `docs/engineering/to-spec.md`: ideas in our words. The spec is a decision record and invents nothing. The `ready-for-agent` label on the spec makes polling agents build it whole (his most-reported problem, fixed here by never marking it ready). Run `to-tickets` in the same session so a long spec is not fetched back. A spec is worth it only for multi-session work. The spec did not link the decision records it followed (fixed here).
- Removed: `agents/openai.yaml`, the `/setup-matt-pocock-skills` pointer, and the aihero.dev links.
- An earlier version refused to write a spec when nothing was agreed, and it kept gaps that the agent found out of the spec and the reply. The owner did not ask for either, and both are gone. Like Matt's skill, `spec` now writes from what the conversation holds.
