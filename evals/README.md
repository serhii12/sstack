# Evals

An eval is a test case for a skill. One file holds one eval. People read the prose. The runner reads the `## Checks` block.

## Layout

| Path | Holds |
|---|---|
| `evals/<skill>/NN-name.md` | One eval. `NN` is two digits. |
| `evals/<skill>/queries.md` | Trigger queries. The runner ignores this file. |
| `evals/_smoke/` | Evals that test the runner and the stack, not one skill. `02-multi-turn.md` tests `turns`. `03-tools.md` tests `tools`. |

## Parts of an eval file

Write each part in this order.

1. `# Eval <skill>/<NN>: <title>` heading.
2. `## Prompt` (or `## User prompt`). The text the user types.
3. `## Setup`. What the repo holds before the run.
4. `## Expected behaviors`. A checklist.
5. `## Failure looks like`. What a bad run does.
6. `## Checks`. The machine-readable block. It is optional.

An eval with no `## Checks` block is "manual only". The runner lists it and does not count it as a pass. A person reads the transcript and marks each expected behavior.

## The Checks block

Put one fenced `json` block under the `## Checks` heading. The block is one JSON object. The runner rejects an unknown key.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [{ "path": "README.md", "content": "# demo\n" }]
  },
  "prompt": "/start what does the README say?",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Write"],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": ["start"],
    "noRepoChanges": true
  }
}
```

### Top-level keys

| Key | Needed | Meaning |
|---|---|---|
| `prompt` | yes | The prompt that goes to `claude -p`. |
| `allowedTools` | yes | Tools that the agent can use without a prompt. A list of strings. No string has a comma. |
| `assert` | yes | The checks. See below. |
| `setup` | no | How to prepare the temp repo. |
| `budgetUsd` | no | Spend limit for one run. Default 1. With `turns` the limit applies to each turn. |
| `tools` | no | The built-in tools that exist for the agent. See "Limit the tools". |
| `disallowedTools` | no | Tools that the agent cannot use. See "Limit the tools". |
| `turns` | no | List of follow-up prompts. See "Multi-turn evals". |
| `permissionMode` | no | `default`, `acceptEdits` or `dontAsk`. See "Permission mode". |
| `baseline` | no | `{ "skill": "<name>" }`. See "Baseline without the skill". |
| `set` | no | `regression` (default) or `capability`. See "Sets and the gate". |

### Limit the tools

> **Warning.** `allowedTools` does not restrict. It only approves tools without a prompt. A tool that is not in the list can still run, if the agent has it. An eval with `"allowedTools": ["Read"]` can still run `Bash`.

To restrict, use these keys. They map to the flags of `claude`.

| Key | Flag | Meaning |
|---|---|---|
| `tools` | `--tools` | The built-in tools that exist. `[]` means no built-in tool. |
| `disallowedTools` | `--disallowedTools` | Tools that the agent cannot use. The runner adds them to its own network deny list. |

If the eval needs a skill, put `Skill` in `tools`. A tool in `tools` that is not in `allowedTools` asks for approval, and a headless run denies it. Write one tool name in each entry, with no comma.

```json
{ "tools": ["Read", "Glob", "Skill"], "allowedTools": ["Read", "Glob", "Skill"], "disallowedTools": ["Edit"] }
```

### Multi-turn evals

`turns` is a list of follow-up prompts. The runner runs `prompt` first. Then it reads `session_id` from the stream and runs each next prompt with `--resume <session_id>` in the same temp repo, with the same flags. The runner does not pass `--no-session-persistence` when `turns` exists. The budget applies to each turn. The report shows the total cost. If a turn does not finish with `success`, the runner stops and the next turns do not run.

Claude Code stores a session in `<config dir>/projects/<working folder>/`. After the run the runner deletes the folder of the temp repo and the `session-env/<id>` and `file-history/<id>` folders of its sessions, unless you pass `--keep`. The runner does not edit `history.jsonl`. All projects share that file, so it keeps one line for each prompt.

An assert can name a turn with `"turn": n` (1-based). With no `turn`, the assert sees all turns joined. A `turn` that is too high is an error in the eval file.

```json
{
  "prompt": "Remember the code word BLUEBIRD. Reply OK.",
  "turns": ["What was the code word?"],
  "assert": { "outputMatches": [{ "pattern": "BLUEBIRD", "turn": 2 }] }
}
```

### Permission mode

`permissionMode` maps to `--permission-mode`. If the agent must write files in a headless run, use it. Allowed values are `default`, `acceptEdits` and `dontAsk`. The runner never allows `bypassPermissions`.

Path rules for the `Write` tool are not reliable. A rule such as `Write(.scratch/**)` did not match in tests. Only `Edit(...)` rules worked for the `Write` tool. If a write is denied, use `"permissionMode": "acceptEdits"` or an `Edit(...)` rule.

```json
{ "permissionMode": "acceptEdits", "allowedTools": ["Read", "Write", "Edit"] }
```

### Baseline without the skill

An eval can name the skill that it tests: `"baseline": { "skill": "start" }`. With the `--baseline` flag the runner makes one extra run for each normal run. In the extra run the skill is off. Everything else is equal. The runner uses the documented `skillOverrides` setting with the value `off` and passes it as `--settings '{"skillOverrides":{"start":"off"}}'`. This works with `--setting-sources project`. The runner checks the init event. If the skill is still listed, the baseline run is marked invalid and does not count.

The runner drops the `skillLoaded` and `skillNotLoaded` asserts of that skill in a baseline run, because they cannot pass without the skill. The report prints the pass rate with the skill, without it, and the difference in points. A baseline run never counts as a failure. It never changes the exit code. An eval with no `baseline` field makes no extra run.

```json
{ "baseline": { "skill": "grill" } }
```

### Sets and the gate

`set` is `regression` (default) or `capability`. A regression eval must keep passing. A capability eval measures a skill that is still growing. The summary shows `set` and `passed` (passes out of runs) for each eval and model. With `--gate`, only a `regression` eval below `--min-pass-rate` gives exit code 1. A `capability` eval is reported and never gates. Without `--gate`, every eval counts, as before.

```json
{ "set": "capability" }
```

### `setup` keys

The runner does the steps in this order.

| Key | Meaning |
|---|---|
| `gitInit` | Run `git init` on branch `main`. |
| `installStack` | Run `node scripts/install.mjs` on the temp repo. Needs `gitInit`. |
| `files` | List of `{ "path", "content" }`. The path is relative and stays inside the repo. A path under `.claude/` or `.git/` is refused, so an eval cannot turn off hooks or permission checks. Only `.git/refs/` is allowed. |
| `commit` | Commit all files after the setup. Default true. Set false to leave them uncommitted. |
| `origin` | `true` makes a local bare repo in the temp folder of the run and adds it as the remote `origin`. The runner pushes the setup commit to it, so `origin/main` exists and `main` tracks it. With `"commit": false` the bare repo stays empty. Nothing leaves the machine. |
| `remote` | An https URL. The runner adds it as the remote `origin`. Nothing is fetched or pushed. You cannot use it with `origin`. |
| `branch` | Create this branch from the setup commit and switch to it. |
| `githooks` | Run `git config core.hooksPath .githooks`, after the setup commit. |
| `uncommitted` | List of `{ "path", "content" }`. The runner writes these files after the setup commit and does not commit them. A path can name a committed file, so `git diff` shows a change. Needs the setup commit. |

All of `commit`, `origin`, `remote`, `branch`, `githooks` and `uncommitted` need `gitInit`. The state after `uncommitted` is the baseline. `noRepoChanges` and `onlyFilesChanged` do not count these files until the agent changes them.

An eval with `origin` can test `git push` and `origin/main`. A `Bash(git push:*)` rule in `allowedTools` still needs `--allow-network`.

### `assert` keys

Each check is deterministic. The runner also adds one check to every run, `runCompleted`. It fails when the result is not `success`, for example when the budget ends the run.

| Key | Value | Passes when |
|---|---|---|
| `skillLoaded` | list of skill names | Each skill loaded. See "How a skill load is seen". |
| `skillNotLoaded` | list of skill names | No listed skill loaded. |
| `toolCalled` | list of tool names or `{ "name", "inputMatches", "agent" }` | Each entry matches at least one tool call. |
| `toolNotCalled` | same | No tool call matches any entry. |
| `toolCount` | list of `{ "name", "inputMatches", "agent", "turn", "min", "max" }` | The number of matching tool calls is at least `min` and at most `max`. Give one of them or both. |
| `outputMatches` | list of regex | Each pattern matches the text of the agent. |
| `outputNotMatches` | list of regex | No pattern matches the text of the agent. |
| `fileExists` | list of paths or globs | Each file exists after the run. A glob must match at least one file or folder. |
| `fileAbsent` | list of paths or globs | No listed file exists after the run. A glob must match nothing. |
| `fileMatches` | list of `{ "path", "pattern" }` | The file exists and the regex matches its text. With a glob, the regex matches the text of at least one matching file. |
| `fileNotMatches` | list of `{ "path", "pattern" }` | The file exists and the regex does not match its text. With a glob, at least one file matches and no matching file holds the regex. A missing file fails. |
| `gitBranchExists` | list of branch names | Each local branch exists after the run. |
| `gitCommitCountOn` | `{ "<branch>": n }` or `{ "<branch>": { "min", "max" } }` | The branch has that number of new commits. New means after the setup commit. |
| `hookBlocked` | `true` or a regex | A `PreToolUse` hook exited with code 2. A regex must match the hook message. |
| `hookNotBlocked` | `true` | No `PreToolUse` hook exited with code 2. |
| `noRepoChanges` | `true` | `git status` is as it was after the setup, and no file of `setup.uncommitted` changed. `HEAD` and the local branches are as they were after the setup. |
| `toolOrder` | list of `{ "before", "after", "turn" }` | The first call that matches `before` comes before the first call that matches `after`. Both must happen. Each side is a tool name or `{ "name", "inputMatches", "agent" }`. Use it for "A before B", for example a test file before the code, or an `Agent` call before the report file. |
| `firstTextMatches` | list of regex or `{ "pattern", "turn" }` | The regex matches the first assistant text block. With no `turn`, this is the first text of turn 1. |
| `fileMatchesGlob` | list of globs | Each glob matches at least one file in the repo. `.git` and `node_modules` are not searched. `fileExists` with a glob also matches folders and `$TMPDIR/`. |
| `onlyFilesChanged` | list of globs | Every file that changed since the setup commit matches one glob. A committed change, an edit and a new file count. No change also passes. Needs `gitInit`. |
| `gitWorktreeExists` | `true` or list of branch names | The repo has a second worktree, or a worktree for each listed branch. |
| `scriptPasses` | list of `{ "skill", "script", "file", "args" }` | `node <script> <file> <args>`, run in the repo, exits with 0. Without `skill`, the script is `scripts/<script>.mjs` of the stack. With `skill`, it is `.claude/skills/<skill>/scripts/<script>.mjs` in the temp repo, which the installer copied. That copy must be equal to the copy in the stack and stay inside its skill folder. `skill` and `script` are names with no `/` and no `..`. `skill` and `file` are optional. `eval-run` is not allowed. |

Globs: `*` and `?` stay in one path part, `**` crosses folders, `{a,b}` is a choice. A path with `*`, `?` or `{` is a glob. If a name is not known before the run, use a glob. Examples are the name of a notebook and of a worktree folder.

The asserts `skillLoaded`, `skillNotLoaded`, `toolCalled`, `toolNotCalled`, `toolCount`, `outputMatches`, `outputNotMatches`, `firstTextMatches` and `toolOrder` accept `"turn": n`. A string entry is the same as an entry with no `turn`.

A tool entry can have `"agent": "main"` or `"agent": "subagent"`. The runner reads `parent_tool_use_id` of each stream event. It is null for a call of the main agent. In a subagent it is the id of the `Agent` call. With no `agent`, every call counts. For example, `{ "toolCount": [{ "name": "Skill", "agent": "subagent", "max": 0 }] }` passes only when no subagent called `Skill`.

```json
{
  "toolOrder": [{ "before": "Read", "after": { "name": "Write", "inputMatches": "spec" }, "turn": 1 }],
  "firstTextMatches": ["^Which"],
  "onlyFilesChanged": ["docs/**"],
  "scriptPasses": [{ "script": "spec-lint", "file": "docs/spec.md" }]
}
```

Rules for the values:

- A regex is a plain string such as `"Round 1\\."`. Write `"/pattern/i"` to add flags. Escape a backslash in JSON: `"\\b"`.
- "The text of the agent" is all assistant text blocks of the run, joined. The tool output does not count.
- For `inputMatches`, the runner matches the `command` of a `Bash` call. For other tools it matches the JSON of the input.
- A path is relative to the temp repo. A path that starts with `$TMPDIR/` is relative to the `TMPDIR` folder of the run. The runner sets `TMPDIR` to an empty folder outside the repo.

### How a skill load is seen

A skill that the agent loads by itself shows as a `Skill` tool call. The tool call has the skill name.

A typed skill, such as `/start`, shows no tool call in the stream. For a prompt that starts with `/name`, the runner counts `name` as loaded when the init event lists it as a skill. This proves that the command exists and ran. It does not prove that the agent followed the skill. Use `outputMatches` and file checks for that.

## Run the evals

```
node scripts/eval-run.mjs --dry-run
node scripts/eval-run.mjs --skill grill --runs 3
npm run eval -- --eval _smoke/01-read-only.md
```

For each run, the runner makes a fresh temp folder outside every git repo and prepares the setup. It runs `claude -p` with the project skills, hooks and deny rules. Then it checks the asserts and deletes the folder. It never pushes and never runs `gh`. It refuses an eval whose `allowedTools` can write to the network, unless you pass `--allow-network`. Those tools are a bare `Bash`, `WebFetch`, `WebSearch`, any `mcp__` tool, and any `Bash(...)` rule that names `gh`, `curl`, `git push` or a similar command.

| Flag | Meaning |
|---|---|
| `--skill <name>` | Run the evals of one skill. |
| `--eval <file>` | Run one eval. Use `<skill>/<file>` or the file name. |
| `--runs N` | Runs for each eval and model. Default 1. |
| `--models a,b` | Models to compare. Default is the default model of the agent. |
| `--budget-usd n` | Lower the spend limit of each run to `n` USD. |
| `--min-pass-rate r` | The pass rate that each eval needs. Default 1, which means all runs pass. |
| `--out <dir>` | Folder for `results.json` and the transcripts. Default is a new folder in the system temp folder. |
| `--claude <path>` | The `claude` binary. This flag has the highest priority. See "Which binary the runner uses". |
| `--timeout-sec n` | Time limit of one run. Default 600. A run that times out fails with the assert `timeout`, and the next runs go on. |
| `--jobs n` | Run up to `n` runs at once. Default 1. Each run has its own temp folder and its own budget, so the total budget cap stays the same. |
| `--allow-network` | Allow evals with network tools. |
| `--baseline` | Also run each eval that has a `baseline` field with that skill off. |
| `--gate` | Exit 1 only when a `regression` eval is below `--min-pass-rate`. |
| `--keep` | Keep the temp repo of each run and print its path. The default is to delete it. |
| `--dry-run` | Print the plan, the binary that the runner will use, and the total budget cap. Run nothing. |

### Which binary the runner uses

The runner picks the `claude` binary in this order:

1. The `--claude <path>` flag.
2. The `CLAUDE_BIN` environment variable.
3. The first real `claude` on `PATH`. Then `~/.local/bin/claude`.

The runner prints the binary at the start of every run, for example `Claude binary: /path/claude (from PATH)`. It also writes the path and the source to `claudeBinary` in `results.json`.

The runner refuses a wrapper when it searches `PATH`. A wrapper is a file that starts with a `#!` line, or a file whose real path is under a `cmux-cli-shims` folder. A terminal app can put such a wrapper on `PATH`. The wrapper adds the settings of the owner to the command, so the run loads personal hooks and is not isolated. The runner skips the wrapper and checks the next `claude` on `PATH`. A symlink to a real binary is accepted.

If `PATH` has only wrappers, the runner stops with exit code 2. Pass `--claude <path>` or set `CLAUDE_BIN` to the real binary. The runner trusts a path that you give. It checks only that the path is a file.

The runner also removes every `CMUX_*` variable from the environment of the agent. It removes the `cmux-cli-shims` folders from `PATH` of the agent too. A `--dry-run` prints the binary, or `none`, and exits 0.

### What the runner refuses

The runner never turns off hooks or permission checks. It never passes `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--bare`, `--safe-mode` or `--add-dir`. `claude` has no flag that turns hooks off. The way is the settings value `disableAllHooks`, for example `--settings '{"disableAllHooks": true}'`. The runner refuses any argument that holds `disableAllHooks`, `--bare`, `--dangerously-skip-permissions` or `bypassPermissions`. It also refuses an eval file whose `tools`, `allowedTools` or `disallowedTools` hold that text. The only `--settings` value that the runner passes is the `skillOverrides` value of a baseline run.

### Temp folders

The runner deletes the temp repo of a run on every exit path: a pass, a failure, an error, a timeout, Ctrl+C and a kill. A run that times out is stopped and fails with the assert `timeout`. Pass `--keep` to keep the folders.

The runner sets `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` for every run, also when your environment sets it to `0`. With this value, auto memory writes no notes to `~/.claude/projects/<repo>/memory/`. The runner keeps `CLAUDE_CONFIG_DIR` as it is, because a new folder there has no login.

### Hook blocks

`hookBlocked` and `hookNotBlocked` see two kinds of block. One is a `PreToolUse` hook that exits with code 2. The other is a hook with `"onFailure": "block"` that failed or timed out. For the second kind the `hook_response` event shows exit code 1 (and `outcome` `cancelled` for a timeout), so the exit code does not show the block. The runner reads the tool result instead. It says `hook error: [...]: failed; blocking because onFailure is "block"`. A failed hook without `onFailure` set to `block` does not block, and the runner does not count it.

Exit codes: 0 when every eval meets its pass rate, 1 when one does not, 2 for a usage or setup error. The run stops at the first setup error, for example a missing binary or an expired login.

## What a check cannot see

A deterministic check cannot judge quality. A person or a judge model must read the transcript for these:

- Whether the reply is correct, clear and in the right tone.
- Whether the agent did the real task well. The right steps alone are not enough.
- Whether a refusal gives good reasons.
- Whether a typed skill followed all its steps. The runner sees only the result of a typed skill.
- Whether an answer is complete. A regex proves that words appear, not that they are right.
- A different outcome on a different model that still passes every check.

Keep the prose checklist in each eval for these. The runner saves each transcript in the `transcripts` folder of the output folder.
