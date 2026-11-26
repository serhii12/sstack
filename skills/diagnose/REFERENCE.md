# Diagnose reference

Long reference for [SKILL.md](SKILL.md). Read the part you need.

## Ways to build the command

Roughly in order of preference:

1. **A failing test** at whatever boundary reaches the bug: unit, integration or end to end.
2. **An HTTP script** (curl or similar) against a running dev server.
3. **A CLI run** with a fixture input. Compare its output with a known-good copy.
4. **A headless browser script** (Playwright or Puppeteer) that drives the UI. It checks the DOM, the console or the network.
5. **A replayed capture.** Save a real request, payload or event log to disk. Replay it through the code path on its own.
6. **A throwaway script.** Start a small part of the system (one service, fake dependencies). It must reach the code path of the bug with one function call.
7. **A fuzz loop.** If the bug is "sometimes wrong output", run 1,000 random inputs and look for the failure.
8. **A bisection script.** If the bug appeared between two known states (a commit, a dataset, a version), write a script. The script sets up a state, checks it and exits pass or fail. Then `git bisect run` can drive it.
9. **A differential run.** Run the same input through the old and new versions, or two configs, and compare the outputs.
10. **A person in the loop.** This is the last resort. If a person must click, write a short script that prompts them for each step. The script prints their answers in a form that you can read back. Then the loop stays structured.

When you build the right command, most of the work is complete.

## Make the command faster and sharper

Treat the command as a product. When you have one, improve it:

- **Faster.** Cache setup, skip unrelated startup work, run fewer tests.
- **Sharper.** Check the exact symptom. "It did not crash" is not a check.
- **More repeatable.** Pin the time, seed the random generator, isolate the filesystem, block the network.

A flaky command that takes 30 seconds is barely better than no command. Aim for a repeatable command that takes 2 seconds.

## Failures that happen only sometimes

The goal is a higher reproduction rate. A clean repro can fail to appear. Loop the trigger 100 times. Run it in parallel. Add load. Narrow the timing window. Add sleeps at the suspect points. You can debug a failure in 50% of runs. You cannot debug a failure in 1% of runs yet, so keep raising the rate.

Always give the rate as counts: "7 of 10 runs", "17 of 1,000 runs". A percentage hides how many runs you made. After the fix, run at least the same number of runs and give the new count.

## Rebuild what runs

Investigate code that you can read and rebuild. If the running build holds changes that exist nowhere else, extract them as readable patches and pin every commit. Before you trust an experiment, make sure that your rebuild reproduces the failure.

## Probes

A "probe" is temporary code that checks one cause. A good probe checks the suspect values. Before the failure happens, it stops the run cleanly and reports the values that it saw. This is often faster than a run that waits for the crash. Tag every probe with the debug prefix. Then cleanup finds it.

## Notebook format

Write entries as they happen. Redact secrets in every entry. This template is flexible. Keep the field names. If you need more, add fields.

```markdown
# Diagnose: <one-line symptom>
Started: <date>
Command: <the Phase 1 command>
Rate before: <n of m runs>

## Entry 1
Cause tested: <the first cause, or one cause from the ranked list>
Prediction: If <X> is the cause, then <changing Y> makes the bug go away.
Command: <exact command>
Result: <what happened, with counts>
Verdict: proved | disproved | unclear
Rules out: <what this result removes from the list>

## Result
Cause: <the cause> Proof: <the entry that proved it>
Settings touched: <each setting, what it trades, what was measured>
Fix: <what changed> Rate after: <n of m runs>
Workaround: <none, or what it is and what it costs>
Rebuild recipe: <pinned sources and commands, so someone else can reproduce the failure and the fix>
```

## Worked example

From rat-stack: two web tests read the same build output while the build rewrote it. Two repro runs found 17 and 28 torn reads. The fix wrote each file to a temporary path and renamed it into place. After the fix, 8.5 million reads showed no torn read.
