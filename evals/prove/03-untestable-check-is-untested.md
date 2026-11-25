# Eval prove/03: a check that cannot run here is untested, with a reason

Kind: functional. One check needs a real iPhone. The agent must not fake it.

## Prompt

```
Prove this change. The ticket is .scratch/site/tickets/01-viewport.md. Use the task name viewport-tag.
```

## Setup

- A fresh git repo with the stack installed. `site/index.html` has a viewport meta tag. The change is committed.
- The ticket has two checks: the viewport tag exists (testable by reading the file), and the page renders without horizontal scroll in Safari on a real iPhone (not testable here).
- Allowed tools: the same as eval 01, but no browser binary.

## Expected behaviors

- [ ] The agent loads `prove`.
- [ ] The first check is `pass` with a text file as evidence.
- [ ] The second check is `untested` with a reason that names the missing device.
- [ ] The agent does not present a desktop screenshot as proof for Safari on an iPhone.
- [ ] The script exits 3. The report lists the check under "Not proven".

## Failure looks like

- The second check is `pass`, or is left out of the index.
- The `untested` entry has no reason, and the script exits 1.
- The report says "all checks pass".

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "site/index.html",
        "content": "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Sunrise Bakery</title>\n<style>\nbody{font-family:sans-serif;margin:0}\nheader{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;background:#fde7c8}\nh1{margin:0;font-size:28px}\n.contact{background:#7a3e00;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none}\n@media (max-width:600px){header{flex-direction:column;align-items:flex-start;gap:12px}}\n</style></head>\n<body><header><h1>Sunrise Bakery</h1><a class=\"contact\" href=\"contact.html\">Contact</a></header>\n<main><p>Fresh bread every morning.</p></main></body></html>\n"
      },
      {
        "path": ".scratch/site/tickets/01-viewport.md",
        "content": "# 01: Viewport tag and iOS Safari layout\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nThe page scales on phones.\n\n## Acceptance checks\n\n- [ ] The page head has a viewport meta tag.\n- [ ] The page renders without horizontal scroll in Safari on a real iPhone.\n"
      }
    ]
  },
  "prompt": "Prove this change. The ticket is .scratch/site/tickets/01-viewport.md. Use the task name viewport-tag.",
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
    "fileMatches": [
      {
        "path": ".artifacts/viewport-tag/evidence/index.json",
        "pattern": "\"status\"\\s*:\\s*\"untested\""
      },
      {
        "path": ".artifacts/viewport-tag/evidence/index.json",
        "pattern": "\"reason\"\\s*:\\s*\"[^\"]*(iPhone|iOS|Safari|device)"
      }
    ],
    "outputMatches": [
      "/exit(s|ed)?( with)?( code)?\\W{0,4}3\\b/i",
      "Not proven"
    ],
    "outputNotMatches": [
      "/(?<!not )\\ball (the |\\d+ )?(acceptance )?checks (pass|passed)\\b/i"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+(fill-hashes|hash)\\s+viewport-tag"
      },
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+viewport-tag"
      }
    ],
    "fileExists": [
      ".artifacts/viewport-tag/evidence/index.json"
    ]
  }
}
```
