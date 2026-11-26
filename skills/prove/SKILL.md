---
name: prove
description: Gathers proof that a change works and marks each acceptance check pass, fail or untested. Work that a person can see gets screenshots or video. Use when the user says "prove it", "show it works", "verify", "evidence" or "screenshots". Do NOT use to write tests (test-craft), review code (peer-review) or find a cause (diagnose). The user can also type /prove.
---

# Prove

`prove` gathers evidence for one task. It plans one piece of proof for each Acceptance check of the ticket. It records a result for every check. For work that a person can see, it also looks at what it captured.

## Important

- If another agent started you to look at images, you are a reviewer. Do not follow this skill. Do only what your brief says. No fence yet
- If you did not see a check pass, do not mark it `pass`. `untested` is a valid result. No fence yet
- If a person can see the result of a check, a `pass` needs a screenshot or a video. If you cannot capture one, mark the check `untested` and give the reason. No fence yet
- Give every check an entry. Name a file for each `pass` and `fail`. Give a reason for each `untested`. Held by: skills/prove/scripts/evidence-check.mjs
- Never upload evidence to a host outside the repo. No fence yet
- Evidence files stay in `.artifacts/<task>/evidence/`. Never commit them to the ticket branch. The installer adds `.gitignore` rules for the media types. Held by: scripts/install.mjs (media files only)
- Everyone who can read the repo can see the evidence. So use test data. If a check needs real client data on the screen, such as names, emails or tokens, mark it `untested`. No fence yet
- Never edit an evidence file after you index it. Held by: skills/prove/scripts/evidence-check.mjs
- Add no dependency to the project. If the project has no browser test tool, `scripts/run-playwright.mjs` installs Playwright outside the project. Say in the report what it installed and where. Held by: skills/prove/scripts/run-playwright.mjs, tests/scripts/run-playwright.test.mjs
- Do not invent runtime evidence for a docs-only change. No fence yet
- The script cannot prove that an image shows what you say it shows. Only the fresh reviewer, and then a person, can check that. Say so in the report. No fence yet

## 1. Read the task

1. Find the task name. It is the name in `.artifacts/<task>/`. If you have none, use the last part of the branch name, for example `user-auth-0816a` in `agent/user-auth-0816a`. `build` and `land` use the same name.
2. Read the `## Acceptance checks` list of the ticket. For a tracker issue, save its body to `.artifacts/<task>/ticket.md` first.
3. Take the evidence level from the `Evidence level:` line of the ticket. If the ticket has none, take it from the handoff note of `/start`, at `$TMPDIR/sstack/start-<short-task-name>.md`. If there is no note, pick it from the table in step 2 and say which you picked.
4. On GitHub and GitLab, a triage brief is a comment. If it holds the checks, add it below the body in `.artifacts/<task>/ticket.md`. `scripts/evidence-check.mjs` reads its `### Acceptance checks` list. If no ticket has Acceptance checks, take the checks from the request of the user. Write them as `## Acceptance checks` in `.artifacts/<task>/ticket.md`. Say in the report that the checks came from the request. No fence yet

## 2. Plan one piece of evidence for each check

Write one line for each check before you capture anything. Size the evidence to the change.

| Level | The evidence for a check |
| --- | --- |
| `cite` | A text file that quotes the file and line, issue or commit. |
| `content` | The output of the link check and of each command that the docs show. |
| `behavior` | The output of a test or command, with its exit code. If a person can see the result, add screenshots. |
| `red-then-green` | The same capture before the fix (`before`) and after the fix (`after`). |
| `checks` | The output of the repo checks on the head commit. |

A docs-only change has no runtime evidence. Do not run the app to make some. A check that needs a runtime you do not have is `untested`. Say why.
No fence yet

Some parts of a check do not show on the screen, such as the URL, a redirect or a history entry. Prove such a part with a text file, not with an image. The capture script writes the URL and `history.length` after each step to `output/<flow>-url.json`. Name that file in the entry of the check. Tell the image reviewer which parts the text file covers. Do not draw a caption into the page. A check with no visible part needs no image review.
No fence yet

## 3. Gather the evidence

1. Work in the checkout that holds the change. Make no new worktree or branch, except for the `before` capture in item 4.
2. Commit the change first. Run `git rev-parse HEAD` and keep the sha. The evidence belongs to that commit.
3. Save command output as text. Write the command, its exit code and its output to `output/<name>.txt`.
4. For a bug, capture the failure before the fix. If the fix already exists, check out the parent commit in a separate worktree and capture there. Never use `git stash`.
5. Before you trust a local server, find the process on its port with `lsof -i :<port>`. Run `ps -p <pid> -o args=` to make sure that it runs your code.
6. Put every file under `.artifacts/<task>/evidence/`. Keep a capture script beside the captures, so a person can run it again. Write it for `node`, which the stack already needs.

## 4. Capture what a person can see

A web page, a screen, an image or a document is visible. Terminal output is visible too, but its text file is the proof. If color or layout is the point, take a screenshot.

Read [CAPTURE.md](CAPTURE.md) for the commands. The rules are these:

- Use the test tool that the project already has: Playwright, Cypress, Puppeteer or Storybook. Look in the dependency list and the config files of the project.
- If the project has none, look for a browser that is already installed. It can take screenshots with its own flags. It cannot record video, click or switch to dark.
- If there is no browser, or a check needs video, clicks or dark, run the capture with `scripts/run-playwright.mjs`. It installs Playwright in a temp folder outside the project. Do not wait for a yes. If the install fails, mark the visual checks `untested` with the reason.
- Capture a phone width (375 px) and a desktop width (1280 px) at least. Capture light and dark when the app has both.
- When the change alters something that existed, capture a `before` and an `after` of the same view.
- When the behavior is a sequence, take one screenshot for each step. Record a video too if the tool can. The video is for people. The reviewer reads the screenshots.

