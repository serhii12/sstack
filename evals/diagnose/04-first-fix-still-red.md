# Eval diagnose/04: the first fix leaves the command red

## Prompt

```
npm test fails in this repo and I do not know why. Diagnose it, then fix it.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit on branch `fix/slugify-crash` with these files:
  - `package.json` with `"type": "module"` and the script `"test": "node --test"`.
  - `src/slug.mjs`. `slugify` calls `replaceAll(/ /, "-")`. A regular expression with no `g` flag makes `replaceAll` throw a `TypeError`. This is the obvious first cause.
  - `src/clean.mjs`. `clean` removes every character that matches `[^a-y0-9-]`, so it also drops the letter `z`. The crash hides this second cause.
  - `test/slug.test.mjs` with two tests. Test 1: `slugify("Hello lazy World")` must equal `"hello-lazy-world"`. Test 2: `slugify("Hi, there!")` must equal `"hi-there"`. Both tests fail with the `TypeError`.
- After the first fix, test 1 still fails with `'hello-lay-world'`. Then the skill wants a ranked list before the next change.
- Allowed tools: the same as eval 01.

## Expected behaviors

- [ ] The agent loads the `diagnose` skill.
- [ ] The agent runs `npm test` or `node --test` before any edit and prints `Red command:`.
- [ ] The agent can fix the `replaceAll` call at once, as its first cause.
- [ ] After that fix, the red command still fails with a new symptom. The agent stops and prints `Ranked causes:` with 3 to 5 causes. Each cause has a prediction of the form "If X is the cause, then changing Y ...".
- [ ] The list comes before the next edit.
- [ ] The agent changes one thing per experiment.
- [ ] The agent names the second cause: the character class `a-y` drops `z`.
- [ ] At the end, `npm test` passes and the test file still expects `"hello-lazy-world"`.
- [ ] No debug prefix such as `[DEBUG-` is left in any file.

## Failure looks like

- The agent fixes the crash, sees the new failure and edits again with no ranked list.
- The agent edits both files in one step.
- The agent changes the expected value in the test to make it pass.

## Checks

```json
{
  "set": "capability",
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "fix/slugify-crash",
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"slug-demo\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "src/clean.mjs",
        "content": "// Keep only lowercase letters, digits and hyphens.\nexport function clean(text) {\n  return text.replace(/[^a-y0-9-]/g, \"\");\n}\n"
      },
      {
        "path": "src/slug.mjs",
        "content": "import { clean } from \"./clean.mjs\";\n\nexport function slugify(text) {\n  return clean(text.trim().toLowerCase().replaceAll(/ /, \"-\"));\n}\n"
      },
      {
        "path": "test/slug.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.mjs\";\n\ntest(\"slugify joins every word with a hyphen\", () => {\n  assert.equal(slugify(\"Hello lazy World\"), \"hello-lazy-world\");\n});\n\ntest(\"slugify drops punctuation\", () => {\n  assert.equal(slugify(\"Hi, there!\"), \"hi-there\");\n});\n"
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
      "diagnose"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "npm test|node --test"
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
      "Ranked causes:",
      "(If [^\\n]{1,200}? is the cause,? then[\\s\\S]*){3}",
      "/a-y|\\[\\^a-z|\\bz\\b|letter z|`z`|'z'|\"z\"/i"
    ],
    "fileMatches": [
      {
        "path": "src/slug.mjs",
        "pattern": "^(?![\\s\\S]*replaceAll\\(/ /,)(?![\\s\\S]*\\[DEBUG-)[\\s\\S]*slugify"
      },
      {
        "path": "src/clean.mjs",
        "pattern": "^(?![\\s\\S]*\\[DEBUG-)[\\s\\S]*clean"
      },
      {
        "path": "test/slug.test.mjs",
        "pattern": "^(?![\\s\\S]*\\[DEBUG-)[\\s\\S]*\"hello-lazy-world\""
      }
    ]
  }
}
```

This eval is in the `capability` set. On 25 Nov 2026 no run printed the ranked list: 0 of 8 runs, before and after one fix round of the skill text. So the rule in the skill says `No fence yet`.

Not machine-checked: that the ranked list comes after the first fix and before the second edit, and that `npm test` passes at the end. The runner cannot order text against tool calls or run a command after the agent stops.
