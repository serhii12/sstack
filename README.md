# agent-stack

Our own set of skills, hooks and scripts for AI coding agents. It reuses the best parts of four public stacks and changes them to fit how we work. Claude Code comes first.

## What is in it

| Part | What it does |
|---|---|
| `skills/start` | Sorts the task and tells you the next command to type. Runs only when you type `/start`. |
| `skills/grill` | Interviews you before any code. Each question has a suggested answer, so "yes" accepts it. |
| `skills/domain-memory` | Keeps the project glossary and decision records current. |
| `skills/decide` | Lists options with effort and how hard each is to undo, recommends one, then stops. |
| `hooks/guard-git.mjs` | Blocks git commands that skip checks, commits on `main` or `master`, plain force pushes and direct pushes to `main`. |
| `scripts/skill-lint.mjs` | Checks every skill: frontmatter, links, `Held by` targets, the router list, text rules. |
| `scripts/install.mjs` | Copies the stack into a project repo. |

More skills are being added. `skills/start/SKILL.md` lists what exists and what is planned.

## Install into a project

```
node scripts/install.mjs --dry-run /path/to/project
node scripts/install.mjs /path/to/project
```

The installer never overwrites a file. If the project already has `.claude/settings.json`, it prints what to add by hand. After installing, run `git config core.hooksPath .githooks` in the project.

## Check the stack

```
npm test
npm run lint:skills
```

## What the git guard cannot stop

The guard reads the command the agent is about to run. It cannot see a git alias in your own `~/.gitconfig`, what a script file does, or a person typing in a terminal. Branch protection on the git host is the real barrier. The header of `hooks/git-policy.mjs` has the full list.

## Rules for changing the stack

Read `CONVENTIONS.md`. Every rule in a skill says what enforces it (`Held by:`) or admits that nothing does (`No fence yet`). `.stack/enforcement.md` lists them.

## Credits

See `NOTICE`.
