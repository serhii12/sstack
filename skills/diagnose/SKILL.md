---
name: diagnose
description: Finds the cause of a bug, then fixes it with a regression test and a notebook. Load it first, before you read any code. Use when a test or command fails for an unknown reason, or a result is wrong. Use when a failure is flaky, or something worked before and now does not. Use when the user says "diagnose", "debug", "why does this fail", "I do not know why" or "this keeps breaking". Do NOT use for a question about what an error message means, or when the user knows the fix. The user can also type /diagnose.
---

# Diagnose

This skill finds the cause of a bug before it changes any code. A "red" run fails on the bug. A "green" run passes.

## Important

Follow these rules in this order. Print the `Red command:` line as plain text in your reply. A person or a script can search your reply for it.

1. Before you form any theory, run one command that goes red on the exact symptom. Then print `Red command: <command>`.
2. Before the first probe, edit or fix, write `Ranked causes:` with 3 to 5 causes in the notebook. Give each cause a prediction. Phase 3 has the format. Held by: evals/diagnose/01-failing-test-planted-bug.md
3. If one cause looks obvious, write the list too. Do not wait for an answer. Test the top cause next. No fence yet
4. If a fix leaves a new symptom, write a new `Ranked causes:` list in the notebook before the next change. No fence yet
5. Before you fix the cause, write a failing regression test. Load `test-craft` to choose its boundary. If an existing failing test is the regression test, load it too.
6. Test one cause at a time. Change one thing per experiment.
7. Write every result in the notebook, including each disproved cause. A first cause that was right also gets an entry.
8. Before you show anything, write `<REDACTED>` in place of every secret.
Held by: evals/diagnose/01-failing-test-planted-bug.md

## When this skill fits

Use it for one failure that you can name as a symptom. A symptom is an error, a wrong output, a flaky test, or a slow run with a known before and after. This skill does not audit a codebase for problems that nobody saw.

If the user asks a quick question and wants a direct answer, answer it. Then stop. Offer the full diagnosis in one line: "Type /diagnose if you want me to reproduce it first."
No fence yet

If `GLOSSARY.md` or `docs/adr/` exists, read the glossary and the decision records for the area that you touch.

## Remove secrets first

Before you show a command, an output or a captured file, write `<REDACTED>` in place of every secret. This rule also applies to the notebook. Pass credentials to the command through environment variables. Quote only the lines that carry the signal. If the redacted output does not give enough information to find the bug, say so and ask the user.
No fence yet

## Keep a notebook

