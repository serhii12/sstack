# Triggering queries for diagnose

Three queries must load `diagnose` with no "diagnose" in the text. Two evals must not load it. Run each query with the setup of eval 01 (the `slugify` repo with the stack installed) and the allowed tools of eval 01. When the transcript has a `Skill` tool call with `diagnose`, count the query as one that loads the skill.

Run on 25 Nov 2026 on Sonnet, 2 runs each, Claude Code 2.1.332. The final description loaded the skill in 6 of 6 runs.

| Id | Expect | Query | Loaded in |
|---|---|---|---|
| q1 | load | this test fails and I do not know why | 2 of 2 |
| q2 | load | npm test is red and I cannot figure out what broke. Can you find the cause? | 2 of 2 |
| q3 | load | slugify returns hello-bigworld instead of hello-big-world and I am stuck. | 2 of 2 |
| n1 | stay off | Eval 02: What does the Node error ERR_MODULE_NOT_FOUND mean? | 0 of 2 |
| n2 | stay off | Eval 03: Add a --verbose flag to src/cli.mjs. | 0 of 2 |

An earlier description loaded q3 in 1 of 2 runs. The words "a result is wrong" fixed that.
