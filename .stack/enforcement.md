# What enforces each rule

A rule is here when a script, hook or test holds it. Rules that are only instructions are marked `No fence yet` in the skill that states them. Run `node scripts/skill-lint.mjs --json` for the current count.

| Rule | Held by | Proof |
|---|---|---|
| No git flags that skip checks (`--no-verify`, `commit -n`), in any wrapper or nested shell | `hooks/guard-git.mjs` | `tests/hooks/git-policy.test.mjs` |
| No change to the hooks path, no writes to `.git/hooks`, `.git/config`, `.githooks/`, `.stack/` or the guard files | `hooks/guard-git.mjs`, deny rules in `templates/claude-settings.json` | `tests/hooks/git-policy.test.mjs`, `tests/hooks/guard-git.test.mjs` |
| No commits, cherry-picks, reverts or `commit-tree` while on `main` or `master` | `hooks/guard-git.mjs` | `tests/hooks/git-policy.test.mjs` |
| No plain force push. `--force-with-lease` is allowed | `hooks/guard-git.mjs` | `tests/hooks/git-policy.test.mjs` |
| No direct push to `main` or `master`. A dry run is allowed | `hooks/guard-git.mjs` | `tests/hooks/git-policy.test.mjs` |
| The guard blocks when it cannot read its input | `hooks/guard-git.mjs` | `tests/hooks/guard-git.test.mjs` |
| The commit check still runs when `git commit -n` skips pre-commit | `templates/githooks/prepare-commit-msg` | `tests/hooks/prepare-commit-msg.test.mjs` |
| Skill frontmatter parses, and the name matches the folder | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Every file a skill points to exists | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| Every `Held by:` names a path that exists | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| A typed workflow never tells the agent to run another typed workflow | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| The router list in `skills/start` matches the `skills/` folder | `scripts/skill-lint.mjs` | `tests/scripts/skill-lint.test.mjs` |
| The installer never overwrites a file and never writes outside the target | `scripts/install.mjs` | `tests/scripts/install.test.mjs` |

## Confirmed in a live Claude Code session (v2.1.332, 25 Nov 2026)

- A hook that exits with code 2 blocks the command.
- A typed skill is hidden from the agent's own list and still runs when typed.
- `grill` made the agent load `domain-memory` in 2 of 2 runs.
- The deny rules stopped the agent editing the hook and its settings.

## Not held by anything yet

- Interview rules in `grill`, glossary and decision record rules in `domain-memory`, the stop-and-wait rule in `decide`, and the sorting rules in `start`.
- Decision record format. Planned: `scripts/adr-lint.mjs`.
- Whether a skill loads when it should. Planned: a test that runs each skill several times.
