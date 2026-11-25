# The out-of-scope records

The folder `.out-of-scope/` in a project keeps a record of each rejected enhancement. Read this file in step 1 of [SKILL.md](SKILL.md), and again before you close a rejected enhancement.

The records do two jobs:

- They keep the reason for a rejection after the issue is closed.
- They stop a second argument about the same request. A new issue that matches an old rejection gets the old decision.

## One file for each idea

Write one file for each idea, and one idea can collect many issues. Give it a short name in lowercase words joined by dashes, such as `dark-mode.md` or `plugin-system.md`. A reader must know from the name what was rejected.

Write the file as a short design note. Use plain paragraphs and, if it helps, a small code sample. Use this shape:

```markdown
# Dark mode

This project does not support dark mode or user themes.

## Why this is out of scope

The renderer uses one color palette that it reads at build time. A second theme needs a theme context around every component and a store for the choice of each user. That is a large change, and it does not fit the focus of the project on content.

## Prior requests

- #42: "Add dark mode support"
- #87: "Night theme for accessibility"
```

The reason must last. Name the scope of the project, a technical limit or a strategic choice. "We are busy now" is not a rejection. It is a delay, so do not record it here.

## When to read the records

In step 1, read every file in `.out-of-scope/`. Match by idea, not by words: "night theme" matches `dark-mode.md`. If a file matches, show it to the maintainer with its reason. Ask if that decision still stands. The maintainer has three choices:

- Confirm: add the new issue to "Prior requests" of the file. Then close the issue as a rejected enhancement.
- Reconsider: delete or update the file. Then triage the issue as normal.
- Disagree that they match: triage the issue as normal.

## When to write a record

If the maintainer rejects an enhancement as `wontfix`, write a record. Write one in no other case. Do not write one for a bug. Do not write one for a feature that exists already. That feature is built, not rejected, and a record of it gives false matches later. For that case, the Triage Decision points to the place where the feature lives.

The steps:

1. Look for a file that matches the idea.
2. If one exists, add the issue to its "Prior requests" list.
3. If none exists, write a new file with the idea, the decision, the reason and the first request.
4. Post the Triage Decision. Name the file on its `Where:` line.
5. Close the issue with the `wontfix` label.

If the maintainer changes a decision later, delete the file. Do not open the old issues again. They are history.

## Provenance

Adapted from `skills/engineering/triage/OUT-OF-SCOPE.md` of [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). Kept: the two purposes, one file for each idea, the dash names, the short design note with a reason that lasts, matching by idea, the three choices of the maintainer, no record for a bug or for a feature that exists, the write steps and the delete rule. Changed: the example is shorter, the decision goes in a Triage Decision comment, and the PR rule is removed.
