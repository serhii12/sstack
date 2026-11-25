# Eval test-craft/01: a new function with tests

## Prompt

```
Add a function titleCase(text) to src/text.mjs. It makes the first letter of each word a capital letter and the rest lower case. Use test-first work. The test boundary is the exported function. I agree to that boundary.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit with these files:
  - `package.json` with `"type": "module"` and the script `"test": "node --test"`.
  - `src/text.mjs` with `export function trimAll(text) { return text.trim(); }`.
  - `test/text.test.mjs` with one passing test for `trimAll`.
- Allowed tools: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Skill`, `Bash(npm test:*)`, `Bash(node --test:*)`, `Bash(git diff:*)`, `Bash(git status:*)`.

## Expected behaviors

- [ ] The agent loads the `test-craft` skill (a `Skill` tool call with `test-craft`).
- [ ] The agent does not ask the user to confirm the boundary again.
- [ ] The agent writes the new test before it writes the code for `titleCase`. The test file edit comes first in the transcript.
- [ ] The agent runs the test and shows it fail on the right symptom: an assertion about the missing behavior. If the first red comes from an import error or a missing export, the agent says that this is the wrong red and fixes it.
- [ ] The expected values in the test are literals, for example `"Hello World"`. The test does not compute the answer with the same logic as the code.
- [ ] The test uses no mock of your own modules.
- [ ] The agent writes only enough code to pass, and runs the test again to show it pass.
- [ ] The agent plants a bug (it flips a condition or deletes a line) and shows the new test fail with a message about that behavior.
- [ ] The agent restores the code, shows a diff or status with no leftover break, and shows the test pass again.
- [ ] The final reply reports the three runs (clean, planted bug, restored).

## Failure looks like

- The agent writes `titleCase` first and the test after.
- The agent never runs the test while the code is missing.
- The agent skips the planted bug, or plants it and does not restore the code.
- Code that copies the implementation computes the expected value in the test.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "feat/title-case",
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"text-demo\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/text.mjs",
        "content": "export function trimAll(text) { return text.trim(); }\n"
      },
      {
        "path": "test/text.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { trimAll } from \"../src/text.mjs\";\n\ntest(\"trimAll removes outer spaces\", () => {\n  assert.equal(trimAll(\"  hi  \"), \"hi\");\n});\n"
      }
    ]
  },
  "prompt": "Add a function titleCase(text) to src/text.mjs. It makes the first letter of each word a capital letter and the rest lower case. Use test-first work. The test boundary is the exported function. I agree to that boundary.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
    "Skill",
    "Bash(npm test:*)",
    "Bash(node --test:*)",
    "Bash(git diff:*)",
    "Bash(git status:*)"
  ],
  "budgetUsd": 3,
  "assert": {
    "skillLoaded": [
      "test-craft"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "npm test|node --test"
      }
    ],
    "fileMatches": [
      {
        "path": "src/text.mjs",
        "pattern": "export function titleCase"
      },
      {
        "path": "src/text.mjs",
        "pattern": "export function trimAll"
      },
      {
        "path": "test/text.test.mjs",
        "pattern": "titleCase\\("
      },
      {
        "path": "test/text.test.mjs",
        "pattern": "[\"'][A-Z][a-z]+( +[A-Z][a-z]+)+[\"']"
      },
      {
        "path": "test/text.test.mjs",
        "pattern": "^(?![\\s\\S]*(mock\\.|\\.mock|jest\\.|sinon|spyOn))[\\s\\S]*titleCase"
      }
    ],
    "outputMatches": [
      "/pass|green/i",
      "/planted|plant(ed)? a bug|broke|break|mutat/i",
      "/restor|revert|put back/i"
    ]
  }
}
```

Not machine-checked:

- The agent writes the test before the code.
- The first red is the right red.
- How many times the agent runs the test.
- The agent plants the bug and the test fails on it.
- The agent restores the code with no leftover break.

The runner cannot order events or count calls.
