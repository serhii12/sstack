# Eval prove/01: front-end change, two widths, reviewed

Kind: functional. A visible change needs screenshots at a phone width and a desktop width. A fresh reviewer must look at them.

## Prompt

```
Prove that the change on this branch works. The ticket is .scratch/site/tickets/01-contact.md. Use the task name contact-button.
```

## Setup

- A fresh git repo with the stack installed. `site/index.html` is a static page with a header and a Contact button. The change is already committed. The project has no `package.json` and no test tool.
- The ticket has two visual Acceptance checks, at 1280 px and at 375 px.
- The machine has a browser that is already installed (Chrome). The eval allows that binary and nothing else for capture. Both checks are light screenshots, so the installed browser is enough. If no browser is installed, the correct run installs Playwright outside the project with `run-playwright.mjs`. This eval does not test that path, because it downloads a browser.
- Allowed tools: `Skill`, `Read`, `Write`, `Glob`, `Grep`, `Agent`, and `Bash` for a list of commands. The commands are `node`, `git`, `mkdir`, `ls`, `which`, `cp`, `mv`, `cat`, `grep`, `echo`, `test`, `printf`, `date`, `head`, `wc` and the Chrome binary.

## Expected behaviors

- [ ] The agent loads `prove` and reads the Acceptance checks of the ticket.
- [ ] The agent finds no project test tool and uses the installed browser. It installs nothing, because the browser is enough for these checks.
- [ ] The agent captures at least one PNG at 375 px and one at 1280 px under `.artifacts/contact-button/evidence/`.
- [ ] The agent starts a fresh subagent (an `Agent` call) for the review. The brief holds only the check texts and image paths, not the diff or reasoning.
- [ ] The reply of the reviewer is saved word for word under `reviews/`.
- [ ] `index.json` has one entry for each check. Each is `pass` with a `matches` verdict, or `fail` with a reason.
- [ ] The agent runs `evidence-check.mjs fill-hashes` and then the check, and the final exit is 0 (or 3 if a real defect is found and reported).
- [ ] Nothing is uploaded. No command names a public host.
- [ ] The report uses the report format and says the evidence is local.

## Failure looks like

- The agent marks the checks `pass` without opening the images, or reviews them in the same context without saying so.
- The agent captures only one width, or uses a text file in place of an image.
- The agent adds a package to the project.
- The agent uploads the images or a link to them.
- The index has a `pass` with a missing or renamed file, and the script exits 1.

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
        "path": ".scratch/site/tickets/01-contact.md",
        "content": "# 01: Contact button in the header\n\nBlocked by: none\nStatus: open\nSpec: ../spec.md\n\n## What to build\n\nA Contact button in the page header.\n\n## Acceptance checks\n\n- [ ] At 1280 px wide, the header shows the Contact button on the right of the title Sunrise Bakery.\n- [ ] At 375 px wide, the Contact button sits below the title and is not cut off.\n"
      }
    ]
  },
  "prompt": "Prove that the change on this branch works. The ticket is .scratch/site/tickets/01-contact.md. Use the task name contact-button.",
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
    "Bash(/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome:*)",
    "Bash(grep:*)",
    "Bash(echo:*)",
    "Bash(test:*)",
    "Bash(printf:*)",
    "Bash(date:*)",
    "Bash(head:*)",
    "Bash(wc:*)"
  ],
  "budgetUsd": 3,
  "assert": {
    "skillLoaded": [
      "prove"
    ],
    "toolCalled": [
      "Agent",
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+(fill-hashes|hash)\\s+contact-button"
      },
      {
        "name": "Bash",
        "inputMatches": "evidence-check\\.mjs\\s+contact-button"
      }
    ],
    "fileExists": [
      ".artifacts/contact-button/evidence/index.json"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/contact-button/evidence/index.json",
        "pattern": "375x\\d+"
      },
      {
        "path": ".artifacts/contact-button/evidence/index.json",
        "pattern": "1280x\\d+"
      },
      {
        "path": ".artifacts/contact-button/evidence/index.json",
        "pattern": "\"reviewer\"\\s*:\\s*\"fresh-subagent\""
      }
    ],
    "outputMatches": [
      "/exit(s|ed)?( with)?( code)?\\W{0,4}[03]\\b/i"
    ],
    "outputNotMatches": [
      "0x0\\.st"
    ],
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "/(^|[;&|(]\\s*)(npm|npx|pnpm|yarn|bun|pip3?|brew)\\s/"
      },
      {
        "name": "Bash",
        "inputMatches": "/0x0\\.st|transfer\\.sh|imgur|catbox|(^|[;&|(]\\s*)(curl|wget|gh|scp|rsync)\\s/"
      }
    ],
    "fileMatchesGlob": [
      ".artifacts/contact-button/evidence/**/*.png",
      ".artifacts/contact-button/evidence/reviews/*.md"
    ]
  }
}
```
