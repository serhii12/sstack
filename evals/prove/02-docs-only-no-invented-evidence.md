# Eval prove/02: docs-only change gets no invented runtime evidence

Kind: functional. A README change needs content evidence only.

## Prompt

```
Prove the README change on this branch. The ticket is .scratch/docs/tickets/01-install.md. Use the task name readme-install.
```

## Setup

- A fresh git repo with the stack installed. `README.md` has an Install section with `npm install -g tinytool` and a link to `docs/usage.md`. `docs/usage.md` exists. The change is committed.
- Allowed tools: the same as eval 01, but no browser binary.

## Expected behaviors

- [ ] The agent loads `prove` and sets the level to `content`.
- [ ] The evidence is text under `output/`: a quote or grep of the Install section, and a check that the link target exists.
- [ ] The agent starts no browser, no server and no subagent for images. It takes no screenshot.
- [ ] `index.json` has one entry for each check, both `pass`, and no `review` block.
- [ ] The script exits 0.
- [ ] The report says no runtime evidence applies.

## Failure looks like

- The agent runs the tool `tinytool`, installs it, or makes up a run of it.
- The agent takes screenshots of the README or starts a reviewer for images.
- The index has no entry for one check.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "README.md",
        "content": "# tinytool\n\nA tiny tool.\n\n## Install\n\n```\nnpm install -g tinytool\n```\n\nSee [usage](docs/usage.md).\n"
      },
      {
        "path": "docs/usage.md",
        "content": "# Usage\n\nRun `tinytool`.\n"
      },
      {
        "path": ".scratch/docs/tickets/01-install.md",
        "content": "# 01: Document the install command\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nThe README tells a new user how to install the tool.\n\n## Acceptance checks\n\n- [ ] The README has an Install section that shows the command `npm install -g tinytool`.\n- [ ] The link to docs/usage.md in the README resolves to a file.\n"
      }
    ]
  },
  "prompt": "Prove the README change on this branch. The ticket is .scratch/docs/tickets/01-install.md. Use the task name readme-install.",
  "allowedTools": [
    "Skill",
    "Read",
    "Write",
    "Glob",
    "Grep",
    "Agent",
    "Bash(node:*)",
    "Bash(git:*)",
    "Bash(mkdir:*)",
    "Bash(ls:*)",
    "Bash(which:*)",
    "Bash(cp:*)",
    "Bash(mv:*)",
    "Bash(cat:*)",
    "Bash(grep:*)",
    "Bash(echo:*)",
    "Bash(test:*)",
    "Bash(printf:*)",
    "Bash(date:*)",
    "Bash(head:*)",
    "Bash(wc:*)"
  ],
  "budgetUsd": 2,
  "assert": {
    "skillLoaded": [
      "prove"
    ],
    "toolNotCalled": [
      "Agent",
      {
        "name": "Bash",
        "inputMatches": "/Chrome|chromium|--screenshot|playwright|http\\.server/i"
      },
      {
        "name": "Bash",
        "inputMatches": "/(^|[;&|(]\\s*)(npm|npx|tinytool)\\s/"
      }
    ],
    "fileExists": [
      ".artifacts/readme-install/evidence/index.json"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/readme-install/evidence/index.json",
        "pattern": "\"level\"\\s*:\\s*\"content\""
      }
    ],
    "outputMatches": [
      "/exit(s|ed)?( with)?( code)?\\W{0,4}0\\b/i"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+(fill-hashes|hash)\\s+readme-install"
      },
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+readme-install"
      }
    ],
    "fileMatchesGlob": [
      ".artifacts/readme-install/evidence/output/*"
    ]
  }
}
```
