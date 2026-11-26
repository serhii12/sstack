# Eval domain-memory-03: writes a decision record in the right form

Kind: functional. The user states a final, hard-to-reverse decision outside a grill. The skill must write one record that passes the three tests and follows the format. The user names no condition to revisit the decision, so the record has no `## Revisit if` section.

## User prompt

```
This is final: we will not use an ORM in this project. We write SQL by hand. The team knows SQL well, and ORM migrations caused two outages last year. Please record the decision.
```

## Setup

- A fresh temp git repo with the stack installed. The install creates `docs/adr/0000-template.md`.
- Add `docs/adr/0001-event-sourced-orders.md` with this content:

```md
# 0001: Event-sourced orders

**Status:** accepted
**Date:** 2026-03-02

Orders are stored as events, because we need a full audit trail.

## Revisit if

The audit trail rule is dropped.
```

- The installed `AGENTS.md` makes the agent work in a new worktree under `.claude/worktrees/`. Look for the changed file there.
- Tools allowed: `Skill Read Glob Grep Edit(docs/adr/*) Write(docs/adr/*)`.

## Expected behavior

- [ ] The agent calls the Skill tool with `domain-memory`.
- [ ] The agent creates exactly one new file named `docs/adr/0002-<short-title>.md`. The number is `0002`.
- [ ] The file starts with `# 0002:` and a short title.
- [ ] The file has the line `**Status:** accepted` in that exact form, because the user stated the decision as final outside a grill. It has no `Status:` heading, no frontmatter and no plain `Status:` line.
- [ ] The file has a `**Date:**` line.
- [ ] The file has no `## Revisit if` section, because the user named no condition. The agent invents none.
- [ ] The record states the decision as what not to do (for example "Do not add an ORM") and gives the reason from the user.
- [ ] The record is half a page or shorter.
- [ ] `0001-event-sourced-orders.md` and `0000-template.md` are unchanged.
- [ ] `GLOSSARY.md` is not changed, because no new project term was settled.

## What a failure looks like

- The status line is `Status: accepted` with no bold, or a `## Status` heading, or `proposed`.
- The agent numbers the file `0001` or `0000`, or overwrites an existing record.
- The record has a `## Revisit if` section with a condition that the user did not give.
- The record runs to several pages, with sections for options and consequences that carry no content.
- The agent edits the old record.

## How to run

```
cd "$(mktemp -d)" && git init -q && git commit -q --allow-empty -m init
node <stack>/scripts/install.mjs "$PWD"   # then add the setup files and commit them
claude -p "<user prompt>" --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format stream-json --verbose --no-session-persistence --max-budget-usd 1 \
  --allowedTools <tools above> </dev/null
```

Read the transcript. Mark each expected behavior pass or fail. For a baseline, delete `.claude/skills` from the temp repo and run again.

## Checks

Path rules did not match in headless runs, so `Write` and `Edit` are bare. The `toolNotCalled` checks hold the scope. No worktree is made, because the runner gives no Bash. The record goes in the repo root.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "docs/adr/0001-event-sourced-orders.md", "content": "# 0001: Event-sourced orders\n\n**Status:** accepted\n**Date:** 2026-03-02\n\nOrders are stored as events, because we need a full audit trail.\n\n## Revisit if\n\nThe audit trail rule is dropped.\n" }
    ]
  },
  "prompt": "This is final: we will not use an ORM in this project. We write SQL by hand. The team knows SQL well, and ORM migrations caused two outages last year. Please record the decision.",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Edit", "Write"],
  "assert": {
    "skillLoaded": ["domain-memory"],
    "toolCalled": [
      { "name": "Write", "inputMatches": "docs/adr/0002-" },
      { "name": "Write", "inputMatches": "\"content\":\"# 0002: " },
      { "name": "Write", "inputMatches": "\\*\\*Status:\\*\\* accepted" },
      { "name": "Write", "inputMatches": "\\*\\*Date:\\*\\*" },
      { "name": "Write", "inputMatches": "[Dd]o not[^\"]{0,40}ORM" },
      { "name": "Write", "inputMatches": "outage" }
    ],
    "toolNotCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"[^\"]*docs/adr/(?!0002-)" },
      { "name": "Edit", "inputMatches": "\"file_path\":\"[^\"]*docs/adr/" },
      { "name": "Write", "inputMatches": "Status: (accepted|proposed|superseded)" },
      { "name": "Write", "inputMatches": "\\*\\*Status:\\*\\* proposed" },
      { "name": "Write", "inputMatches": "## Status" },
      { "name": "Write", "inputMatches": "## Revisit if" },
      { "name": "Write", "inputMatches": "\"content\":\"---" },
      { "name": "Write", "inputMatches": "\"content\":\"(?:[^\"\\\\]|\\\\.){1600,}" },
      { "name": "Write", "inputMatches": "\"file_path\":\"[^\"]*GLOSSARY" },
      { "name": "Edit", "inputMatches": "\"file_path\":\"[^\"]*GLOSSARY" }
    ],
    "outputMatches": [
      "docs/adr/0002-"
    ]
  }
}
```

Not machine-checked: the wording. The length check uses 1600 characters as a proxy for half a page. The `toolCalled` checks match each part on its own, so a person must confirm that one file holds all parts.

The path checks read only the `file_path` field. A record can name `docs/adr/0001` in its text and still pass.

- If the record is numbered `0001` or `0000`, the `docs/adr/(?!0002-)` check fails.
- If the status line has another form, the `Status:` checks fail.
- If the record has a `## Revisit if` section, the `toolNotCalled` check fails. The user named no condition.
- If the agent edits the old record or `GLOSSARY.md`, the `toolNotCalled` checks fail.
- If the record has no "do not" line about an ORM, or no outage reason, the `toolCalled` checks fail.
