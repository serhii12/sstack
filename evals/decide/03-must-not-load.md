# Eval decide/03: the skill must not load

## Prompt

```
What does uploadFile in src/upload.mjs return when the server answers 200?
```

## Setup

- Same repo as eval decide/02.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`. No edit tools.

## Expected behaviors

- [ ] The agent makes no `Skill` tool call for `decide`.
- [ ] The agent reads `src/upload.mjs` and answers the question with a file and line.
- [ ] The reply has no numbered options, no effort labels and no "ideal fix".
- [ ] The agent does not stop to ask the user to choose.

## Failure looks like

- The agent loads `decide` for a plain question.
- The reply lists options for a question that has one answer.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "src/cache.mjs", "content": "// Session store for the web app. It lives in this process only.\nconst sessions = new Map();\n\nexport function getSession(id) {\n  return sessions.get(id);\n}\n\nexport function saveSession(id, data) {\n  sessions.set(id, data);\n}\n" },
      { "path": "src/upload.mjs", "content": "export async function uploadFile(url, body) {\n  const res = await fetch(url, { method: \"POST\", body });\n  if (!res.ok) {\n    throw new Error(`upload failed with status ${res.status}`);\n  }\n  return res.status;\n}\n" },
      { "path": "package.json", "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\"\n}\n" },
      { "path": "tests/cache.test.mjs", "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { getSession } from \"../src/cache.js\";\n\ntest(\"getSession returns undefined for an unknown id\", () => {\n  assert.equal(getSession(\"x\"), undefined);\n});\n" }
    ]
  },
  "prompt": "What does uploadFile in src/upload.mjs return when the server answers 200?",
  "allowedTools": ["Read", "Grep", "Glob", "Skill"],
  "assert": {
    "skillNotLoaded": ["decide"],
    "noRepoChanges": true,
    "toolNotCalled": ["Edit", "Write"],
    "outputMatches": [
      "/upload\\.mjs`?[:, ]+(line |L)?\\d+/",
      "/res\\.status|status code/i"
    ],
    "outputNotMatches": [
      "/Recommendation|[Ii]deal fix|(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)|one real option/m",
      "/which (one|option)/i"
    ]
  }
}
```

Not machine-checked: whether the cited line is the right line (line 6). The status check sees the words `res.status` or "status code", not a correct sentence.

- If the agent loads `decide` for this question, `skillNotLoaded` fails.
- If the reply lists options, effort labels or an ideal fix, `outputNotMatches` fails.
- If the reply asks the user to choose an option, `outputNotMatches` fails.
- If the reply cites no `upload.mjs` line, or does not say that the function returns the status, `outputMatches` fails.
