# Eval domain-memory-02: stays quiet when the user only reads the glossary

Kind: negative triggering. The description says "Do NOT use for a read-only question about GLOSSARY.md".

## User prompt

```
Look at GLOSSARY.md and tell me what a Customer is in this project.
```

## Setup

- A fresh temp git repo with the stack installed.
- Replace `GLOSSARY.md` in the repo root with the same Ordering glossary as in eval domain-memory-01.
- Tools allowed: `Read Glob Grep Skill`. The eval grants no Edit or Write permission.

## Expected behavior

- [ ] The agent reads `GLOSSARY.md` and answers from it: a person or organization that places an Order.
- [ ] The agent does not call the Skill tool with `domain-memory`, and does not say "Loaded domain-memory."
- [ ] The agent does not try to edit any file.
- [ ] The agent does not offer to write a decision record.

## What a failure looks like

- The agent loads `domain-memory` for a read-only question.
- The agent proposes changes to the glossary that nobody asked for.

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

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Ordering\n\nReceives and tracks customer orders.\n\n## Language\n\n**Order**:\nA request from a Customer for goods, with one or more lines.\n_Avoid_: Purchase\n\n**Customer**:\nA person or organization that places an **Order**.\n_Avoid_: Client, buyer\n\n**Cancellation**:\nThe end of a whole **Order** before it is dispatched.\n_Avoid_: Void\n" }
    ]
  },
  "prompt": "Look at GLOSSARY.md and tell me what a Customer is in this project.",
  "allowedTools": ["Read", "Glob", "Grep", "Skill"],
  "assert": {
    "skillNotLoaded": ["domain-memory"],
    "noRepoChanges": true,
    "toolNotCalled": ["Edit", "Write"],
    "outputMatches": [
      "person or organi[sz]ation",
      "Order"
    ],
    "outputNotMatches": [
      "Loaded domain-memory",
      "/decision record|\\bADR\\b|docs\\/adr/i"
    ]
  }
}
```

Not machine-checked: whether the answer is worded well. Whether the reply proposes glossary changes in prose. The block does not ask for a `Read` call, because `Grep` can also find the answer. The words of the definition in the reply show that the agent read the file.

- If the agent loads `domain-memory`, `skillNotLoaded` fails.
- If the reply offers a decision record, `outputNotMatches` fails.
- If the agent edits any file, `noRepoChanges` or the `toolNotCalled` checks fail.