The "notebook" is the running record of the diagnosis. Write each entry as soon as its step is complete. Save the notebook with the Write tool outside the repo, at `$TMPDIR/sstack/diagnose-<short-name>.md`. If `TMPDIR` is not set, use `/tmp`. Each entry holds the cause that you tested, the exact command, what happened, and what it rules in or out. For the format, read [REFERENCE.md](REFERENCE.md#notebook-format).

A disproved cause is a result. Write it down with its evidence, then move on.
No fence yet

## Phase 1: One command that goes red on the bug

This phase is the hard phase. If you have a fast pass or fail signal that goes red on this bug, you will find the cause. Without the signal, reading code will not find it.

Build the command with a failing test at the boundary that reaches the bug. If no test can reach the bug, read [REFERENCE.md](REFERENCE.md#ways-to-build-the-command). It lists the other ways in order.

If the failure happens only sometimes, raise the reproduction rate until you can debug against it. Give the rate as counts, for example "7 of 10 runs".

If you cannot build the command, stop and say so. List what you tried. Ask the user for access to an environment that reproduces the bug, a redacted capture, or permission to add temporary logging.

You are done with this phase when you ran one command at least once. Show the invocation and the redacted output. The command must have these properties:

- It is red on this bug. It checks the exact symptom of the user. "It did not crash" is not a check.
- It is repeatable. It gives the same verdict on every run, or a stated rate as counts.
- It is fast. It takes seconds, not minutes.
- You can run it yourself, without a person.

Form no theory until this command exists. Guessing before the command exists is the failure that this skill prevents.
No fence yet

## Phase 2: Reproduce and shrink

Run the command and watch it go red. Make sure that it shows the failure that the user described. A nearby failure is a different bug. Capture the exact symptom (error message, wrong output, timing), so that you can compare the fix with it.

Then shrink the command to the smallest case that still goes red. Cut one input, caller, setting or step at a time, and run the command again. You are done when removing any one remaining piece makes the command go green. The small case becomes the regression test in Phase 5.
No fence yet

## Phase 3: Rank the causes before you test one

Before you test any cause, do these steps. If one cause looks obvious, or you already read its code, do them too. One guess holds you to the first idea that fits.

1. Write `Ranked causes:` in the notebook with the Write tool. Do this before the first probe, edit or fix.
2. Write 3 to 5 causes under it, most likely first. Give each cause one line with its prediction.

Use this form for each prediction:

> If <X> is the cause, then <changing Y> makes the bug go away and <changing Z> makes it worse.

If you cannot state the prediction, sharpen the cause or drop it. The user can read the list in the notebook. The user can know of a recent change, or of a cause that is already ruled out. Do not wait for an answer. Test the top cause next. If the user ranks the list again, follow the new order.

If a fix leaves a new symptom, write a new `Ranked causes:` list in the notebook before the next change.
No fence yet

## Phase 4: Test one cause at a time

Each experiment tests one cause and its prediction. Change one thing per experiment. Repeat each experiment enough times to see the rate change.

- If the code that runs differs from the code that you read, rebuild what runs first. For a temporary check, write a probe. Read [REFERENCE.md](REFERENCE.md#rebuild-what-runs).
- If the environment has a debugger or REPL, use it. If it has none, add a few logs at the boundaries that tell the causes apart.
- Tag every debug log with one unique prefix, such as `[DEBUG-a4f2]`. Then cleanup is one grep.
- An "asynchronous error" appears after the work that caused it. Before you trust its stack trace, make the error synchronous.
- For a performance regression, logs usually mislead. First measure a baseline (a timing script, a profiler, a query plan). Then bisect.

Write each result in the notebook, proved or disproved.
No fence yet

## Phase 5: Fix and regression test

Fix the cause where it starts. The place where the error appeared can be far from the cause. A setting that hides the failure, such as a longer timeout or a disabled feature, is a workaround. Measure its cost and label it a workaround.

Write the regression test before the fix. Call the Skill tool with "test-craft" to choose the boundary. If the existing failing test is the regression test, call it too. If the skill does not load, tell the user and choose the boundary yourself. If the only boundary is too shallow, the missing module boundary is the finding. Write it down and report it. Tell the user that `/improve-codebase <area>` can plan a new module boundary for it.

If the existing failing test already is the regression test, say so. Then do these steps:

1. Turn the shrunk case into a failing test at the boundary.
2. Watch the test fail on the symptom. If you forced the red with a change to code or a fixture, diff it against a clean copy. The diff must show the change.
3. Apply the fix. Watch the test pass.
4. Run the Phase 1 command again on the original case. If it is still red, go back to Phase 3 and write a new `Ranked causes:` list first. For a flaky bug, show the new rate as counts, for example "0 of 1,000 runs".
No fence yet

## Phase 6: Clean up and report

Before you say that the work is done, make sure that each item is true:

- The Phase 1 command no longer reproduces the bug.
- The regression test passes, or you wrote down the missing boundary.
- A grep for the debug prefix finds nothing.
- You deleted the throwaway scripts, or moved them to a folder that is clearly marked for debug.

If you commit the fix or write the pull request text, name the proven cause in the message. The next person who reads the history learns the cause.

Report the cause and the experiment that proved it. Then report the disproved causes, the fix with its rate before and after, any workaround with its cost, and the notebook path. If the cause is upstream, offer to send the maintainer the repro. Ask the user before you send.
No fence yet

## Troubleshooting

- Problem: the shell does not show `TMPDIR`. Fix: write the notebook to `/tmp/sstack/diagnose-<short-name>.md`.
- Problem: the Phase 1 command goes green on the first run. Cause: the command does not reach the real code path, or the failure is intermittent. Fix: rebuild the command, or raise the rate.

## Provenance

Both sources are MIT. See NOTICE.

- `skills/engineering/diagnosing-bugs/SKILL.md` from [mattpocock/skills](https://github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. The base of this skill. Kept: the six phases, the redact section, the Phase 1 gate and its four checks, "no theories until the command exists", shrinking, 3 to 5 ranked causes with predictions before the first test with no wait for an answer, one change per experiment, tagged logs, the performance branch, the shallow-boundary finding, the diff against a clean copy after a forced red, and the cleanup list with the proven cause in the commit or pull request message. Rewritten in plain English, with his word for a test join point replaced by "boundary". Changes: his "show the ranked list to the user" became a notebook entry that the user can read. In live runs no model printed the list in its reply, but most runs wrote it to the notebook before the first edit. Also a new ranked list when a fix leaves a new symptom, a tighter description, a "When this skill fits" section, an Important section with exact lines to print, a `test-craft` load with a fallback, shorter phases, and pointers to the rebuild and probe notes. Removed the path to his `hitl-loop` script. Did not take the script or `agents/openai.yaml`.
- `docs/engineering/diagnosing-bugs.md` from the same repo: the over-loading report and the "slow on purpose, wrong tool for a quick question" wording. Ideas only.
- `skills/investigate-a-failure/SKILL.md` from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. Kept: the notebook and its entry fields, the rate as counts, the disproved cause as a result, asynchronous errors, the workaround label, the rate before and after, and sending upstream as an outward action. Removed: frontmatter `plain` and `diagram`, links to rat-stack principle files and its durability page, and the file path in its example.
