# Triggering queries for grill

A larger triggering set for the playbook test. It has 10 queries that must load `grill` and 8 near misses that must not. Run each with the setup of the eval files (stack installed, a small `GLOSSARY.md`, `docs/adr/0001-event-sourced-orders.md` and `src/util.js`) and allowed tools `Skill Read Glob Grep`. When the transcript has a Skill tool call with `grill`, count the query as one that loads the skill.

Run on 25 Nov 2026, one run per query, Claude Code 2.1.332, model claude-opus-5-5.

Old results: these runs came before the rule that `grill` loads `domain-memory` at the start in a project repo. So the column "Skills loaded" shows the old behavior.

| Id | Expect | Query | Skills loaded | Result |
|---|---|---|---|---|
| g-y1 | load | Grill me on my plan to rewrite our checkout flow. | grill, domain-memory | pass |
| g-y2 | load | Can you stress-test my plan for migrating our database to a new region before I start? | grill | pass |
| g-y3 | load | I have an idea for a mobile app that tracks gym streaks. Poke holes in it. | grill | pass |
| g-y4 | load | Grill this: we will charge annual plans up front and monthly plans in arrears. | grill, domain-memory | pass |
| g-y5 | load | Interview me about what I want from our new notifications feature before we build anything. | grill | pass |
| g-y6 | load | Before I write the spec for the export feature, quiz me until we agree on what it does. | grill, domain-memory | pass |
| g-y7 | load | Here is my plan for the launch: ship Tuesday, announce Wednesday, support rota Thursday. Test my thinking on it. | grill | pass |
| g-y8 | load | I am not sure my API versioning approach is sound. Challenge me with questions about it. | grill | pass |
| g-y9 | load | I want to restructure how we handle refunds. There are many open decisions. Help me settle them one by one before any coding. | grill, domain-memory | pass |
| g-y10 | load | Please grill me about the outline I wrote for my newsletter on remote work. | grill | pass |
| g-n1 | stay off | What does the function in src/util.js do? | none | pass |
| g-n2 | stay off | Fix the typo in the title of README.md. | none | pass |
| g-n3 | stay off | Which should I use for state management: Redux or Zustand? <!-- style-ok: banned-modal --> | decide | pass |
| g-n4 | stay off | Write a haiku about databases. | none | pass |
| g-n5 | stay off | Explain in two sentences what a decision tree is in machine learning. | none | pass |
| g-n6 | stay off | Summarize this plan in two sentences: we ship Tuesday and announce Wednesday. | none | pass |
| g-n7 | stay off | Add a glossary entry for the term Invoice. | domain-memory | pass |
| g-n8 | stay off | List the options for hosting a static site, with the effort and the undo cost of each. | decide | pass |

Result: 18 of 18 correct. The playbook asks for about 9 of 10 on the load set and none on the near misses. Each query ran once. The playbook method asks for 3 runs each, so treat this as a first pass.
