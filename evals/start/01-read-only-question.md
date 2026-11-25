# Eval start/01: read-only question

## Prompt

```
/start explain how uploadFile in src/upload.mjs handles a failed request
```

## Setup

- A fresh git repo with the stack installed (`node scripts/install.mjs <dir>`).
- The repo has `src/upload.mjs` with an `uploadFile` function that calls `fetch` once and throws on a bad status.
- Set `TMPDIR` to an empty folder for the run.
- Allowed tools: `Read`, `Grep`, `Glob`, `Write` for the handoff note folder only, and `Bash(echo $TMPDIR)` to find that folder.

## Expected behaviors

- [ ] The agent sorts the task as a read-only question.
- [ ] The reply names the evidence level `cite`.
- [ ] The reply gives one line on why.
- [ ] The reply gives the path of a handoff note, and the note exists under the `$TMPDIR/agent-stack/` folder of the run (not in the repo).
- [ ] The note has all eight fields, and `Task type: read-only`.
- [ ] The next command is "none: ask in this session". The agent does not tell the user to type a command that is not built.
- [ ] The agent does not edit a repo file, create a branch, or create a worktree. `git status` shows no change.
- [ ] The reply does not answer the full question in depth. The user did not ask `start` to do the work.

## Failure looks like

- The agent writes a long explanation of `uploadFile` and skips the sort.
- The agent sorts the task as a code change or a bug.
- The agent writes the note inside the repo, or edits a repo file.
- The agent guesses the temp folder and writes the note outside `$TMPDIR` of the run.
- The reply names `/spec` or `/debug` as a command to type.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "src/upload.mjs", "content": "export async function uploadFile(url, body) {\n  const res = await fetch(url, { method: \"POST\", body });\n  if (!res.ok) {\n    throw new Error(`upload failed with status ${res.status}`);\n  }\n  return res.status;\n}\n" }
    ]
  },
  "prompt": "/start explain how uploadFile in src/upload.mjs handles a failed request",
  "allowedTools": ["Read", "Grep", "Glob", "Write", "Bash(echo $TMPDIR)"],
  "assert": {
    "skillLoaded": ["start"],
    "noRepoChanges": true,
    "toolCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"[^\"]*/eval-run-[^/\"]+/tmp/agent-stack/start-" },
      { "name": "Write", "inputMatches": "# Handoff: " },
      { "name": "Write", "inputMatches": "Task type: read-only" },
      { "name": "Write", "inputMatches": "Evidence level: cite" },
      { "name": "Write", "inputMatches": "Why this type: " },
      { "name": "Write", "inputMatches": "Next command: none" },
      { "name": "Write", "inputMatches": "Not built yet: " },
      { "name": "Write", "inputMatches": "Pointers: " },
      { "name": "Write", "inputMatches": "Open questions: " }
    ],
    "toolNotCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"(?![^\"]*/eval-run-[^/\"]+/tmp/agent-stack/)" }
    ],
    "outputMatches": [
      "[Rr]ead-only",
      "Evidence level.{0,20}cite",
      "agent-stack/start-",
      "[Nn]ext command.{0,40}[Nn]one"
    ],
    "outputNotMatches": [
      "/\\/(spec|tickets|build|grill|debug|prove|ship|pr-body|skill-craft|security-review)\\b/"
    ]
  }
}
```

Not machine-checked: the one-line reasons and the depth of the reply. A regex sees words, so a person must confirm that the sort is right.

- If the agent edits the repo or creates a branch, `noRepoChanges` fails.
- If the agent writes the note outside `$TMPDIR/agent-stack/` of the run, the `file_path` checks fail. The runner puts `TMPDIR` at `eval-run-*/tmp`.
- If the reply names a command to type, `outputNotMatches` fails. A read-only question has no next command.
- If the note lacks a field or the cite level, the `toolCalled` checks fail.
