# Eval prototype/04: a UI prototype stays on its branch

Kind: task sort (UI). The skill must pick the UI shape and make the `prototype/settings-layout` branch. It puts the versions in `prototypes/settings-layout/`. It names each edited product file on the `Host files:` line.

## Prompt

```
/prototype What should the layout of our settings page be? It is one long list today, see public/settings.html. Name the prototype settings-layout. Keep each version small.
```

## Setup

- A fresh temp git repo on `main` with the stack installed.
- `public/settings.html` is a plain HTML settings page with four sections in one long list.

## Expected behavior

- [ ] The agent picks the UI shape and reads UI.md.
- [ ] The agent makes the branch `prototype/settings-layout` and writes `PROTOTYPE.md` with `Shape: UI`.
- [ ] The agent builds 3 to 5 versions that differ in layout, with a `?variant=` switch and a bar to change version.
- [ ] If the agent edits `public/settings.html`, the `Host files:` line names it.
- [ ] The agent runs the check, makes no commit on `main`, and stops for the verdict.

## Failure looks like

- The agent edits a product file and does not name it on the `Host files:` line.
- The agent edits any product file other than the settings page.
- The versions differ only in color.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "package.json",
        "content": "{ \"name\": \"shop\", \"private\": true, \"type\": \"module\" }\n"
      },
      {
        "path": "public/settings.html",
        "content": "<!doctype html>\n<html>\n<head><meta charset=\"utf-8\"><title>Settings</title></head>\n<body>\n  <header><h1>Shop admin</h1><nav>Orders | Products | Settings</nav></header>\n  <main id=\"settings\">\n    <h2>Settings</h2>\n    <section><h3>Profile</h3><label>Name <input value=\"Dana\"></label><label>Email <input value=\"dana@example.invalid\"></label></section>\n    <section><h3>Notifications</h3><label><input type=\"checkbox\" checked> New orders</label><label><input type=\"checkbox\"> Low stock</label></section>\n    <section><h3>Billing</h3><p>Plan: Basic</p><button>Change plan</button></section>\n    <section><h3>Danger zone</h3><button>Delete shop</button></section>\n  </main>\n</body>\n</html>\n"
      }
    ]
  },
  "prompt": "/prototype What should the layout of our settings page be? It is one long list today, see public/settings.html. Name the prototype settings-layout. Keep each version small.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash(git status:*)",
    "Bash(git branch:*)",
    "Bash(git switch:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git log:*)",
    "Bash(git diff:*)",
    "Bash(node .claude/skills/prototype/scripts/prototype-check.mjs:*)"
  ],
  "permissionMode": "acceptEdits",
  "budgetUsd": 3,
  "set": "capability",
  "assert": {
    "skillLoaded": [
      "prototype"
    ],
    "gitBranchExists": [
      "prototype/settings-layout"
    ],
    "gitCommitCountOn": {
      "main": 0
    },
    "onlyFilesChanged": [
      "prototypes/settings-layout/**",
      "public/settings.html"
    ],
    "fileExists": [
      "prototypes/settings-layout/PROTOTYPE.md"
    ],
    "fileMatches": [
      {
        "path": "prototypes/settings-layout/PROTOTYPE.md",
        "pattern": "/^Shape:\\s*`?UI/mi"
      },
      {
        "path": "prototypes/settings-layout/PROTOTYPE.md",
        "pattern": "/^Verdict:\\s*`?open/m"
      }
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "prototype-check\\.mjs settings-layout"
      }
    ],
    "toolNotCalled": [
      {
        "name": "Bash",
        "inputMatches": "git (merge|rebase|cherry-pick|push|stash)\\b|git checkout [^\\n]*-- "
      }
    ],
    "outputMatches": [
      "/variant/i",
      "/verdict/i"
    ]
  }
}
```

What each check catches:

- Work on `main`, or a commit there, fails `gitBranchExists` and `gitCommitCountOn`.
- An edit to a file other than the folder and the settings page fails `onlyFilesChanged`.
- A logic prototype in place of a UI prototype fails the `Shape:` check.

Not machine-checked:

- Whether an edit to `public/settings.html` is on the `Host files:` line. The runner cannot check one file only when another changed. The agent runs `prototype-check.mjs`, which fails on that case, and a person reads its output in the transcript.
- Whether the versions differ in structure. The user judges the design.

This eval is in the `capability` set, because the UI shape gives the agent more choices than the logic shape.
