# Eval grill-08: does not load domain-memory outside a project repo

Kind: negative. A grill runs in a folder that is not a project repo. The agent must not load `domain-memory`, must not say "Loaded domain-memory.", and must write no file. It keeps terms and decisions for the summary.

## User prompt

```
Grill me on this plan: I want to rewrite my cover letter for a design lead role. I will lead with my last project.
```

## Setup

- A fresh temp folder that is not a git repo. It has no `GLOSSARY.md` and no `docs/adr/`.
- Copy `skills/` of the stack to `.claude/skills/` in that folder, with `cp -R`. Do not run the installer, because it needs a git repo.
- Tools allowed: `Skill Read Glob Grep`.
- The runner needs a git repo for `installStack`, so it cannot run this eval. This block has no `## Checks`. It is manual only. This is a runner gap.

## Expected behavior

- [ ] The agent calls the Skill tool with `grill`.
- [ ] The agent does not call the Skill tool with `domain-memory`.
- [ ] No text says "Loaded domain-memory."
- [ ] The first text of the run is the status line `Round 1. N questions.`
- [ ] Each question has a `Recommended:` line.
- [ ] No file is written or edited.

## What a failure looks like

- The agent loads `domain-memory` for a cover letter.
- The agent says "Loaded domain-memory." in round 1.
- The agent creates `GLOSSARY.md` or `docs/adr/`.

## How to run

```
cd "$(mktemp -d)" && mkdir -p .claude && cp -R <stack>/skills .claude/skills
claude -p "<user prompt>" --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format stream-json --verbose --no-session-persistence --max-budget-usd 1.5 \
  --allowedTools Skill,Read,Glob,Grep </dev/null
```

Read the transcript. Mark each expected behavior pass or fail. Run this eval twice.
