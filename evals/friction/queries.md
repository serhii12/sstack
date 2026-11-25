# Triggering queries for friction

A triggering set for the playbook test. It has 8 queries that must load `friction` and 10 near misses that must not. Each query ran in a fresh temp repo with the stack installed, a local-files `docs/agents/tracker.md`, `.scratch/friction/01-slow-ci.md`, `src/util.mjs` and `src/friction.mjs`. Allowed tools were `Skill`, `Read`, `Glob`, `Grep`, `Write` and `Edit`. A query counts as loading the skill when the transcript has a `Skill` tool call with `friction`.

Run on 25 Nov 2026, 2 runs per query, Claude Code 2.1.332, model sonnet. The runner function `runOnce` of `scripts/eval-run.mjs` ran each query, with a `skillLoaded` or `skillNotLoaded` check.

| Id | Expect | Query |
|---|---|---|
| f-y1 | load | Log this friction: the dev server needs a manual `make certs` step that the README does not mention. Every new agent trips on it. |
| f-y2 | load | The integration tests are flaky on every CI run, always the same two tests, and the platform team owns them. Please file this so we stop losing time. |
| f-y3 | load | docs/setup.md says to run `npm run bootstrap`, but that script was deleted last month. It broke setup for me and for two other people. Record it for the next agent. |
| f-y4 | load | log this friction: the type of getUser says it returns User, but it returns User or null. The API team owns it. It has bitten us three times. |
| f-y5 | load | The lint config and the CI lint step disagree, so lint passes on my machine and fails in CI every time. Please log it so the next agent knows. |
| f-y6 | load | Every agent run fails at the same missing environment variable step. The setup script has no step that sets it. Make an issue for it. |
| f-y7 | load | This is the third time this week that `npm run build` fails on a fresh clone because of a missing prebuild step. Record it so the next agent does not lose time. |
| f-y8 | load | log this friction, the fixtures folder was renamed but four scripts still use the old name |
| f-n1 | stay off | Our checkout has too much friction. Suggest changes to the payment form. |
| f-n2 | stay off | There is friction between design and engineering on my team. Help me write a short message to the design lead. |
| f-n3 | stay off | I typed the wrong flag and the command failed. What flag makes git log show one line per commit? |
| f-n4 | stay off | Rename the variable cnt to count in src/util.mjs. |
| f-n5 | stay off | Explain what a friction coefficient is in physics, in two sentences. |
| f-n6 | stay off | My test timed out once. Run it again and tell me if it passes. <!-- style-ok: condition-last --> |
| f-n7 | stay off | The agent forgot to run the tests before it committed. What should we change so that does not happen again? <!-- style-ok: banned-modal --> |
| f-n8 | stay off | Write a short README section about the setup steps. |
| f-n9 | stay off | Fix the bug in friction.mjs where the scroll animation uses a friction constant of 0. |
| f-n10 | stay off | Summarize what the open issues in .scratch/friction say. |

Result: 16 of 16 runs loaded the skill on the 8 load queries. 20 of 20 runs stayed off on the 10 near misses. The playbook asks for about 9 of 10 and none on the near misses. The word "friction" in f-n1, f-n2, f-n5, f-n9 and f-n10 did not load the skill. The phrase "log this friction" loaded it in f-y1, f-y4 and f-y8. The set has 2 runs each, and the playbook method asks for 3, so treat it as a first pass. Only the sonnet model ran.

To run it again, run each query as a prompt with the runner function. Or copy a query into an eval file with a `## Checks` block.
