# Eval decide/02: one obvious option

## Prompt

```
Before you change anything: tests/cache.test.mjs imports ../src/cache.js, but the file is src/cache.mjs. How should I fix it?
```

## Setup

- Same repo as eval decide/01, plus `tests/cache.test.mjs` with the line `import { getSession } from "../src/cache.js";`.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`. No edit tools.
- Run it twice. In variant A, use the prompt as written. In variant B, start the prompt with `/decide ` to force the skill to load.

## Expected behaviors

- [ ] The reply recommends the obvious fix: change the import to `../src/cache.mjs`.
- [ ] If the skill loads, the reply says that one real option exists, with the reason. Any other option is marked as not worth doing, with a reason.
- [ ] If the skill does not load, the reply answers in a few lines. This is also a pass.
- [ ] The reply does not present three or more options as equal choices with effort labels.
- [ ] The agent edits no file.

## Failure looks like

- The reply lists options such as "rename the file", "add a re-export file" and "change the import" as a menu with effort labels, only to fill the format.
- The agent edits `tests/cache.test.mjs`.
- The reply has no recommendation.

## Checks

This block runs variant A only. To test variant B, start the prompt with `/decide `. Run variant B by hand.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "src/cache.mjs", "content": "// Session store for the web app. It lives in this process only.\nconst sessions = new Map();\n\nexport function getSession(id) {\n  return sessions.get(id);\n}\n\nexport function saveSession(id, data) {\n  sessions.set(id, data);\n}\n" },
      { "path": "package.json", "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\"\n}\n" },
      { "path": "tests/cache.test.mjs", "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { getSession } from \"../src/cache.js\";\n\ntest(\"getSession returns undefined for an unknown id\", () => {\n  assert.equal(getSession(\"x\"), undefined);\n});\n" }
    ]
  },
  "prompt": "Before you change anything: tests/cache.test.mjs imports ../src/cache.js, but the file is src/cache.mjs. How should I fix it?",
  "allowedTools": ["Read", "Grep", "Glob", "Skill"],
  "assert": {
    "noRepoChanges": true,
    "toolNotCalled": ["Edit", "Write"],
    "outputMatches": [
      "\\.\\./src/cache\\.mjs"
    ],
    "outputNotMatches": [
      "/(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)[\\s\\S]*(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)[\\s\\S]*(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)/m",
      "[Ii]t depends"
    ]
  }
}
```

Not machine-checked: whether a loaded skill says one real option exists, and why. Whether a short answer is enough. The runner cannot make a check depend on whether the skill loaded, so the block does not assert the skill load either way.

The first two runs of an earlier version failed on the eval, not the skill. One check needed the word "recommend", and a correct direct answer did not use it. One check banned a line that starts with `3.`, and a correct answer had four numbered steps to apply the fix. Both checks are gone.

- If the reply does not name `../src/cache.mjs`, `outputMatches` fails.
- If the reply shows three or more options with effort labels, `outputNotMatches` fails. The check accepts `Easy effort` and `Effort: Easy`.
- If the agent edits `tests/cache.test.mjs`, `noRepoChanges` fails.
