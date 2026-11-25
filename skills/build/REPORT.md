# Build report

Read this file from step 9 of [SKILL.md](SKILL.md). Write the report in this exact form:

```markdown
## Build report: <ticket title>
Worktree: <path>   Branch: <branch>
Commits: <short sha> <subject> (one per line)
Failing test first: <test>. Failed with: <message>. Passes now: yes | no
Boundary chosen by build: <interface> (or "none, the ticket named them")
Acceptance checks: <check>: pass | fail | untested (one per line)
Checks: <command>: pass | fail | untested (one per line)
Review: <n> findings. Fixed: <ids>. Won't fix (user agreed): <id>: <why>. Open: <id> (<severity>). Or: not run
Changed after the review: <short sha> <files> (one per line), and "follow-up review: <n> findings" (or "None")
Skipped at the user's request: <step>: <what is lost> (or "None")
Not tested: <behavior or case>: <why> (or "None")
Design notes: <a shallow module or a missing module boundary outside the ticket, not changed> (or "None")
Ticket: closed in <path> | open, closes when the pull request merges | open, blocked by <what blocks the close>, edit for the user: <the exact edit>
```

## Provenance

New in this stack. The form moved here from `SKILL.md` to keep that file under 150 lines. The line `Changed after the review` is new: in end-to-end run 2, code that changed after the review reached the report with no word on it.
