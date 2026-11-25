# Notes for the maintainer

These notes do not change what the agent does. When you change `start` or add a skill, read them.

- Confirmed in the Claude Code docs (skills page): `disable-model-invocation: true` keeps a skill out of the agent's context. Only the user can run it. The user can also type an agent skill as `/name`. Files beside `SKILL.md` load when `SKILL.md` links to them. `argument-hint` shows after the command name.
- Not confirmed: how one skill makes the agent load another skill (to confirm in Claude Code). `start` does not rely on it. It only names commands for the user to type.
- Four planned names match Claude Code built-in commands: `debug`, `review`, `ship`, `security-review`. The docs say that a user skill named `ship` does not load where the built-in `/ship` exists. Rename those four before you build them (to confirm in Claude Code).
