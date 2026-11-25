# Conventions for this stack

These rules apply to every skill, hook and script in this repo. The rules for skills follow the owner's Skill Authoring Playbook. Where this file is stricter, this file wins.

## Layout

| Path | Holds |
|---|---|
| `skills/<name>/SKILL.md` | One skill per folder. Supporting files and scripts sit beside it. |
| `evals/<name>/NN-name.md` | At least 3 test cases for each skill. |
| `hooks/` | Hook scripts that the agent tool runs. Node, ESM, no dependencies. |
| `scripts/` | Command-line scripts. Node, ESM, no dependencies. |
| `tests/` | Test files for `bun test` and `node --test`. `tests/hooks/` and `tests/scripts/`. |
| `templates/` | Files that get copied into a project repo: `AGENTS.md`, `GLOSSARY.md`, ADR template, settings, git hooks. |
| `.stack/enforcement.md` | Every rule and what enforces it. |
| `NOTICE` | Copyright notices for everything copied from another project. |
| `LICENSE` | The license of this repo: MIT. |

## Human or machine

Sort each item into one of two groups.

- A human decides which model to use and when a grill has enough questions. A human also gives approvals and decides if the output is good. These items get no rule, lint, hook or eval.
- A machine runs the git guard, the installer, the scripts, the lints and the tests. These items get tests.

## Vendor-neutral

The agent will not always be Claude. A skill is a plain `SKILL.md` plus scripts. Do not put a feature of one agent tool into a skill.

Put enforcement first into scripts, git hooks and CI. A hook for one agent tool is an adapter.

`CLAUDE.md` is a symlink to `AGENTS.md`. This is an owner decision. The installer creates the link in a project repo.

## Skills

- Frontmatter has `name` and `description`. The `name` is the same as the folder name. It has 64 characters or fewer: lowercase letters, numbers and hyphens. The `description` has no angle brackets and 1,024 characters or fewer. Quote a description that contains a colon.
- A typed skill runs only when the user types its command. It sets `disable-model-invocation: true`. A typed skill never calls another typed skill. It tells the user the next command to type.
- An agent skill is a skill that the agent can load on its own. If the agent or another skill must reach a skill alone, make it an agent skill. Do not make any other skill an agent skill. If the user starts the skill by hand, make it a typed skill.
- The description of a typed skill is one short line for the user. It has no list of triggers.
- The description of an agent skill is in the third person. It says the job in a few words, then when to use the skill. It uses the words that users type. It has a "Do NOT use for" line when a neighbor skill overlaps. It never lists the steps. Aim for fewer than 500 characters.
- A skill never tells the agent which model to use. The human picks the model.
- Keep `SKILL.md` short. The lint limit is 150 lines, which is stricter than the playbook limit of 500. Put critical rules near the top, under a heading such as `## Important`.
- Move long reference material to a file beside `SKILL.md`. Link to it straight from `SKILL.md` and say when to read it. Do not link from one reference file to another. Start a reference file that has more than 100 lines with a list of contents.
- If a skill runs a script, put the script inside the skill folder. The installer copies only skill folders.
- Every rule that matters ends with one of these lines:
  - `Held by: <path to the script, hook or test that enforces it>`
  - `No fence yet` (nothing enforces it, so it is only an instruction)
- Each skill ends with a `## Provenance` section. It names each source file, its repo, its license and its copyright holder, and says what we changed.
- Each skill has at least 3 evals in `evals/<name>/`. An eval has the user prompt, the setup, a checklist of expected behaviors, and a description of a failure. A typed skill needs one eval for each kind of task that it sorts. It also needs one eval for a request that it must refuse. An agent skill needs one eval where it must load. It also needs one eval where one option is obvious, and one eval where it must not load. Run each eval live on a fresh instance before you ship. If an eval fails, fix the skill and run the eval again.
- Every eval result in a test report names the model that ran it. No fence yet

## Differences from the playbook

- The playbook asks for `metadata.version` in the frontmatter. Our linter reads only flat `key: value` lines, so a nested key fails the lint. We do not use `metadata.version` until the linter supports it.
- The playbook sets 500 lines as the size limit. The lint limit of 150 lines is stricter, and it stays.

## Reuse rules

- Copy and adapt from any of the four source repos, rstack included. Take only the pieces we need.
- Record every source in the `## Provenance` section of the skill and in `NOTICE`. Give the repo, the path, the author, and the license that the file carries (or "no license file").
- If a source file ships a license notice (MIT files, `rstack/before-and-after`), keep that notice in `NOTICE`.
- Remove everything that belongs to the setup of one author. This means Kody, Greptile, Effect, XState, Alchemy, Cloudflare, rat-stack file paths, site links.

## Writing

Write all text in Simplified Technical English (ASD-STE100 Issue 9), strict mode, plus the house rules below. Each rule says if it is an STE rule or a house rule.

`scripts/style-lint.mjs` checks many of these rules, and each finding names its basis. No tool can prove that text follows STE. A clean lint run means only that the lint found nothing.

STE rules:

- Use 20 words or fewer for an instruction (STE 5.1). Use 25 words or fewer for a description (STE 6.3).
- Write one instruction per sentence (STE 5.2). Use the imperative (STE 5.3). Put the condition before the command (STE 5.4).
- Use only the modals `can`, `will` and `must` (STE dictionary).
- Use the active voice (STE 3.6) and simple tenses (STE 3.2). Do not use contractions (STE 4.2).
- Use no semicolons (STE 8.1).
- Use one word for one concept (STE 1.11). Explain a coined term the first time it appears.
- Say what a thing does (STE 4.1).
- Use American spelling (STE 1.14), for example behavior, license, color, organize and catalog. Keep code, commands, paths, file names and quoted source text exactly as they are.
- A ticket is our unit of work. An issue is the object in GitHub or GitLab that holds a ticket. These are two concepts, so use each word only for its own meaning (STE 1.11).

House rules, from the owner's slop ban list:

- Use no em dashes, no en dashes and no spaced hyphens as dashes.
- Do not write "not X but Y" or other negation framing, such as `not just` or `rather than`.
- Do not use filler words, hype words or mannered metaphors, such as `seamless` or `navigate`.
- Do not start a bullet with a bold label. Do not put bold text in the middle of a sentence.
- Do not start a sentence with a stiff transition, such as `Moreover` or `Thus`. STE approves `thus`, but this house rule bans it at the start of a sentence.
- Do not use exclamation marks, curly quotes, arrow characters or emoji in prose.

Declared exception: use `check` as a verb. STE approves `check` only as a noun.

## Code

- Node 22 or later, ESM (`.mjs`), no runtime dependencies.
- Bun runs the commands for development and CI. Hooks and installed scripts run on Node in a project repo.
- Run the tests with `bun run test`. Run the same tests on Node with `npm run test:node`.
- Scripts make every decision that a script can check. Exit codes say why a script stopped.
- A hook that must block does so with exit code 2. A hook that cannot read its input blocks.
- Every script and hook has tests. To prove a new check, plant a bug, watch the test fail, then restore the code.

## License

This repo is MIT. See `LICENSE`. Material from other projects keeps its own license, listed in `NOTICE`.