The script holds only the widths and the file types, not the choice of tool or the sizes you pick. Held by: skills/prove/scripts/evidence-check.mjs

## 5. Look at what you captured

Do not judge your own screenshots. Start a fresh subagent for each batch of checks. Use the brief in [REVIEWER-BRIEF.md](REVIEWER-BRIEF.md). Give it only the text of each check and the image paths. Give it no diff and no reasoning.

- The reviewer opens every image and answers for each check: `matches`, `does not match` or `cannot tell`.
- Save its whole reply, word for word, to `reviews/<name>.md`. Do not edit it.
- `matches`: the check can be `pass`.
- `does not match`: the check is `fail`. Or fix the change, then capture and review again.
- `cannot tell`: capture a clearer image, or mark the check `untested` with the reason.
- If subagents are not available, tell the user. Look at the images yourself with the same brief. Set `reviewer` to `same-context`. This is weaker. Suggest a new `/prove` run in a fresh session.

The script holds the rule that a visual `pass` needs a `matches` verdict and a saved reply that agrees. It cannot hold that the reviewer was fresh. Held by: skills/prove/scripts/evidence-check.mjs

## 6. Write the index and run the fence

1. Write `.artifacts/<task>/evidence/index.json`. The format is in [INDEX-FORMAT.md](INDEX-FORMAT.md).
2. Fill the hashes: `node .claude/skills/prove/scripts/evidence-check.mjs fill-hashes <task> --repo <worktree> --write`
3. Run `node .claude/skills/prove/scripts/evidence-check.mjs <task> --repo <worktree> --strict-head`
   Run both commands from the project root. `--repo` names the checkout that holds the change. Leave it out when that checkout is the project root.
4. Read the exit code. The last line of the output also names it. Each problem line is `path  rule  what is wrong  Fix: ...`.

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | Sound, and every check is `pass`. | Report. |
| 1 | The evidence has problems. | Fix each line and run again. Never change a result to get exit 0. |
| 2 | Usage or read error. | Read the message. |
| 3 | Sound, but a check is `fail` or `untested`. | Report them as they are. |

Held by: skills/prove/scripts/evidence-check.mjs, tests/scripts/evidence-check.test.mjs

## 7. Report

Say what you proved and what you did not. The evidence proves the change on one commit in one environment. It does not prove a deployed system. Never write "verified in production".

```markdown
## Prove report: <task>
Commit: <sha>   Level: <level>   Environment: <where it ran>
Installed: <what run-playwright installed and where> (or "None")
Checks from: the ticket | the request of the user
Checks: <check>: pass | fail | untested: <why> (one per line)
Visual review: fresh subagent | same context (weaker) | not needed
Fence: exit <code>
Not proven: <check or case>: <why> (or "None")
Evidence: .artifacts/<task>/evidence/ (local, not in the ticket branch)
```

The pull request shows the screenshots and the video. `/land` pushes the media that the index names to the branch `evidence/<task>` in the same repo, and links them in the pull request body. Print the table with `node .claude/skills/prove/scripts/evidence-check.mjs report <task>`. It prints no table while the evidence has a problem.
No fence yet

## Provenance

- `evidence-driven-testing/SKILL.md` and `scripts/evidence.py` from rstack (github.com/michaelshimeles/rstack), Michael Shimeles, no license file. Adapted: evidence in proportion to the change, the three results with `untested` never silent, the commit and environment stamp, capture the failure before the fix, the server port and process check, `untested` for a check that needs real client data on the screen, one capture file per assertion, and the result counts of the report. The Playwright recipe in CAPTURE.md is adapted from the `record.mjs` example of the headless path. Left out: the screen recorder, its supervisor, the burned-in labels and the upload step. See CAPTURE.md. The headless helper `scripts/run-playwright.sh` became `scripts/run-playwright.mjs` in Node. Its pinned manifest and lockfile are copied to `scripts/playwright/`. As in rstack, Playwright is installed outside the project with no ask. An earlier version stopped and waited for a yes. The owner did not ask for that stop, and it is gone.
- `AGENTS.md` lines 3-13, same repo and author. Idea only: docs-only changes get no invented runtime evidence.
- `before-and-after/SKILL.md`, same repo, PolyForm Shield 1.0.0, Copyright (c) 2026 James Clements. Adapted: the phone size 375x812, reuse a capture that already exists, and the before and after table of the report. Its license notice is in `NOTICE`. Left out: the Vercel tool and the upload to a public host.
- `skills/autopilot/scripts/audit-report.mjs` lines 200-310 from kcd-skills (github.com/kentcdodds/kcd-skills), MIT, Copyright (c) 2026 Kent C. Dodds. Idea: a score needs evidence, and an unknown needs a reason. The validator there never opens the files. Ours does.
- `skills/visual-recap/SKILL.md`, same repo, license and holder. Idea only: the proof depends on the risk of the change. Our levels come from `/start`.
- `skills/ship/SKILL.md` line 92 and `skills/model-a-protocol/SKILL.md` line 62 from ratstack (github.com/joelhooks/rat-stack), MIT, Copyright (c) 2026 Joel Hooks. Ideas: report the states apart, and "not checked is never a pass".
- `skills/engineering/code-review/SKILL.md` from mattpocock/skills, MIT, Copyright (c) 2026 Matt Pocock, through our `peer-review`. Idea: a fresh reviewer that gets no reasoning from the author.
- New here: the index format, the fence script, the fresh image reviewer with its saved reply, the width rule, the exit codes, and checks taken from the request of the user when no ticket has them.
