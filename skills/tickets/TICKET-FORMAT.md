# Ticket format

The templates for [SKILL.md](SKILL.md). The tickets are the same on every tracker. Only the way that blockers and the spec link are written changes.

## Local file

One file per ticket at `.scratch/<feature>/tickets/NN-title.md`, in the same feature folder as the spec. Number the files from `01` in dependency order, blockers first. No two files share a number. `NN-title` is the number, a dash and the title in lowercase words joined by dashes.

```markdown
# 01: <Ticket title>

Blocked by: None (can start immediately)
Status: open
Labels: ready-for-agent
Spec: ../spec.md
Evidence level: <the level from the handoff note of /start, or behavior>

## What to build

The end-to-end behavior that this ticket makes work, from the user's side. Describe what the user can do or see when the ticket is done. Leave out layer-by-layer steps.

## Acceptance checks

- [ ] <What to observe, and at which test boundary. It fails before this ticket's work and passes after it.>
- [ ] <Another check>
```

The `Labels:` line holds the triage state, as in a local report. Write the label of the `ready-for-agent` role from `docs/agents/triage-labels.md`. The `Status:` line says only `open` or `closed`.

The `Blocked by:` line says `None (can start immediately)`, or names the blocking ticket files in the same folder, separated by commas. The scripts also read the older form `none`:

```markdown
Blocked by: 01-login-form.md, 02-session-store.md
```

`skills/tickets/scripts/tickets-lint.mjs` checks these files. In a project, run it from the project root as `node .claude/skills/tickets/scripts/tickets-lint.mjs`. It checks the file name, a number that no other ticket in the folder uses, and the `# ` title. It checks at least one `- [ ]` item under `## Acceptance checks`. It checks one `Blocked by:` line that names files that exist or says `None (can start immediately)`. It checks that the ticket with the lowest number has no blockers, and that no blocking cycle exists. With `--max <n>`, it checks that one folder holds n ticket files or fewer. With no `--max`, there is no cap. It does not check the `Status:` and `Spec:` lines. Held by: skills/tickets/scripts/tickets-lint.mjs

## GitHub or GitLab issue

Title: the ticket title. Body:

```markdown
Part of #<spec>
Blocked by: #<n>, #<n>
Evidence level: <the level from the handoff note of /start, or behavior>

## What to build

The end-to-end behavior that this ticket makes work, from the user's side.

## Acceptance checks

- [ ] <Check>
- [ ] <Check>
```

- Add the label of the `ready-for-agent` role to the issue. The body holds no label.
- If the ticket is a sub-issue of the spec, leave out the `Part of` line.
- If the blockers are native links, leave out the `Blocked by` line. If there are no blockers and no native links, write `Blocked by: None (can start immediately)`.

## Provenance

Adapted from the `<local-ticket-template>` and `<issue-template>` in `skills/engineering/to-tickets/SKILL.md` of [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). Kept: the `# NN: title` heading, "What to build" and its wording about end-to-end behavior, the checkbox list, the blockers line, one file per ticket, and "omit the blocked-by section when the edges are native". Changed: "Acceptance criteria" became "Acceptance checks", each check must fail before the work, his `Status: ready-for-agent` became two lines, `Status: open` for `/build` and `Labels: ready-for-agent` for `triage`, blockers are named by file name so a script can check them, the folder is `tickets/` in place of `issues/`, the `## Parent` section became a `Part of` line, and a `Spec:` line was added.
