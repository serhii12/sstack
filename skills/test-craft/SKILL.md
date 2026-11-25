---
name: test-craft
description: Chooses the kind of test and where it goes for a change, and proves that each new test or check can fail. Use when the user asks how to test a change, for example "how should I test this?". It also fits a question about which kind of test to write or where to put a test. Load it before you answer. Use it for TDD, test-first work, a regression test or a new lint rule, even for a one-line or config change. Do NOT use for a general question about testing terms, such as mock versus stub.
---

# Test craft

A test proves one behavior. Name that behavior before you write the test. Then pick the kind of test that fits it.

## Important

- Write the test first. Watch it fail on the right symptom.
- Test only at agreed test boundaries.
- Prove every new check with a planted bug.
- If a test breaks when you rearrange the code and the behavior stays the same, reject the test.
No fence yet

If `GLOSSARY.md` exists, read it. Then the test names use the words of the project.

## Terms

- A "test boundary" is the public interface where a test observes behavior without reaching inside. Examples are the exports of a module, an HTTP endpoint or a CLI.
- `code-craft` defines the other two boundary words. A "module boundary" is where the interface of a module is. A "system boundary" is where the code meets the outside.
- A "red" run fails. A "green" run passes.
- A "planted bug" is a small break that you make on purpose to see a check fail. Then you undo the break.
- A "check" is anything that can fail a change: a test, a lint rule, a hook, a guard or a CI step.

## 1. Agree the test boundaries

Test only at agreed boundaries. If the caller (for example `build`) passed boundaries from a ticket or spec, use them. If the spec or ticket names boundaries, use those too. Do not ask the user to confirm them again. Go to section 2.

If no boundary is named, propose boundaries before you write any test. For each boundary, give one line on what it catches, what it misses, and how slow it is. Then wait for the user to confirm. Write no test at a boundary that nobody agreed.
No fence yet

To choose where a test boundary goes, call the Skill tool with "code-craft". The interface of a module is what tests use. If no good test boundary exists yet, this is a design question. Tell the user. The user can type `/grill` to settle it.

## 2. Pick the kind of test

| What the test proves | Kind of test |
| --- | --- |
| A rule that holds for many inputs | **Property test.** Generate inputs. State the rule without calling the code under test to get the answer. If the project has a property-testing library, use it. If not, use a table of worked examples. |
| Anything with history: sessions, retries, lifecycles | **Model test.** Generate sequences of commands. Run each command on the real system and on a small model of it. Compare the results after each step. |
| UI behavior | Drive the UI as the user does (click, type, wait). Check what the screen shows (roles, text, data attributes). Do not check internal state fields. |
| One interface between parts, such as a service over the real filesystem | **One example test** at that boundary. |
| A bug fix | **A regression test** at the boundary where the bug happens. If the suite already covers the behavior, skip the test. |
| Config, wiring or glue with no independent answer to check against | Usually no unit test, because the test restates the code. Run the real thing and keep the output as proof. |

These rules apply to every kind of test:

- Take expected values from outside the code. Use a literal that you worked out, a worked example, or the spec.
- Test a race as a plain test. Let the late event arrive after the state moves on. Then make sure that nothing broke.
- Mock only at system boundaries. These are external APIs, time, randomness, and sometimes the database or filesystem. Do not mock your own modules.
- Do not write a browser test first for a feature that does not exist yet. Browser tests are slow, so the red-green loop loses its value. Add browser tests after the behavior works.

To see good and bad test examples, and how to design for mocks, read [REFERENCE.md](REFERENCE.md).
No fence yet

## 3. Red first, one slice at a time

1. Write one test for one behavior.
2. Run the test. Watch it fail and read the failure. The test must fail on the right symptom, which is the check for the missing behavior. A typo, a missing import or a crash in setup gives the wrong red. In that case, fix the test and run it again.
3. Write only enough code to make the test pass. Add nothing for the next test.
4. Run the test and watch it pass. Run the nearby tests too.
5. Go to the next behavior.

Work in vertical slices. A slice is one test, then its code, then the next test. Do not write all the tests first. Tests that you write in bulk check imagined behavior. They also lock in a test layout before you know the code. For a bug fix, the first failing test is the shrunk case from the diagnosis.

Never delete or weaken a test to make the suite pass. If a test fails, fix the code. If you think that the test is wrong, report it.

If a ticket merges modules, replace the old tests. Do not layer new tests on top of them. Write tests at the new interface first. If the ticket says so, delete the old tests of the merged modules in their own commit, after the new tests pass. `code-craft/RESTRUCTURE.md` has the steps.
No fence yet

## 4. Plant a bug in every new check

Prove each new check once with a planted bug:

1. Run the check on clean code. It must pass.
2. Break the behavior that the check protects. Flip a condition, delete a line, or add the pattern that a lint rule bans. Make the break with one edit of the file. Write no helper script and no copy of the file.
3. Run the check. It must fail, with a message about that behavior.
4. Restore the code with the reverse edit. Make a diff against the clean version. The diff must show that no part of the break is left. If the clean code is committed, `git diff --exit-code -- <file>` must print nothing.
5. Run the check again. It must pass.

Report all three runs. If the check does not fail in step 3, the check does not work. Fix the check before you continue. Do not rewrite an expected result to match broken code.

This rule also applies to red-first tests. The first red shows that the test fails when the code is missing. The planted bug shows that the test fails when the code is wrong.
No fence yet

## 5. Reject these tests

- A test that is tied to the layout breaks when you rearrange the code and the behavior stays the same. The signs are: it mocks your own modules, tests private methods, or checks call counts or call order. It can also check through a side channel, such as a database query in place of the interface.
- A change detector fails on any edit to the code and proves no rule.
- A tautological test works out the expected answer the way the code does, so it passes by construction.
- A duplicate regression test covers a behavior that the suite already tests.
No fence yet

## Troubleshooting

- Problem: the first red is an import error because the function does not exist. Cause: a missing export gives the wrong red. Fix: add a stub that returns a wrong value. Then the test fails on the assertion.

## Provenance

Both sources are MIT. See NOTICE.

- `skills/test-behaviour/SKILL.md` from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. The base of sections 2, 4 and 5. Kept: "a test proves one behaviour, name it first", the kinds of test by what they prove (property, model, UI, one example at a boundary), the race test, checks on what the view shows, plant a bug, never rewrite an expected result, and the three rejected kinds. Removed: Effect `Arbitrary`, `it.prop` and `it.effect.prop`, Foldkit Scenes and Commands, Layers, all rat-stack file paths, the empty pinned code fences, its template path, links to its site pages, and frontmatter `plain` and `diagram`.
- `skills/engineering/tdd/SKILL.md` from [mattpocock/skills](https://github.com/mattpocock/skills), MIT, Copyright (c) 2026 Matt Pocock. The base of sections 1, 3 and 5. Kept: tests at agreed boundaries confirmed by the user, red before green, one slice at a time, vertical slices, implementation-coupled and tautological tests, mocks at system boundaries. Changes: boundaries passed by the caller are used without a second confirmation, an Important section, `seam` called "test boundary", and each proposed boundary says what it catches, misses and costs (his issue #607). His pointer to `codebase-design` became a pointer to our `code-craft`. Removed: the pointer to his `code-review` skill, and `agents/openai.yaml`.
- `docs/engineering/tdd.md` from the same repo: the open gap on changes with no independent answer (his issue #746, our last table row), and browser tests written first. Ideas only.
- `skills/in-progress/setup-ts-deep-modules/SKILL.md` from the same repo: the pass, fail, pass order in section 4. Idea only.
