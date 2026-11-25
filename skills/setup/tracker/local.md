# Tracker: local files

Tracker: local
Written by: the `setup` workflow on <YYYY-MM-DD>. If the layout changes, edit this file by hand.

Specs and tickets for this repo are markdown files under `.scratch/`. There is no command line tool. Every action is a file edit.

## Layout

- One folder per feature: `.scratch/<feature>/`. `<feature>` is a short lowercase name with dashes, such as `csv-export`.
- The spec is `.scratch/<feature>/spec.md`.
- Tickets are one file each at `.scratch/<feature>/tickets/NN-title.md`, numbered from `01`, blockers first. `NN-title` is the number, a dash and the title in lowercase words joined by dashes, such as `01-login-form.md`. Never put more than one ticket in a file.
- Reports from other people are files in `.scratch/reports/`, one file for each report, named `NN-title.md`. The `triage` skill reads them.

## Actions

- Create an issue: write a new file at the path above. If the folder is missing, create it. If the file already exists, stop and ask the user.
- Read an issue: read the file. The user normally gives the path or the ticket number.
- List open issues: the files whose `Status:` line is not `closed`.
- Comment: append the text under a `## Comments` heading at the bottom of the file.
- Add a label: there are no labels. Add the word to a `Labels:` line near the top of the file. If the line is missing, create it.
- Link a blocker: the `Blocked by:` line near the top names the blocking ticket files in the same folder. Separate the names with commas, such as `Blocked by: 01-login-form.md, 02-session-store.md`. With no blockers it says `Blocked by: None (can start immediately)`. The scripts also read the older form `none`. A ticket is unblocked when every file it names has `Status: closed`, and the work of each is in `origin/main`.
- Make a sub-issue: a ticket belongs to the spec in its feature folder. Its `Spec:` line points to `../spec.md`.
- Close an issue: append the reason under `## Comments`, then set `Status: closed`.

## Publish a spec

Write `.scratch/<feature>/spec.md`.

## Publish tickets

Write one file for each ticket under `.scratch/<feature>/tickets/`, blockers first, numbered from `01`.

## Fetch a spec or ticket

Read the file at the path the user gives. A bare number such as `03` means the file in `tickets/` that starts with `03-`.

<!-- Provenance: adapted from skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md in mattpocock/skills (MIT, Copyright (c) 2026 Matt Pocock). See NOTICE and skills/setup/SKILL.md. -->
