# Eval decide/01: a real trade-off

## Prompt

```
We will run three servers soon. src/cache.mjs keeps sessions in an in-memory Map. Should we move them to Redis or keep the Map? What are my options?
```

## Setup

- A fresh git repo with the stack installed.
- The repo has `src/cache.mjs` with a module-level `Map` for sessions, and a `package.json` with no Redis dependency.
- Allowed tools: `Read`, `Grep`, `Glob`, `Skill`. No edit tools.

## Expected behaviors

- [ ] The agent loads the `decide` skill (a `Skill` tool call with `decide`).
- [ ] The agent reads `src/cache.mjs` and cites at least one fact with a path and line.
- [ ] The reply gives the options as a numbered list, with at least two real options.
- [ ] Each option has an effort: `Easy`, `Medium` or `Hard`.
- [ ] Each option says whether it is easy to undo or hard to undo.
- [ ] The reply has one recommendation.
- [ ] The reply names the ideal fix, and says why if it differs from the recommendation.
- [ ] The reply ends by waiting for the user to choose. The agent edits no file.

## Failure looks like

- The agent starts to move the code to Redis.
- The reply has options with no effort or no undo label.
- The reply has no recommendation, or says "it depends".
- The agent never loads the skill and answers in free form.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "src/cache.mjs", "content": "// Session store for the web app. It lives in this process only.\nconst sessions = new Map();\n\nexport function getSession(id) {\n  return sessions.get(id);\n}\n\nexport function saveSession(id, data) {\n  sessions.set(id, data);\n}\n" },
      { "path": "package.json", "content": "{\n  \"name\": \"demo\",\n  \"version\": \"0.0.0\",\n  \"type\": \"module\"\n}\n" }
    ]
  },
  "prompt": "We will run three servers soon. src/cache.mjs keeps sessions in an in-memory Map. Should we move them to Redis or keep the Map? What are my options?",
  "allowedTools": ["Read", "Grep", "Glob", "Skill"],
  "assert": {
    "skillLoaded": ["decide"],
    "noRepoChanges": true,
    "toolNotCalled": ["Edit", "Write"],
    "outputMatches": [
      "/cache\\.mjs`?[:, ]+(line |L)?\\d+/",
      "/^\\s*(\\*\\*)?2[.)]/m",
      "/(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)[\\s\\S]*(^\\s*(\\*\\*)?\\d[.)][^\\n]*\\b(Easy|Medium|Hard)\\b(?! to undo)|\\b(Easy|Medium|Hard)\\b[^\\n]{0,30}[Ee]ffort|[Ee]ffort[^\\n]{0,30}\\b(Easy|Medium|Hard)\\b)/m",
      "/(easy|hard) to undo[\\s\\S]*(easy|hard) to undo/i",
      "[Rr]ecommend",
      "[Ii]deal fix",
      "/(choose|pick|prefer|go with)[^\\n]{0,40}\\?|\\?\\s*$/i"
    ],
    "outputNotMatches": [
      "[Ii]t depends"
    ]
  }
}
```

Not machine-checked: the real trade-off, the quality of the options, and whether the recommendation is sound. The checks count labels, so a person must confirm that each label belongs to an option.

- If the agent does not load `decide`, `skillLoaded` fails.
- If the reply cites no `cache.mjs` line, the first `outputMatches` check fails.
- If the reply has fewer than two numbered options, the `2.` check fails.
- If fewer than two options have an effort label, the effort check fails.
- If fewer than two options have an undo label, the undo check fails.
- If the reply has no recommendation or says "it depends", the checks fail.
- If the agent moves the code to Redis, `toolNotCalled` and `noRepoChanges` fail.
- If the reply does not ask the user to choose, the last `outputMatches` check fails. Opus often adds a line after "Which option do you choose?", so the check does not need the question at the very end.
