# Check the blockers of a ticket

Read this file from step 1, item 5 of [SKILL.md](SKILL.md).

- For a local ticket, run `git fetch origin` first. Then run `node .claude/skills/build/scripts/ticket-ready.mjs <ticket path>` from the project root. Use the absolute path of the ticket. The script reads the `Status:` line of each blocker file. For a closed blocker with a `Built on branch` line, it also checks that the built commit is in `origin/main`. A new worktree starts from `origin/main`, so the work of an unmerged blocker is not in it.
- If the exit code is 0, every blocker is closed and its work is in `origin/main`. Go on.
- If the exit code is 1 or 3, a blocker is open, is not merged, or cannot be read. If the user did not say to build anyway, stop now and make no worktree. Print: `Cannot build <ticket>. <blocker> is still open or not merged. This ticket needs the work of that blocker. Fix: build, close or merge <blocker>, then type /build again. To build it now, type /build <ticket> anyway.`
- If the user said to build anyway, say in one line what can break: the work can need code that the blocker adds. Then go on. Name each open blocker in the report under `Not tested:`.
- If the exit code is 4, stop. Print the message of the script. Tell the user to run `node .claude/skills/tickets/scripts/tickets-lint.mjs`.
- If the exit code is 5, the ticket has no `Blocked by:` line. Say in the report that no blocker check ran. A plan in this conversation has no such line.
- If the exit code is 2, fix the command and run it again. If the script is missing, open each blocker file. Its `Status:` line must say `closed`. Say in the report that the script did not run.
- A tracker ticket names issues or has native blocking links. Fetch each blocker, as `docs/agents/tracker.md` says. It must be closed. If a blocker is open or cannot be read, follow the two items above for exit code 1. This is a text rule.

## Provenance

New in this stack. The text moved here from `SKILL.md` to keep that file under 150 lines. The "build anyway" path is new: the user decides if an open blocker matters yet. The `Blocked by:` parser of `ticket-ready.mjs` follows `skills/tickets/scripts/tickets-lint.mjs` in this repo.
