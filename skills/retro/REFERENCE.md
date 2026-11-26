# Retro reference

## Implementation and review

All work goes through two stages: implementation and review. The implementing agent has the most **context pressure**: it explores, writes code and debugs failures, inside one context window. The reviewing agent has the least. It receives a diff, so it needs no exploration, and it often does not write code or debug.

So the reviewer enforces coding standards. A new judgment rule goes where there is room to apply it, which is review. A mechanical rule goes in a check, which needs no room at all.

## Which file holds what

| File | Read by | Use it for |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | Every agent, every session | Pointers to other files. Use very sparingly. |
| CODING_STANDARDS.md (or the repo's own standards file) | The reviewer, during review | Judgment rules. If it grows past about 1,000 lines, add pointers to docs folders. |
| `docs/agents/enforcement.md` | People, `retro` | Every rule and what holds it. |
| Checks (lint rules, tests, git hooks, CI jobs) | Scripts | Mechanical rules. |
| Docs | Agents, through pointers from other files | Reference material. Look for an existing doc before you write a new one. |

## The enforcement list

`docs/agents/enforcement.md` lists every rule in the project and what holds it. A rule that nothing holds says `No fence yet`. So it is plain which rules are only instructions. `retro` reads this list to find broken rules that can become checks.

The settings template denies agent edits under `.stack/`. So the list of the project lives in `docs/agents/`, where the agent can write it. Keep the format the file already has. If the file does not exist, create it like this:

```markdown
# Enforcement

Every rule in this project and what holds it. `No fence yet` means nothing enforces the rule. It is only an instruction.

| Rule | Written in | Held by | Changed |
| --- | --- | --- | --- |
| No commits to main or master | AGENTS.md rule 2 | .claude/hooks/guard-git.mjs | <date> |
| Flag a function that mixes parsing and I/O | CODING_STANDARDS.md | No fence yet (reviewer) | <date>, retro of <session> |
```

- One row per rule. Name the file where the rule is written, so a reader can find the full text.
- `Held by` names the path of the check, hook or test. A rule enforced only by the reviewer is `No fence yet (reviewer)`.
- When a check replaces a `No fence yet` rule, change that row. Do not add a second one.
- When a check is removed, change its row back to `No fence yet` or delete the rule.

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| The log of the session is not under `~/.claude/projects/` | The session ran on another machine, or the user cleared the logs | Ask the user for the log file. If none exists, list only the mistakes that you can trace in this conversation. |
| A new check passes on the planted mistake | The check does not match the pattern | Do not wire it in. Fix the check until it fails on the mistake. |
| An edit under `.githooks/` or `.stack/` is denied | The settings template protects those paths | Follow the rule under "Updating the enforcement list" in SKILL.md. |
