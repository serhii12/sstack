---
name: peer-review
description: Reviews code changes in this repo on two separate axes, Standards and Spec, with fresh subagents. Its script also finds when nothing changed. Use when the user says "review my changes", "review this diff" or "review my branch". Load it first, before you run git or read the diff. It covers uncommitted work, new files and branch commits. Do NOT use for a review of prose such as an essay. The user can also type /peer-review. A built-in review command of the agent tool is a separate command.
---

# Peer review

## Important

- If another agent started you to review something, you are a reviewer. Do not follow this skill. Do only what your brief says. Start no subagent and no review.
- Never start a review from inside a review.
- Report the Standards and Spec findings apart. Never merge or re-rank them.
- Write the findings to `.artifacts/<task>/review.md` with a status on each.
No fence yet

Review the whole change along two axes. The "Standards" axis asks whether the change follows how this repo writes code. The "Spec" axis asks whether the change does what the spec or ticket asked, at the test boundaries that the team agreed. Each axis is a separate reviewer that has not seen your reasoning. At the end, write the findings to a file. Then a later gate can check that nothing is left open.

The name is `peer-review` because Claude Code already includes the commands `/review` and `/code-review`.

## 1. Get the diff

Run `node .claude/skills/peer-review/scripts/review-range.mjs --stat` from the project root. If the user or the caller named a base, add `--base <ref>` to the command. The script covers commits since the base, staged and unstaged changes, and new files. It lists lockfiles but leaves their diff out. `--include-lockfiles` shows it. Read the header to see what the script included.

- Exit 0: continue.
- Exit 3: there is nothing to review. Tell the user, and stop. Do not start reviewers. Do not write a review file.
- Exit 2: show the user the message and ask for a base ref or a repo path.

The script is inside this skill folder. The installer copies it with the skill. If the file is missing, tell the user. As a stopgap, run `git diff $(git merge-base <base> HEAD)` with no second ref. Then the diff includes staged and unstaged changes. List new files with `git ls-files --others --exclude-standard`. Say that you did this step by hand.
Held by: skills/peer-review/scripts/review-range.mjs, tests/scripts/review-range.test.mjs

Do not edit files while the reviewers run. They read the same range that you pinned.
No fence yet

## 2. Find the sources

- For Standards, read `AGENTS.md`, `CLAUDE.md`, CONTRIBUTING.md, CODING_STANDARDS.md, `GLOSSARY.md`, accepted decision records and any other file that says how to write code. If no file documents a standard, the Standards reviewer uses the baseline in [SMELLS.md](SMELLS.md). A documented repo rule always overrides the baseline. Also call the Skill tool with "code-craft". Give the Standards reviewer `.claude/skills/code-craft/RULES.md`. If the diff has a file that ends in `.ts`, `.tsx`, `.mts` or `.cts`, also give it `.claude/skills/code-craft/TYPESCRIPT.md`.
- For Spec, use the spec or ticket that the user named. If the user named none, look in `.artifacts/<task>/`. Then look for an issue number in the commit messages. Then look for a file under `docs/`, `specs/` or `.scratch/` that matches the branch. If you find nothing, ask. If the user says there is no spec, skip the Spec reviewer and record "no spec available". Do not write requirements from the code.
- For agreed test boundaries, take them from the spec or ticket. If none are written, say "none agreed".

Use the task name that the caller or the user gave. If nobody gave a name, use the branch name after its last `/`. Examples: `user-auth-0816a` from `agent/user-auth-0816a`, and `worktree-user-auth` from `worktree-user-auth`. `build` and `land` use the same name. If the branch is `main` or `master`, ask.
No fence yet

## 3. Run the two reviewers

In one step, start two subagents with fresh context, in the foreground. Then they run in parallel. Use the briefs in [BRIEFS.md](BRIEFS.md). Pass the review-range command (with its `--base`), the source files and the text of the spec. Do not pass your own summary of the change or your reason for the change.

Every brief gives the reviewer four orders. The reviewer reads only. It never loads this skill. It never starts another review. It never starts a subagent. This guard matters. A user of the source skill reported reviewers that started more reviews, up to more than 50 agents.
No fence yet

Claude Code also has the environment variable `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`. Its default is 3, so nesting is on by default. A value of 1 turns nesting off. The user sets it before the session starts. Use it as a second guard. The brief is the first guard.
No fence yet

### When subagents are not available

If subagents are not available, tell the user at once. Run the two reviews one after the other in this same context, with the same briefs. Run Standards first, then Spec. Write down the Standards findings before you read the spec. Mark the result `Mode: same context (weaker)`. In this mode you carry the reasoning of the author and cannot review without it. Suggest that the user runs `/peer-review` again from a fresh session.
No fence yet

## 4. Compare, then report

Compare the citation of each finding with the diff and the spec. A summary from a reviewer is a lead, not proof. If a citation does not match, keep the finding. Add `citation not verified` to it, and tell the user.
No fence yet

Show the user two blocks, `## Standards` and `## Spec`. Use the text that the reviewers wrote, or a lightly cleaned copy. End with one line per axis. Each line gives the number of findings and the worst finding in that axis. Do not pick a single worst finding across both axes. A change can pass one axis and fail the other. A blended verdict lets the passing axis hide the failing axis.
No fence yet

## 5. Write the findings file

Write `.artifacts/<task>/review.md`. If there are no findings, keep the file. Then the gate can see that a review happened. Use this exact shape:

```
# Review: <task>
Range: <base ref> (merge base <sha>) to <head sha>, plus the working tree
Mode: parallel subagents | same context (weaker)
Spec: <path> | no spec available

## Standards
### S1
Status: open
Severity: high | medium | low
Where: <path:line>
Finding: <what is wrong>
Cite: <the rule, the smell with its hunk, or the spec line>
Resolution:

## Spec
No findings.
```

Number the findings `S1`, `S2` for Standards and `P1`, `P2` for Spec (P for sPec). Every finding starts as `Status: open`. The only other values are `Status: fixed` and `Status: won't fix: <reason>`. When you fix a finding, change its status in the same step. Say what changed under `Resolution:`. Mark `won't fix: <reason>` only after the user agrees. Write the reason from the user. A later gate fails while a finding of severity `high` or `medium` is `open`. An open `low` finding does not block.

Give every finding one `Severity:` value, `high`, `medium` or `low`. Write every finding, and do not filter by severity.
No fence yet

If the caller asks for a follow-up review of the commits after an earlier review, keep the earlier blocks of `.artifacts/<task>/review.md`. The base is the sha after `to` on the last `Range:` line. Append a `## Follow-up` block with its own `Range:` line and its findings. Number them on from the last `S` and `P` numbers.
No fence yet

Do not run the review again and again until it is clean. The review does not converge. After the fixes, the caller runs one follow-up review of the fix commits. If the user asks for more reviews, run them.
No fence yet

## Troubleshooting

- Problem: the script exits 3 but you know that files changed. Cause: the script leaves out `.artifacts/`, or the changes sit outside the range of the base. Fix: pass an older `--base <ref>`.
