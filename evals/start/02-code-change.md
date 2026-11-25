# Eval start/02: code change

## Prompt

```
/start make uploadFile in src/upload.mjs retry three times when the server returns 503
```

## Setup

- Same repo as eval start/01.
- Set `TMPDIR` to an empty folder for the run.
- Allowed tools: `Read`, `Grep`, `Glob`, `Write` for the handoff note folder only, and `Bash(echo $TMPDIR)` to find that folder.

## Expected behaviors

- [ ] The agent sorts the task as a code change.
- [ ] The reply names the evidence level `behavior`. The check accepts the two words in either order.
- [ ] The reply gives one line on why, the note path, and the next command in a code span.
- [ ] The next command is `/grill`.
- [ ] The reply names `/spec`, `/tickets` and `/build` as the commands that follow `/grill`.
- [ ] The reply does not call a built skill "not built yet". The built skills are in the block of `skills/start/SKILL.md`. Today `spec`, `tickets`, `build`, `test-craft`, `peer-review` and `prove` are built.
- [ ] The reply does not tell the user to type a command that is not built: `/ship`, `/pr-body`, `/skill-craft` or `/security-review`.
- [ ] The note exists under the `$TMPDIR/sstack/` folder of the run. It has `Task type: code change` and `Evidence level: behavior`.
- [ ] The agent does not edit `src/upload.mjs`. `git status` shows no change.
- [ ] The agent does not create a branch or a worktree.

## Failure looks like

- The agent adds the retry code.
- The agent sorts the task as a bug, or as a ship request.
- The next command is `/spec` or `/build`, so the agent skips `/grill`.
- The reply calls `prove` or another built skill "not built yet".
- The reply has no next command.
- The agent guesses the temp folder and writes the note outside `$TMPDIR` of the run.

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
  "prompt": "/start make uploadFile in src/upload.mjs retry three times when the server returns 503",
  "allowedTools": ["Read", "Grep", "Glob", "Write", "Bash(echo $TMPDIR)"],
  "assert": {
    "skillLoaded": ["start"],
    "noRepoChanges": true,
    "toolCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"[^\"]*/eval-run-[^/\"]+/tmp/sstack/start-" },
      { "name": "Write", "inputMatches": "# Handoff: " },
      { "name": "Write", "inputMatches": "Task type: code change" },
      { "name": "Write", "inputMatches": "Evidence level: `?behavior\\b" },
      { "name": "Write", "inputMatches": "Next command: `?/grill" },
      { "name": "Write", "inputMatches": "Not built yet: " }
    ],
    "toolNotCalled": [
      { "name": "Write", "inputMatches": "\"file_path\":\"(?![^\"]*/eval-run-[^/\"]+/tmp/sstack/)" },
      { "name": "Write", "inputMatches": "Not built yet: (?:(?!\\\\n)[^(.;:])*?(?<![/\\w-])(spec|tickets|build|test-craft|peer-review|prove|grill)\\b" }
    ],
    "outputMatches": [
      "[Cc]ode change",
      "/evidence[^\\n]{0,30}behavior|behavior[^\\n]{0,30}evidence/i",
      "`/grill`",
      "/\\/spec\\b[\\s\\S]*\\/tickets\\b[\\s\\S]*\\/build\\b/"
    ],
    "outputNotMatches": [
      "/(?:^|[.!?]\\s)(?![^\\n.!?]*(not|n't) built)[^\\n.!?]*\\/(ship|pr-body|skill-craft|security-review)\\b/mi",
      "/\\b(spec|tickets|build|test-craft|peer-review|prove)`?\\s+(is|are)\\s+not built/i",
      "/not built yet:?[^\\n.(;]*?(?<![/\\w-])(spec|tickets|build|test-craft|peer-review|prove)\\b/i"
    ]
  }
}
```

Not machine-checked: the one-line reason, the open questions in the note, and the between-phases option. A regex sees words, so a person must confirm that the sort is right. The "not built yet" checks read the list up to the first `(`, `.`, `;` or `:`, and skip a name with a `/` in front. So a note such as `ship (open the PR by hand after /build)` passes.

- If the agent edits `src/upload.mjs` or the repo changes, `noRepoChanges` fails.
- If the agent sorts the task as a bug or a ship request, the note checks fail.
- If the note is not in `$TMPDIR/sstack/` of the run, the `file_path` checks fail. The runner puts `TMPDIR` at `eval-run-*/tmp`.
- If the next command in the note is not `/grill`, the `Next command` check fails.
- If the reply has no `/spec`, `/tickets` and `/build` in that order, `outputMatches` fails.
- If the reply or the note calls a built skill "not built yet", `outputNotMatches` or `toolNotCalled` fails.
- If a sentence of the reply names `/ship` or another unbuilt command without "not built" or "n't built", `outputNotMatches` fails.
