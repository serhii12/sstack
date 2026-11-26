---
name: friction
description: Files a lasting, repeatable problem in the repo or its tools as a friction issue. Use when a session hits a missing step, broken tooling, docs that disagree with the code, or a brittle test. Also use when the user says "log this friction". Do NOT use for one-off confusion. Do NOT use for mistakes of the agent, which the user handles with /retro.
---

# Friction

Friction is a problem in the repo or its tools that costs agents time. Examples include a missing step, broken tooling and a brittle test. Other examples are docs that disagree with the code, and a type that does not match what the code does. The next agent must be able to act on the issue without your session.

## Important

File an issue only when all four of these are true:

1. **It lasts.** It will still be true after this session ends.
2. **It recurs.** It hit more than once, or it will hit the next agent on the same path.
3. **You can reproduce it.** You can write the steps that show it.
4. **It has an owner.** You can name the person, team, package or file owner who can fix it.

If any item is false, do not file the issue. Mention it in your report to the user instead. No fence yet

When you decide alone, the bar holds. If the user asks you to file a problem below the bar, push back once. Name the item that is false and the facts that can change the answer. File nothing in that reply. If the user asks again or confirms, file it. Write in the issue which item of the bar is false. Invent no recurrence, owner or steps. No fence yet

Keep secrets and private data out of every issue: API keys, passwords, tokens, personal names and emails, private URLs. No fence yet

If a fix is obvious, low-risk and in scope of the current change, make the fix and mention it in your report. File what is left over.

## Where it goes

Read `docs/agents/tracker.md`, which `setup` writes. It says where issues live and how to search, create, comment on and label them. Follow it.

If that file does not exist, or says there is no tracker, use a local file: `.scratch/friction/NN-title.md`. `NN` is the next free two-digit number in that folder. `title` is a few words in lowercase-with-hyphens.

## Steps

1. **Search first.** Search the open issues with the `friction` label, or the files in `.scratch/friction/`, for the same problem. Also search the issue titles for the key words, because the label can be missing. If you find a match, comment with what this session adds. Examples are a new way to reproduce it, or a new cost. Then stop. Do not file a duplicate. No fence yet
2. **Write the issue.** If the project has a friction form (an issue template), use it. Otherwise use the format below. Each issue states what happened and what you wanted. It states how to reproduce the problem and the cost. It lists what you already looked at and the relevant files.
3. **Label it.** Add `friction` and one priority. If a human must choose, for example between two fixes, or if the fix changes a rule, add `needs-decision`. If `docs/agents/triage-labels.md` maps the label names, use those names.
4. **Report.** Tell the user what you filed, commented on or left unfiled, with a link or path for each.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A label does not exist on the tracker. | File without it. Tell the user, and give the command that creates the label. If the user says yes, run it. |
| The `friction` label does not exist. | Start the title with `Friction: `, so later searches find the issue. |
| `.scratch/` is gitignored. | Tell the user that the file stays on this machine. |

## Priority

| Label | Meaning |
| --- | --- |
| `P0` | Blocks work now. No workaround. |
| `P1` | Costs real time on most runs. A workaround exists. |
| `P2` | Costs time on some runs. |
| `P3` | Minor. If you work nearby, fix it. |

## Format

This form is flexible. If the project has no friction form, use it. For a local file, put `Status:` and `Labels:` under the title. To close a local file, set `Status: closed`.

```markdown
# <what is wrong, and where>
Status: open
Labels: friction, <P0 to P3>, needs-decision (only when a human must choose)

## What happened
## What you wanted
## How to reproduce
1. <step>
## Cost
<time lost, retries, tokens, or what it blocks>
## Already looked at
## Relevant files
- <path>
## Decision needed
<only with needs-decision: the options, and who should choose>
```

Example of a filled issue:

```markdown
# CI cache key ignores the lockfile, so installs use stale packages
Status: open
Labels: friction, P2

## What happened
`ci.yml` builds the cache key from `package.json` only. After a lockfile change, CI still restores the old packages.
## What you wanted
A cache key that changes when `package-lock.json` changes.
## How to reproduce
1. Change one version in `package-lock.json` and nothing else.
2. Push. The CI log says "Cache restored".
3. The test run uses the old version.
## Cost
Two failed runs and about 20 minutes of debugging.
## Already looked at
The cache step of `ci.yml`.
## Relevant files
- .github/workflows/ci.yml
```
