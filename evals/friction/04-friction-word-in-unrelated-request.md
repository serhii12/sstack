# Eval friction/04: the word friction in an unrelated request

## Prompt

```
Our signup form has too much friction. Suggest three ways to cut the number of fields in src/signup.html.
```

## Setup

- The repo of eval friction/01, with `src/signup.html` that holds a form with eight fields.
- Allowed tools: `Read`, `Glob`, `Grep`, `Skill`, `Write`, `Edit`.

## Expected behaviors

- [ ] The transcript has no `Skill` call with `friction`. The word "friction" here means a user experience problem, not a problem for an agent.
- [ ] The reply gives three ways to cut fields.
- [ ] No file exists under `.scratch/friction/` other than `01-slow-ci.md`, and no file changes.

## Failure looks like

- The agent loads `friction` because the prompt holds the word.
- The agent files an issue about the signup form.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "docs/agents/tracker.md",
        "content": "# Tracker: local files\n\nTracker: local\nWritten by: the `setup` workflow on 2026-01-05. If the layout changes, edit this file by hand.\n\nIssues are markdown files. There is no command line tool. Every action is a file edit.\nFriction issues live in `.scratch/friction/NN-title.md`.\n"
      },
      {
        "path": ".scratch/friction/01-slow-ci.md",
        "content": "# CI takes 25 minutes on every push\nStatus: open\nLabels: friction, P2\n\n## What happened\nThe CI run takes 25 minutes on every push.\n\n## What you wanted\nA run under 10 minutes.\n\n## How to reproduce\n1. Push any commit.\n2. Watch the CI run.\n\n## Cost\nEach push waits 25 minutes.\n\n## Already looked at\nThe test matrix.\n\n## Relevant files\n- .github/workflows/ci.yml\n"
      },
      {
        "path": "package.json",
        "content": "{\n  \"name\": \"demo-docs\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"docs:links\": \"node scripts/docs-links.mjs\"\n  }\n}\n"
      },
      {
        "path": "README.md",
        "content": "# demo\n\nRun `npm run docs:links` to list the links in the docs.\n"
      },
      {
        "path": "src/signup.html",
        "content": "<form>\n  <input name=\"first\"><input name=\"last\"><input name=\"email\"><input name=\"phone\">\n  <input name=\"company\"><input name=\"title\"><input name=\"country\"><input name=\"referral\">\n</form>\n"
      }
    ]
  },
  "prompt": "Our signup form has too much friction. Suggest three ways to cut the number of fields in src/signup.html.",
  "allowedTools": [
    "Read",
    "Glob",
    "Grep",
    "Skill",
    "Write",
    "Edit"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "friction"
    ],
    "toolNotCalled": [
      "Write",
      "Edit"
    ],
    "noRepoChanges": true,
    "outputMatches": [
      "/\\b(field|fields)\\b/i"
    ]
  }
}
```

Not machine-checked: that the three ideas are good. The check proves that the skill stays off, that nothing is written, and that the reply talks about fields.
