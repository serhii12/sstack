# Eval prove/04: a read-only question must not load the skill

Kind: triggering. A question about code needs no evidence run.

## Prompt

```
What does the media query in site/index.html do?
```

## Setup

- A fresh git repo with the stack installed and `site/index.html`.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`.

## Expected behaviors

- [ ] The agent does not load `prove`.
- [ ] The agent answers from the file and changes nothing.

## Failure looks like

- The agent loads `prove` or writes anything under `.artifacts/`.

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
      }
    ]
  },
  "prompt": "What does the media query in site/index.html do?",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "prove"
    ],
    "noRepoChanges": true
  }
}
```
