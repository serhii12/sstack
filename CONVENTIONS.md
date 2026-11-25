# Conventions for this stack

These rules apply to every skill, hook and script in this repo.

## Layout

| Path | Holds |
|---|---|
| `skills/<name>/SKILL.md` | One skill per folder. Supporting files sit beside it. |
| `hooks/` | Hook scripts that the agent tool runs. Node, ESM, no dependencies. |
| `scripts/` | Command-line scripts. Node, ESM, no dependencies. |
| `tests/` | `node --test` test files. `tests/hooks/` and `tests/scripts/`. |
| `templates/` | Files that get copied into a project repo: `AGENTS.md`, `GLOSSARY.md`, ADR template, settings, git hooks. |
| `.stack/enforcement.md` | Every rule and what enforces it. |
| `NOTICE` | Copyright notices for everything copied from another project. |

## Skills

- Frontmatter has `name` (same as the folder name) and `description`.
- A typed workflow runs only when the user types its command. It sets `disable-model-invocation: true`. A typed workflow never calls another typed workflow. It tells the user the next command to type.
- A helper skill can be loaded by the agent. Its description says when to load it.
- Keep `SKILL.md` short. Move long reference material to a file beside it and link to it.
- Every rule that matters ends with one of these lines:
  - `Held by: <path to the script, hook or test that enforces it>`
  - `No fence yet` (nothing enforces it; it is only an instruction)
- Each skill ends with a `## Provenance` section. It names each source file, its repo, its licence and its copyright holder, and says what we changed.

## Reuse rules

- Copy and adapt from any of the four source repos, rstack included. Take only the pieces we need.
- Record every source in the skill's `## Provenance` section and in `NOTICE`: repo, path, author, and the licence the file carries or "no licence file".
- Where a source file ships a licence notice (MIT files, `rstack/before-and-after`), keep that notice in `NOTICE`.
- Remove everything tied to one author's setup: Kody, Greptile, Effect, XState, Alchemy, Cloudflare, rat-stack file paths, site links.

## Writing

- Plain English. Short sentences. Common words.
- Say what a thing does. Explain a coined term the first time it appears.
- No em dashes. No semicolons. No "not X but Y" framing. No filler words.

## Code

- Node 20 or later, ESM (`.mjs`), no runtime dependencies.
- Scripts make every decision that can be checked. Exit codes say why a script stopped.
- A hook that must block does so with exit code 2. A hook that cannot read its input blocks.
- Every script and hook has tests. A new check is proven by planting a bug, watching the test fail, then restoring the code.
