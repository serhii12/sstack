# Triggering queries for domain-memory

A larger triggering set for the playbook test. It has 10 queries that must load `domain-memory` and 8 near misses that must not. Run each with the setup of the eval files (stack installed, a small `GLOSSARY.md`, `docs/adr/0001-event-sourced-orders.md` and `src/util.js`) and allowed tools `Skill Read Glob Grep`. When the transcript has a Skill tool call with `domain-memory`, count the query as one that loads the skill.

Run on 25 Nov 2026, one run per query, Claude Code 2.1.332, model claude-opus-5-5.

| Id | Expect | Query | Skills loaded | Result |
|---|---|---|---|---|
| d-y1 | load | Add Subscription to our glossary: a recurring agreement where a Customer pays each month for a Plan. | domain-memory | pass |
| d-y2 | load | We keep using the word account to mean both User and Customer. Pin down the terms in our glossary. | domain-memory | pass |
| d-y3 | load | Write an ADR for our decision to use Kafka instead of RabbitMQ. The decision is final. | domain-memory | pass |
| d-y4 | load | Our glossary says Cancellation is a whole Order, but I mean cancelling part of an Order. Fix the glossary. <!-- style-ok: spelling --> | domain-memory | pass |
| d-y5 | load | Supersede decision record 0001 with a new record: we now use plain CRUD tables instead of event sourcing. | domain-memory | pass |
| d-y6 | load | Record a decision: we will never store card numbers, the payment provider holds them. This is final. | domain-memory | pass |
| d-y7 | load | Update the glossary so that Client is listed as a word to avoid and Customer is the term to use. | domain-memory | pass |
| d-y8 | load | Is Shipment the same as Delivery in our domain? Settle the term and put it in the glossary. | domain-memory | pass |
| d-y9 | load | We chose a monorepo over many repos. That is hard to reverse. Document why we did it. | domain-memory | pass |
| d-y10 | load | Add the glossary term Backorder. | domain-memory | pass |
| d-n1 | stay off | What is a Customer, according to GLOSSARY.md? | none | pass |
| d-n2 | stay off | Fix the off-by-one bug in src/util.js. | none | pass |
| d-n3 | stay off | Explain in two sentences what an ADR is. | none | pass |
| d-n4 | stay off | Run the tests for this project. | none | pass |
| d-n5 | stay off | Summarize docs/adr/0001-event-sourced-orders.md. | none | pass |
| d-n6 | stay off | Write a short intro paragraph for the README of this project. | none | pass |
| d-n7 | stay off | Rename the variable order to purchase in src/util.js. | none | pass |
| d-n8 | stay off | Which is better for us, Kafka or RabbitMQ? | decide | pass |

Result: 18 of 18 correct. The playbook asks for about 9 of 10 on the load set and none on the near misses. Each query ran once. The playbook method asks for 3 runs each, so treat this as a first pass.
