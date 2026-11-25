# Eval diagnose/01: a failing test with a planted bug

## Prompt

```
npm test fails in this repo and I do not know why. Diagnose it, then fix it.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit with these files:
  - `package.json` with `"type": "module"` and the script `"test": "node --test"`.
  - `src/slug.mjs` with `export function slugify(text) { return text.trim().toLowerCase().replace(" ", "-").replace(/[^a-z0-9-]/g, ""); }`. The `replace(" ", "-")` call is the planted bug: it replaces only the first space.
  - `test/slug.test.mjs` with two tests. Test 1: `slugify("Hello big World")` must equal `"hello-big-world"`. Test 2: `slugify("Hi, there!")` must equal `"hi-there"`. Test 1 fails and test 2 passes.
- Allowed tools: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Skill`, `Bash(npm test:*)`, `Bash(node:*)`, `Bash(git diff:*)`, `Bash(grep:*)`. The agent needs `node` to run its experiments and probes.

## Expected behaviors

- [ ] The agent loads the `diagnose` skill (a `Skill` tool call with `diagnose`), or its first actions follow the skill.
- [ ] The first command that the agent runs is `npm test` or `node --test`, and it goes red on `slugify("Hello big World")`. This happens before the agent states any theory and before any edit. The reply prints `Red command:`.
- [ ] The agent can test its first cause at once. The first cause is right here, so the agent does not need a `Ranked causes:` list. A list does no harm.
- [ ] The agent changes one thing per experiment. No experiment edits two files at once.
- [ ] The agent writes a notebook file (`diagnose-*.md` under `$TMPDIR/sstack/` or `/tmp`). The file has at least one entry with the cause tested, the command, the result and a verdict.
- [ ] The agent names the cause: `replace(" ", "-")` replaces only the first space.
- [ ] The agent writes the regression test before the fix, or says that the existing failing test already is the regression test. It loads `test-craft` (a `Skill` tool call with `test-craft`), or it says that the skill did not load.
- [ ] After the fix, `npm test` passes. The agent reruns the Phase 1 command and reports the result.
- [ ] No debug prefix such as `[DEBUG-` is left in any file.

## Failure looks like

- The agent reads `src/slug.mjs`, says "the bug is the replace call" and edits it before it runs any test.
- The agent edits several things in one step and cannot say which one fixed the bug.
- The agent keeps no notebook.
- The agent never loads the skill and answers in free form.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "fix/slugify",
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"slug-demo\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/slug.mjs",
        "content": "export function slugify(text) { return text.trim().toLowerCase().replace(\" \", \"-\").replace(/[^a-z0-9-]/g, \"\"); }\n"
      },
      {
        "path": "test/slug.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.mjs\";\n\ntest(\"slugify joins every word with a hyphen\", () => {\n  assert.equal(slugify(\"Hello big World\"), \"hello-big-world\");\n});\n\ntest(\"slugify drops punctuation\", () => {\n  assert.equal(slugify(\"Hi, there!\"), \"hi-there\");\n});\n"
      }
    ]
  },
  "prompt": "npm test fails in this repo and I do not know why. Diagnose it, then fix it.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
    "Skill",
    "Bash(npm test:*)",
    "Bash(node:*)",
    "Bash(git diff:*)",
    "Bash(grep:*)"
  ],
  "budgetUsd": 3,
  "assert": {
    "skillLoaded": [
      "diagnose",
      "test-craft"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "npm test|node --test"
      },
      {
        "name": "Write",
        "inputMatches": "diagnose-[^\"]*\\.md"
      }
    ],
    "toolOrder": [
      {
        "before": {
          "name": "Bash",
          "inputMatches": "npm test|node --test"
        },
        "after": "Edit"
      }
    ],
    "outputMatches": [
      "Red command:",
      "/replace[^\\n]{0,80}(first|one|single)[^\\n]{0,40}(space|match|occurrence)|(first|only one)[^\\n]{0,40}(space|match|occurrence)/i"
    ],
    "fileMatches": [
      {
        "path": "src/slug.mjs",
        "pattern": "^(?![\\s\\S]*replace\\(\" \", \"-\"\\))(?![\\s\\S]*\\[DEBUG-)[\\s\\S]*slugify[\\s\\S]*\"-\""
      },
      {
        "path": "test/slug.test.mjs",
        "pattern": "^(?![\\s\\S]*\\[DEBUG-)[\\s\\S]*Hello big World"
      }
    ]
  }
}
```

Not machine-checked:

- `npm test` is the first command. The check sees only that it comes before the first edit.
- Each experiment changes one thing.
- The notebook entry has all fields.
- The regression test comes before the fix.
- `npm test` passes at the end.

The runner cannot order text against tool calls, count calls or run a command after the agent stops. Eval 04 checks the ranked list for the case where the first fix leaves the command red.
