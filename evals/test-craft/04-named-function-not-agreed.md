# Eval test-craft/04: a named function is not an agreed boundary

## Prompt

```
Build a parsePrice function test-first in src/price.mjs. It takes the text that shop staff type, such as "$1,234.50" or "12", and returns integer cents. Text that is not a price throws.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit with these files:
  - `package.json` with `"type": "module"` and the script `"test": "node --test"`.
  - `src/price.mjs` with `export function formatPrice(cents) { return "$" + (cents / 100).toFixed(2); }`.
  - `test/price.test.mjs` with one passing test for `formatPrice`.
- Allowed tools: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Skill`, `Bash(npm test:*)`, `Bash(node --test:*)`. The edit tools are allowed, so a test written too early shows in the transcript.

## Expected behaviors

- [ ] The agent loads the `test-craft` skill (a `Skill` tool call with `test-craft`).
- [ ] Before it writes any file, the agent proposes a test boundary. An example is the export `parsePrice` of `src/price.mjs`.
- [ ] For each proposed boundary, the agent says what it catches, what it misses, and how slow it is.
- [ ] The agent asks the user to confirm and stops. It writes no test and no code in this reply.

## Failure looks like

- The agent takes the function name in the prompt as an agreed boundary and writes the first test. A live run on 25 Nov 2026 did this.
- The agent writes a stub for `parsePrice` before it asks.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "feat/parse-price",
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"price-demo\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/price.mjs",
        "content": "export function formatPrice(cents) { return \"$\" + (cents / 100).toFixed(2); }\n"
      },
      {
        "path": "test/price.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { formatPrice } from \"../src/price.mjs\";\n\ntest(\"formatPrice shows dollars\", () => {\n  assert.equal(formatPrice(123450), \"$1234.50\");\n});\n"
      }
    ]
  },
  "prompt": "Build a parsePrice function test-first in src/price.mjs. It takes the text that shop staff type, such as \"$1,234.50\" or \"12\", and returns integer cents. Text that is not a price throws.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
    "Skill",
    "Bash(npm test:*)",
    "Bash(node --test:*)"
  ],
  "budgetUsd": 1.5,
  "assert": {
    "skillLoaded": ["test-craft"],
    "toolNotCalled": ["Write", "Edit"],
    "fileNotMatches": [
      { "path": "src/price.mjs", "pattern": "parsePrice" },
      { "path": "test/price.test.mjs", "pattern": "parsePrice" }
    ],
    "outputMatches": [
      "/boundar|where (?:the )?tests? (?:go|live|sit)/i",
      "/catch/i",
      "/miss/i",
      "\\?"
    ]
  }
}
```

What each check catches:

- A test or a stub written before the confirm fails `toolNotCalled`, also in a worktree.
- A `parsePrice` in the root files fails `fileNotMatches`.
- A reply with no proposed boundary, no "catches" and "misses" lines, or no question fails `outputMatches`. The boundary check also takes "where the tests go", because an Opus run used those words for a correct proposal.

Not machine-checked: the speed note for each boundary, and whether the agent waits for the answer before it goes on.
