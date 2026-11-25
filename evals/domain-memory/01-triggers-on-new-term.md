# Eval domain-memory-01: triggers and writes a settled term

Kind: triggering and functional. A project term is settled in conversation. The skill must load and write one glossary entry in the right format.

## User prompt

```
We settled it: a "Partial cancellation" is when a Customer cancels some lines of an Order after the Order was dispatched. Add it to our glossary. People also call it a "line cancel", but we do not want to use that name.
```

## Setup

- A fresh temp git repo with the stack installed.
- Replace `GLOSSARY.md` in the repo root with:

```md
# Ordering

Receives and tracks customer orders.

## Language

**Order**:
A request from a Customer for goods, with one or more lines.
_Avoid_: Purchase

**Customer**:
A person or organization that places an **Order**.
_Avoid_: Client, buyer

**Cancellation**:
The end of a whole **Order** before it is dispatched.
_Avoid_: Void
```

- The installed `AGENTS.md` makes the agent work in a new worktree under `.claude/worktrees/`. Look for the changed file there.
- Tools allowed: `Skill Read Glob Grep Edit(GLOSSARY.md) Write(GLOSSARY.md)`.

## Expected behavior

- [ ] The agent calls the Skill tool with `domain-memory`.
- [ ] `GLOSSARY.md` gains a `**Partial cancellation**` entry in the file format: bold term, a colon, the definition on the next line, and an `_Avoid_: line cancel` line.
- [ ] The definition is one or two sentences, says what the thing is, and bolds the other glossary terms it uses (`**Customer**`, `**Order**`).
- [ ] The entry has no code detail (no file names, function names, tables or settings).
- [ ] The existing entries are unchanged.
- [ ] The reply shows the change in one line, so the user can correct it.
- [ ] No file other than `GLOSSARY.md` is created. No decision record is written, because the user did not state a hard-to-reverse decision.

## What a failure looks like

- The agent edits `GLOSSARY.md` by hand without loading the skill, and the entry misses `_Avoid_` or the bold terms.
- The definition is three or more sentences, or it names code.
- The agent creates `docs/adr/` records for a plain term.
- The agent rewrites or reorders existing entries.

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

Path rules did not match in headless runs, so `Write` and `Edit` are bare. The `toolNotCalled` checks hold the scope.

The installed `AGENTS.md` asks for a worktree, and Opus makes one with the `EnterWorktree` tool in each run. The root `GLOSSARY.md` then stays as it was. So the new entry is checked in the input of the `Edit` call, and the `fileMatches` checks only guard the root file. If the agent adds the entry with `Write`, the `Edit` check fails on a correct run.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Ordering\n\nReceives and tracks customer orders.\n\n## Language\n\n**Order**:\nA request from a Customer for goods, with one or more lines.\n_Avoid_: Purchase\n\n**Customer**:\nA person or organization that places an **Order**.\n_Avoid_: Client, buyer\n\n**Cancellation**:\nThe end of a whole **Order** before it is dispatched.\n_Avoid_: Void\n" }
    ]
  },
  "prompt": "We settled it: a \"Partial cancellation\" is when a Customer cancels some lines of an Order after the Order was dispatched. Add it to our glossary. People also call it a \"line cancel\", but we do not want to use that name.",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Edit", "Write"],
  "assert": {
    "skillLoaded": ["domain-memory"],
    "fileMatches": [
      { "path": "GLOSSARY.md", "pattern": "A request from a Customer for goods, with one or more lines\\.\\n_Avoid_: Purchase" },
      { "path": "GLOSSARY.md", "pattern": "The end of a whole \\*\\*Order\\*\\* before it is dispatched\\.\\n_Avoid_: Void" },
      { "path": "GLOSSARY.md", "pattern": "^# Ordering" }
    ],
    "toolCalled": [
      { "name": "Edit", "inputMatches": "/\"file_path\":\"[^\"]*GLOSSARY\\.md\"[\\s\\S]*\\*\\*Partial cancellation\\*\\*:\\\\n(?=(?:(?!\\\\n).)*\\*\\*Customer\\*\\*)(?=(?:(?!\\\\n).)*\\*\\*Order\\*\\*)(?:(?!\\\\n).)+\\\\n_Avoid_: line cancel/i" }
    ],
    "toolNotCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"(?![^\"]*GLOSSARY\\.md\")" },
      { "name": "Edit", "inputMatches": "\"file_path\":\"(?![^\"]*GLOSSARY\\.md\")" },
      { "name": "Write", "inputMatches": "docs/adr" },
      { "name": "Edit", "inputMatches": "docs/adr" },
      { "name": "Write", "inputMatches": "\\.mjs|src/|function |\\btable\\b" },
      { "name": "Edit", "inputMatches": "\\.mjs|src/|function |\\btable\\b" }
    ],
    "outputMatches": [
      "Partial cancellation"
    ]
  }
}
```

Not machine-checked: the definition length and clarity. The one-line change in the reply. The `outputMatches` check sees only the term name, not the one-line summary.

- If the agent edits `GLOSSARY.md` without the skill, `skillLoaded` fails.
- If the entry lacks `_Avoid_: line cancel`, or its definition does not bold `**Customer**` and `**Order**`, the `Edit` check fails.
- If the entry names code or a file, the `toolNotCalled` code check fails.
- If the agent creates a decision record, the `docs/adr` checks fail.
- If the agent rewrites existing entries in the root file, the `fileMatches` checks for them fail. In a worktree, a person must check this.
