# Eval improve-codebase/02: a small clean codebase

## Prompt

```
/improve-codebase
```

## Setup

- A fresh git repo with the stack installed and one setup commit.
- One module, `src/slug.mjs`, with one exported function and three tests through it.
- Allowed tools: `Skill`, `Agent`, `Read`, `Glob`, `Grep`, `Write`, `Edit`, and the two scripts of the skill.

## Expected behaviors

- [ ] The agent hands the scan to one fresh subagent before it writes the report.
- [ ] The report says "No change recommended" and gives a reason.
- [ ] `survey-lint` passes on the report.
- [ ] No source file changes.

## Failure looks like

- The report invents a Strong candidate to have something to say.
- The agent edits `src/slug.mjs`.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": { \"test\": \"node --test\" }\n}\n"
      },
      {
        "path": "README.md",
        "content": "# slugs\n\nTurns a title into a URL slug.\n"
      },
      {
        "path": "src/slug.mjs",
        "content": "// Turns a title into a lowercase URL slug.\nexport function slugify(title) {\n  if (typeof title !== \"string\") throw new TypeError(`slugify: the title must be a string, got ${typeof title}. Fix: pass a string.`);\n  return title\n    .normalize(\"NFKD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\");\n}\n"
      },
      {
        "path": "tests/slug.test.mjs",
        "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.mjs\";\n\ntest(\"a title becomes a lowercase slug\", () => {\n  assert.equal(slugify(\"Hello, World!\"), \"hello-world\");\n});\n\ntest(\"accents are dropped\", () => {\n  assert.equal(slugify(\"Café Crème\"), \"cafe-creme\");\n});\n\ntest(\"a value that is not a string is refused\", () => {\n  assert.throws(() => slugify(42), /must be a string/);\n});\n"
      }
    ]
  },
  "prompt": "/improve-codebase",
  "allowedTools": [
    "Skill",
    "Agent",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(node .claude/skills/improve-codebase/scripts/churn.mjs:*)",
    "Bash(node .claude/skills/improve-codebase/scripts/survey-lint.mjs:*)"
  ],
  "budgetUsd": 2,
  "set": "capability",
  "assert": {
    "skillLoaded": [
      "improve-codebase"
    ],
    "fileExists": [
      ".artifacts/improve-codebase/report.md"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/improve-codebase/report.md",
        "pattern": "/No change recommended/i"
      },
      {
        "path": ".artifacts/improve-codebase/report.md",
        "pattern": "^(?![\\s\\S]*\\n\\s*(?:[-*]\\s+)?(?:\\*\\*)?Rank:(?:\\*\\*)?\\s*(?:\\*\\*)?Strong)"
      }
    ],
    "scriptPasses": [
      {
        "skill": "improve-codebase",
        "script": "survey-lint",
        "file": ".artifacts/improve-codebase/report.md"
      }
    ],
    "onlyFilesChanged": [
      ".artifacts/improve-codebase/**"
    ],
    "toolCalled": [
      {
        "name": "Agent",
        "inputMatches": "You scan code and report"
      }
    ],
    "toolOrder": [
      {
        "before": "Agent",
        "after": {
          "name": "Write",
          "inputMatches": "improve-codebase/report\\.md"
        }
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      },
      {
        "name": "Edit",
        "inputMatches": "\"file_path\":\"(?![^\"]*\\.artifacts/improve-codebase/)"
      }
    ]
  }
}
```

Not machine-checked: whether the reason for no change is true. The checks see the words "No change recommended" and no `Rank: Strong` line.

This eval is a capability eval, because it measures a judgment of the model.
