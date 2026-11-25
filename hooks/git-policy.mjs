// Pure git command policy. Command string in, decision out. No file reads, no network, no writes.
//
// Adapted from scripts/vcs-command-policy.js in joelhooks/rat-stack (MIT, Copyright (c) 2026 Joel Hooks).
// The tokenizer, the prefix and wrapper skipping, the commit flag scan, the hooksPath check,
// the .git/hooks check and the nested shell check come from that file. See NOTICE.
// New here: the decision shape, branch and push rules, alias, eval and heredoc handling,
// prefix-only env checks, comment and line continuation handling, $'..' quoting, protected paths.
//
// What this policy cannot see, because it only reads the command text:
//   - A git alias defined in the user's own git config (for example `git ci` where ~/.gitconfig
//     says ci = commit --no-verify). The text `git ci` shows nothing. Only aliases defined in the
//     same command (`git -c alias.x=... x`) or set by `git config alias.x ...` are checked.
//   - Script files (`sh run.sh`, `source x`, `./build`) and anything a program runs by itself.
//   - Shell variables and expansions that build a flag (`F=--no-verify git commit $F`,
//     `git commit $(echo -n)`, `git commit --no-ver{ify,}`, `sh -c "$(printf ...)"`, `$B` as a push target).
//   - Data that arrives on a pipe: `echo -- -n | xargs git commit`, `echo .stack/x | xargs rm`, `cat x.sh | sh`,
//     `curl ... | sh`, `echo 'import os...' | python3`. Only `echo` or `printf` text piped into a bare shell is read.
//     A heredoc that feeds an interpreter (`python3 <<EOF`) is read as code.
//   - Config files it cannot read: ~/.gitconfig, include.path in a file, GIT_CONFIG_GLOBAL, push.default and
//     remote.<name>.push set in an earlier command, or a branch whose upstream is main. Setting include.path
//     or includeIf is blocked. `git config --edit` opens an editor, and that is not checked.
//   - Other tools that skip checks with their own variable: SKIP for the pre-commit tool, and any name the project hook reads.
//     Only LEFTHOOK, LEFTHOOK_EXCLUDE, HUSKY and HUSKY_SKIP_HOOKS are read.
//   - Relative moves it cannot follow: `cd -`, a `cd` to a variable, and more than 256 `cd` words. A `cd` to a plain
//     folder is followed, so `cd .git && rm -rf hooks` is blocked. A `cd` in a subshell is read as if it applies to the rest.
//   - Writes that do not name a protected path: `find . -delete`, `rm -rf .`, `cp -a x/. .`, `rsync -a x/ .git/`,
//     `tar -x -C .claude`, `H=.stack; rm $H/x` (an assignment of .git/hooks is blocked, of a guard path is not).
//     `rm`, `mv` and `chmod -R` on the whole folder `.git` or `.claude` are blocked, but `cp -r x .claude` and `rsync --delete` are not.
//   - A guard path that an expansion builds from parts: `rm -rf .sta$(true)ck`, `rm -rf .sta$X`, `$(echo rm) -rf .stack`.
//     A `$(...)` or backtick text is joined to its word, so `rm $(git rev-parse --show-toplevel)/.stack` is read.
//   - A link made earlier, or by a program the policy does not know, and written later: `ln -s .stack /tmp/l` is
//     blocked because it names the guard path, but `/tmp/l` made by `python -c` or by another command is not known.
//   - Brace words with more than 4096 variants or more than 2048 characters. Such a word is blocked only when it
//     names a guard folder in plain text. A guard name split over two groups (`{.s,x}{tack,y}`) is not seen then.
//   - Protected paths are matched by what the command does to them (see "Protected paths" below).
//     A program the policy does not know can write a guard file without being seen: `sort -o`, `curl -o`,
//     an editor. Unknown programs that name .git/hooks are blocked.
//   - Git commands that name a guard path as a pathspec are blocked when they change it: checkout, restore, rm, mv,
//     clean, reset, checkout-index, stash push, apply and am with --directory, and --output or -o file options.
//     A work tree set to a guard folder is blocked. These stay open, because the text does not name a guard path:
//       * A pathspec of `.` or of a parent folder that holds guard files (`git restore .`, `git rm -r .claude`).
//       * Commands that write the work tree from a source that is not a pathspec: `git checkout -f <branch>`,
//         `git reset --hard <commit>`, `git switch -f`, `git checkout-index -a`, `git stash pop`, `git merge`,
//         `git pull`, `git rebase`, `git cherry-pick`, and `git apply` or `git am` with a patch that holds a guard file.
//       * A pathspec that a shell expansion builds (`git rm $DIR/check`). A `$(...)` that names the path is read.
//       * `--pathspec-from-file` is blocked, but a pathspec that arrives on stdin through xargs is not read.
//       * Other git commands that write a named file: `git bundle create`, `git fast-export --export-marks`,
//         `git hash-object -w`, `git update-index --chmod`, `git clone` or `git init` into a guard folder.
//       * For these git commands, `git -C` and `cd` are followed in order. A `cd` in a subshell is read as if it applies to the whole command.
//   - Code strings (`node -e`, `python3 -c`, `sed`, `awk`, `perl -e`) and heredocs for an interpreter that name a
//     protected path are blocked even when the code only reads it, because the text cannot show which.
//     A quoted string in the code that holds a git command is read too (`os.system('git commit -n')`, `['git','push']`).
//     This blocks code that only prints such a string. A command built from pieces ('git commit --no-' + 'verify') is not read.
//     Code that builds a path from pieces (`chr(46) + 'stack'`) is not read. `sed 's/a/b/wfile'` with no space is not read.
//   - Merges and pulls on main are allowed (they sync with upstream). The push rule stops them leaving.
//   - Moves of main that are not a commit and not a push: `git reset --hard` on main, `git fetch . x:main`,
//     `git fetch origin x:main`, `git branch -d main`, and `git branch -m main old` (main renamed away).
//     Blocked: `update-ref`, `branch -f main`, `branch -M main`, `symbolic-ref HEAD main` then a commit, and a work tree for main.
//   - Pushes that do not use `git push`: `git send-pack`, `git http-push`, `git remote` with a pushurl and a hook.
//   - A command text over 256 KB is blocked, and so is a null byte. The shell reads up to a null byte only.
//   - The source folder `hooks/` of this repo is not protected. Only the installed copy `.claude/hooks` is, because `hooks/` is a common folder name.
//   - People and scripts outside Claude Code. Branch protection on the host is the real fence.

import path from "node:path";

// Case is ignored: a case-insensitive disk or host reads `Main` as `main`.
const PROTECTED_BRANCH = /^(?:main|master)$/iu;
const MAX_DEPTH = 8;
const MAX_COMMAND_LENGTH = 256 * 1024;
// Words that expand to more variants than this are not listed. Words longer than this are not expanded.
const MAX_BRACE_VARIANTS = 4096;
const MAX_BRACE_WORD = 2048;
// Work limit for the search of a closing parenthesis, in characters. After it, `$(` is not joined to its word.
const SUBSTITUTION_BUDGET = 2_000_000;

const V = {
  noCommand: {
    rule: "no-command",
    reason: "The hook input has no shell command to check, so it cannot be judged.",
    fix: "Send a Bash tool call with a non-empty tool_input.command.",
  },
  unparseable: {
    rule: "unparseable-command",
    reason: "The command has an unclosed quote, a null byte, or is nested too deeply, so the guard cannot read it.",
    fix: "Close the quote, remove the null byte, or split the command into simpler steps.",
  },
  tooLong: {
    rule: "command-too-long",
    reason: "The command is longer than the guard can check in a safe time (more than 256 KB).",
    fix: "Write the large text to a file with the file tool, then run a short command.",
  },
  noVerify: {
    rule: "no-verify",
    reason: "This command skips the git hooks (--no-verify, a short form of it, or git commit -n).",
    fix: "Drop the flag, read what the hook prints, fix the failure, then commit again.",
  },
  hooksPath: {
    rule: "hooks-path",
    reason: "This command points core.hooksPath somewhere else, which switches the project hooks off.",
    fix: "Leave core.hooksPath alone. Ask the owner if the hooks folder must move.",
  },
  hookEnv: {
    rule: "hook-env",
    reason:
      "This command sets an environment variable that disables the git hooks (LEFTHOOK, HUSKY, LEFTHOOK_EXCLUDE) or sets git config for hooks or aliases (GIT_CONFIG_KEY_n, GIT_CONFIG_PARAMETERS).",
    fix: "Remove the variable and fix what the hook reports.",
  },
  hooksDir: {
    rule: "hooks-dir",
    reason: "This command writes to or removes files under .git/hooks.",
    fix: "Do not edit .git/hooks. Change the hook source in .githooks through the owner.",
  },
  lefthook: {
    rule: "lefthook-uninstall",
    reason: "This command removes the lefthook git hooks.",
    fix: "Keep the hooks installed. Ask the owner before changing hook tooling.",
  },
  protectedPath: {
    rule: "protected-path",
    reason:
      "This command changes a file that holds the guard itself (.githooks, .stack, .git/config, .claude/settings, .claude/hooks).",
    fix: "Do not edit the guard files. Ask the owner to make the change.",
  },
  gitGuardPath: {
    rule: "protected-path",
    reason:
      "This git command restores, removes, moves, cleans or overwrites a path that holds the guard itself (.githooks, .stack, .git/hooks, .git/config, .claude/settings, .claude/hooks).",
    fix: "Do not change guard files with git. A person must make this change. Ask the owner.",
  },
  gitPathspecFile: {
    rule: "protected-path",
    reason:
      "This git command reads its paths from a file, so the guard cannot see whether one of them is a guard file (.githooks, .stack, .git/hooks, .git/config, .claude/settings, .claude/hooks).",
    fix: "Name each path on the command line. A person must change guard files.",
  },
  configInclude: {
    rule: "hooks-path",
    reason: "This command adds a git config include. The included file can set core.hooksPath or an alias, and the guard cannot read it.",
    fix: "Do not add include.path or includeIf. Put the setting in the config directly, and not core.hooksPath.",
  },
  alias: {
    rule: "alias-bypass",
    reason: "This command defines or uses a git alias that expands to a blocked command.",
    fix: "Run the real git command without the alias, and without the blocked flag.",
  },
  commitTree: {
    rule: "commit-tree",
    reason: "git commit-tree makes a commit without running any git hook, so the project check never runs.",
    fix: "Use git commit on a feature branch so the hooks run.",
  },
  commitOnMain: {
    rule: "commit-on-protected-branch",
    reason:
      "This command commits (commit, cherry-pick, revert, am, update-ref) while the current branch is main or master. It can also move main or master (update-ref, branch -f, branch -M).",
    fix: "Create a branch first (git switch -c <name>), commit there and open a pull request.",
  },
  forcePush: {
    rule: "force-push",
    reason: "This command force pushes, which can overwrite other people's commits.",
    fix: "Use git push --force-with-lease on your own branch. Never force push main or master.",
  },
  pushProtected: {
    rule: "push-protected-branch",
    reason: "This command pushes straight to main or master.",
    fix: "Push a feature branch and merge it with a pull request.",
  },
};

const SEGMENT_BREAKS = new Set([";", "&", "|", "(", ")", "`", "\n"]);
const REDIRECTS = new Set([">", ">>", ">|", ">&"]);
const SHELLS = new Set(["bash", "dash", "ksh", "sh", "zsh"]);

// Words that run the rest of the line as a command: wrappers, and shell keywords that start a command.
const WRAPPERS = new Set([
  "builtin", "caffeinate", "chronic", "command", "doas", "env", "exec", "ionice", "nice", "nohup", "setsid",
  "stdbuf", "sudo", "time", "timeout", "unbuffer", "watch", "xargs",
  "!", "{", "do", "elif", "else", "if", "then", "until", "while",
]);
const SUDO_VALUE_OPTS = new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U"]);
const WRAPPER_VALUE_OPTS = new Map([
  ["env", new Set(["-u", "-C"])],
  ["sudo", SUDO_VALUE_OPTS],
  ["doas", new Set(["-u", "-C"])],
  ["nice", new Set(["-n"])],
  ["exec", new Set(["-a"])],
  ["xargs", new Set(["-I", "-n", "-P", "-L", "-s", "-d", "-E", "-a"])],
  ["timeout", new Set(["-s", "-k", "--signal", "--kill-after"])],
  ["watch", new Set(["-n", "--interval"])],
  ["ionice", new Set(["-c", "-n", "-p"])],
  ["caffeinate", new Set(["-t", "-w"])],
]);

// Programs that only read the paths they name. A redirect to a protected path is still caught.
// git, echo and printf are here so a commit message or a note that mentions .git/hooks is not blocked.
// Left out on purpose, because they can write a file they are given: sort -o, uniq, less -o, xxd -r, yq -i.
const READERS = new Set([
  "[", "[[", "ack", "ag", "basename", "bat", "case", "cat", "cksum", "cmp", "column", "comm", "cut", "df", "diff",
  "dirname", "du", "echo", "egrep", "eza", "fgrep", "file", "fold", "for", "git", "grep", "head", "hexdump", "jq",
  "less", "ls", "md5", "md5sum", "more", "nl", "od", "printf", "pwd", "readlink", "realpath", "rev", "rg", "select",
  "sha1sum", "sha256sum", "shasum", "stat", "strings", "tac", "tail", "test", "tree", "type", "wc", "which", "zcat",
  "zgrep",
]);

// Programs that write, remove or re-mode every path they are given.
// ln is here, not in COPY_LIKE, because a link to a guard path lets a later write go through the link.
const WRITE_ALL = new Set([
  "chflags", "chgrp", "chmod", "chown", "ed", "ex", "ln", "mv", "patch", "rm", "rmdir", "sd", "shred", "sponge", "tee",
  "touch", "truncate", "unlink",
]);
// cp, install, ditto and rsync write only their destination: the last operand or the -t value.
const COPY_LIKE = new Set(["cp", "ditto", "install", "rsync"]);
// Programs that delete or move a whole folder. Their operand `.git` or `.claude` holds guard files.
const FOLDER_DESTROYERS = new Set(["mv", "rm", "rmdir", "shred", "unlink"]);
// Programs that name an output file in an option. The value after the option is written.
const OUTPUT_OPTIONS = new Map([
  ["curl", { short: new Set(["-o", "-D", "-c"]), long: new Set(["--output", "--output-dir", "--dump-header", "--cookie-jar", "--trace"]) }],
  ["wget", { short: new Set(["-O", "-P", "-o", "-a"]), long: new Set(["--output-document", "--directory-prefix", "--output-file", "--append-output"]) }],
  ["unzip", { short: new Set(["-d"]), long: new Set() }],
  ["sort", { short: new Set(["-o"]), long: new Set(["--output"]) }],
]);
// Programs that rewrite a file only with an in-place flag. Their code string can still write.
const IN_PLACE = new Set(["awk", "gawk", "perl", "ruby", "sed", "gsed"]);
// Programs that take inline code. A protected path inside a code string means the code may write it.
// Version suffixes are cut first (python3.12 is python, perl5.34 is perl).
const INLINE_CODE = new Set([
  "Rscript", "awk", "bun", "deno", "gawk", "gsed", "julia", "lua", "luajit", "mawk", "nawk", "node", "nodejs", "osascript",
  "perl", "php", "pwsh", "pypy", "python", "ruby", "sed", "swift", "tclsh",
]);
// Programs that run a command string they are given.
const STRING_RUNNERS = new Set(["flock", "parallel", "runuser", "script", "ssh", "su", "watch"]);
const TAR = new Set(["bsdtar", "gtar", "tar"]);
const GUARD_PATH =
  /(?:^|[^\w.-])(?:\.githooks|\.stack|\.git\/config|\.git\/(?:head|packed-refs|refs\/heads\/(?:main|master))|\.claude\/(?:settings(?:\.local)?\.json|hooks))(?![\w.-])/u;
// Sample protected paths. A glob word that matches one of them may expand to it.
const GUARD_SAMPLES = [
  ".githooks", ".githooks/prepare-commit-msg", ".stack", ".stack/check", ".git/config",
  ".claude/settings.json", ".claude/settings.local.json", ".claude/hooks", ".claude/hooks/guard-git.mjs",
  ".git/HEAD", ".git/packed-refs", ".git/refs/heads/main", ".git/refs/heads/master",
];
const HOOKS_SAMPLES = [".git/hooks", ".git/hooks/pre-commit"];

const GIT_GLOBALS_WITH_VALUE = new Set([
  "--attr-source", "--exec-path", "--git-dir", "--namespace", "--super-prefix", "--work-tree", "-C",
]);

const COMMIT_SHORT_WITH_VALUE = new Set(["C", "F", "c", "m", "t"]);
const COMMIT_LONG_WITH_VALUE = new Set([
  "--author", "--cleanup", "--date", "--file", "--fixup", "--message", "--pathspec-from-file",
  "--reedit-message", "--reuse-message", "--squash", "--template", "--trailer",
]);

const PUSH_OPTS_WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);

const CONFIG_READS = new Set(["--get", "--get-all", "--get-regexp", "--list", "-l", "get", "list"]);
// Unsetting core.hooksPath or dropping the [core] section moves hooks back to .git/hooks, away from .githooks.
const CONFIG_UNSETS = new Set(["--unset", "--unset-all", "unset"]);
const CONFIG_SECTION_EDITS = new Set(["--remove-section", "--rename-section", "remove-section", "rename-section"]);
// Commands that write a new commit on the current branch, and the flags that make them not commit.
const COMMIT_MAKERS = new Set(["am", "cherry-pick", "revert"]);
const NO_NEW_COMMIT = new Set(["--abort", "--quit", "--skip", "--show-current-patch", "-n", "--no-commit"]);

const NO_VERIFY = "--no-verify";
const TEXT_COMMANDS = new Set([
  "blame", "branch", "describe", "diff", "for-each-ref", "grep", "log", "ls-files", "name-rev", "notes", "range-diff",
  "reflog", "rev-list", "shortlog", "show", "stash", "tag", "whatchanged",
]);
const NO_VERIFY_SHORTEST_PREFIX = "--no-veri".length;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;

/** @typedef {{ text: string, operator: boolean, assignable: boolean }} Token */

const decodeAnsiC = (body) =>
  body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|c.|[ntrabefvE\\'"?])/gu, (_m, code) => {
    if (code[0] === "x" || code[0] === "u" || code[0] === "U") {
      return String.fromCodePoint(Math.min(Number.parseInt(code.slice(1), 16), 0x10ffff));
    }
    if (/^[0-7]/u.test(code)) return String.fromCharCode(Number.parseInt(code, 8));
    if (code[0] === "c") return String.fromCharCode(code.charCodeAt(1) & 31);
    return { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v" }[code] ?? code;
  });

/** Index of the `)` that closes the `$(` at `start`, or -1. Quotes are skipped. */
const substitutionEnd = (command, start, budget) => {
  let depth = 0;
  let quote = null;
  for (let index = start + 1; index < command.length; index += 1) {
    budget.left -= 1;
    if (budget.left < 0) return -1;
    const char = command.charAt(index);
    if (quote !== null) {
      if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = null;
    } else if (char === "\\") {
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

/**
 * Split a command into segments of tokens. Returns whether a quote was left open.
 * @param {string} command
 * @returns {{ segments: Token[][], unterminated: boolean }}
 */
const segmentsOf = (command) => {
  /** @type {Token[][]} */
  const segments = [[]];
  const budget = { left: SUBSTITUTION_BUDGET };
  let text = "";
  let started = false;
  let assignable = true;
  /** @type {"'" | "\"" | "$'" | null} */
  let quote = null;
  let ansi = "";

  const current = () => segments.at(-1) ?? [];
  const finish = () => {
    if (started) current().push({ assignable, operator: false, text });
    text = "";
    started = false;
    assignable = true;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);

    if (quote === "$'") {
      if (char === "\\" && index + 1 < command.length) {
        ansi += char + command.charAt(index + 1);
        index += 1;
      } else if (char === "'") {
        text += decodeAnsiC(ansi);
        quote = null;
      } else {
        ansi += char;
      }
    } else if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && command.charAt(index + 1) === "\n") {
        index += 1;
      } else if (char === "\\" && quote === '"' && index + 1 < command.length) {
        index += 1;
        text += command.charAt(index);
      } else {
        text += char;
      }
    } else if (char === "$" && command.charAt(index + 1) === "'") {
      if (!started) assignable = false;
      quote = "$'";
      ansi = "";
      started = true;
      index += 1;
    } else if (char === "$" && command.charAt(index + 1) === '"') {
      if (!started) assignable = false;
      quote = '"';
      started = true;
      index += 1;
    } else if (char === "'" || char === '"') {
      if (!started) assignable = false;
      quote = char;
      started = true;
    } else if (char === "$" && command.charAt(index + 1) === "(" && command.charAt(index + 2) !== "(" && substitutionEnd(command, index, budget) !== -1) {
      // A substitution is part of its word, so `$(git rev-parse --show-toplevel)/.githooks` stays one path.
      if (!started) assignable = false;
      const end = substitutionEnd(command, index, budget);
      text += command.slice(index, end + 1);
      started = true;
      index = end;
    } else if (char === "`" && command.indexOf("`", index + 1) !== -1) {
      if (!started) assignable = false;
      const end = command.indexOf("`", index + 1);
      text += command.slice(index, end + 1);
      started = true;
      index = end;
    } else if (char === "\\" && command.charAt(index + 1) === "\n") {
      index += 1;
    } else if (char === "\\" && index + 1 < command.length) {
      index += 1;
      text += command.charAt(index);
      started = true;
    } else if (char === "#" && !started) {
      while (index + 1 < command.length && command.charAt(index + 1) !== "\n") index += 1;
    } else if (/\s/u.test(char) && char !== "\n") {
      finish();
    } else if (SEGMENT_BREAKS.has(char)) {
      finish();
      segments.push([]);
    } else if (char === ">") {
      finish();
      const next = command.charAt(index + 1);
      const operator = next === ">" || next === "|" || next === "&" ? `>${next}` : ">";
      index += operator.length - 1;
      current().push({ assignable: false, operator: true, text: operator });
    } else {
      text += char;
      started = true;
    }
  }

  const unterminated = quote !== null;
  finish();

  return { segments: segments.filter((segment) => segment.length > 0), unterminated };
};

/**
 * Cut heredoc bodies out of the text. A body is data, unless the line feeds it to a shell.
 * @param {string} command
 * @returns {{ text: string, shellBodies: string[], codeBodies: string[] }}
 */
const stripHeredocs = (command) => {
  const shellBodies = [];
  const codeBodies = [];
  /** @type {{ delimiter: string, quoted: boolean }[]} */
  let pending = [];
  /** @type {"'" | "\"" | "$'" | null} */
  let quote = null;
  let out = "";
  let lineStart = 0;

  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    const next = command.charAt(index + 1);

    if (quote !== null) {
      out += char;
      if (char === "\\" && quote !== "'") {
        out += next;
        index += 1;
      } else if (char === (quote === "$'" ? "'" : quote)) {
        quote = null;
      }
    } else if (char === "\\") {
      out += char + next;
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === "$" && next === "'") {
      quote = "$'";
      out += "$'";
      index += 1;
    } else if (char === "#" && (index === 0 || /[\s;&|()<>]/u.test(command.charAt(index - 1)))) {
      const end = command.indexOf("\n", index);
      out += command.slice(index, end === -1 ? command.length : end);
      index = (end === -1 ? command.length : end) - 1;
    } else if (command.startsWith("$((", index)) {
      let depth = 0;
      let end = index + 1;
      for (; end < command.length; end += 1) {
        if (command.charAt(end) === "(") depth += 1;
        if (command.charAt(end) === ")") depth -= 1;
        if (depth === 0) break;
      }
      out += command.slice(index, end + 1);
      index = end;
    } else if (command.startsWith("<<", index) && command.charAt(index + 2) !== "<" && command.charAt(index - 1) !== "<") {
      const word = /^<<-?[ \t]*((?:[^\s;&|()<>'"\\]|\\.|'[^']*'|"[^"]*")*)/u.exec(command.slice(index));
      const raw = word?.[1] ?? "";
      if (raw !== "") {
        pending.push({ delimiter: raw.replace(/\\(.)/gu, "$1").replace(/['"]/gu, ""), quoted: /['"\\]/u.test(raw) });
      }
      out += word?.[0] ?? "<<";
      index += (word?.[0] ?? "<<").length - 1;
    } else if (char === "\n" && pending.length > 0) {
      const line = out.slice(lineStart);
      const feedsShell = /(?:^|[\s;&|(/])(?:bash|sh|zsh|dash|ksh)(?=$|[\s;&|)<])/u.test(line);
      const feedsCode = /(?:^|[\s;&|(/])(?:python[\d.]*|pypy[\d.]*|node(?:js)?|bun|deno|ruby[\d.]*|perl[\d.]*|php[\d.]*|lua[\d.]*|osascript|Rscript|julia|swift)(?=$|[\s;&|)<])/u.test(line);
      out += "\n";
      let cursor = index + 1;
      for (const { delimiter, quoted } of pending) {
        const body = [];
        while (cursor < command.length) {
          const end = command.indexOf("\n", cursor);
          const bodyLine = command.slice(cursor, end === -1 ? command.length : end);
          cursor = end === -1 ? command.length : end + 1;
          if (bodyLine.trim() === delimiter) break;
          body.push(bodyLine);
        }
        const text = body.join("\n");
        if (feedsShell) shellBodies.push(text);
        else if (feedsCode) codeBodies.push(text);
        else if (!quoted) shellBodies.push(...substitutionBodies(text));
      }
      pending = [];
      index = cursor - 1;
      lineStart = out.length;
    } else {
      out += char;
      if (char === "\n") lineStart = out.length;
    }
  }

  return { text: out, shellBodies, codeBodies };
};

/**
 * Bodies of $(...) and `...` outside single quotes. Needed for substitutions inside double quotes.
 * @param {string} text
 * @returns {string[]}
 */
const substitutionBodies = (text) => {
  const found = [];
  let single = false;
  let double = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);

    if (single) {
      if (char === "'") single = false;
    } else if (char === "\\") {
      index += 1;
    } else if (char === "'" && !double) {
      single = true;
    } else if (char === '"') {
      double = !double;
    } else if (char === "$" && text.charAt(index + 1) === "(") {
      let depth = 1;
      let end = index + 2;
      while (end < text.length && depth > 0) {
        if (text.charAt(end) === "(") depth += 1;
        if (text.charAt(end) === ")") depth -= 1;
        end += 1;
      }
      found.push(text.slice(index + 2, depth === 0 ? end - 1 : end));
      // Inner substitutions are found when the body is scanned. Reading on from here would be quadratic.
      index = end - 1;
    } else if (char === "`") {
      const end = text.indexOf("`", index + 1);
      found.push(text.slice(index + 1, end === -1 ? text.length : end));
      if (end !== -1) index = end;
    }
  }

  return found;
};

const GIT_LOOKUP = /\$\(\s*(?:command\s+-v|type\s+-p|which|\/usr\/bin\/which)\s+git\s*\)|`\s*(?:command\s+-v|type\s+-p|which)\s+git\s*`/gu;

const basename = (word) => word.slice(word.lastIndexOf("/") + 1);

const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gu;

/**
 * Git commands inside the code of an interpreter. The quoted strings of the code are read as commands.
 * A list such as ['git', 'commit', '-n'] is joined. A string built by joining pieces is not read.
 * @param {string} code
 */
const gitInCode = (code, state, depth) => {
  if (!/\bgit\b/u.test(code) || depth >= MAX_DEPTH) return null;

  const tries = [];
  for (const text of [code, ...code.split("\n")]) {
    const literals = [...text.matchAll(STRING_LITERAL)].map((match) => match[2] ?? "");
    literals.forEach((literal, at) => {
      if (/(?:^|[\s/])git(?:\s|$)/u.test(literal)) tries.push(literal);
      if (basename(literal) === "git") tries.push(literals.slice(at, at + 40).join(" "));
    });
  }

  for (const text of new Set(tries)) {
    const found = scan(text, state, depth + 1);
    if (found !== null && found !== V.unparseable) return found;
  }
  return null;
};

/** Whether a shell glob word (with * ? [..]) matches the text. Words without glob characters never match. */
const globMatches = (pattern, text) => {
  if (!/[*?[]/u.test(pattern)) return false;
  const source = pattern
    .replace(/[.+^${}()|\\]/gu, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]");
  try {
    return new RegExp(`^${source}$`, "u").test(text);
  } catch {
    return false;
  }
};

/** Collapse `//` and `/./` so `.git//hooks` reads as `.git/hooks`. */
const normalizePath = (word) => word.replace(/\/{2,}/gu, "/").replace(/\/\.(?=\/)/gu, "");

/** A glob segment matches a name. As in the shell, `*` and `?` do not match a leading dot. */
const segmentMatches = (pattern, name) =>
  pattern === name || (!(name.startsWith(".") && !pattern.startsWith(".")) && globMatches(pattern, name));

/** Whether a glob word can expand to one of the sample paths. Its last segments are compared. */
const globHits = (word, samples) => {
  if (!/[*?[]/u.test(word)) return false;
  const parts = normalizePath(word).replace(/\/$/u, "").split("/");
  return samples.some((sample) => {
    const want = sample.split("/");
    const tail = parts.slice(-want.length);
    return parts.length >= want.length && want.every((name, at) => segmentMatches(tail[at] ?? "", name));
  });
};

/** The program a word runs: zsh `=git` and globs like `/usr/bin/gi?` both run git. */
const programName = (word) => {
  const name = basename(word.replace(/^=/u, ""));
  return globMatches(name, "git") ? "git" : name;
};

const disablesHooks = (token) => {
  if (!token.assignable || !ASSIGNMENT.test(token.text)) return false;

  const [name = "", ...rest] = token.text.split("=");
  const value = rest.join("=").trim().toLowerCase();

  return (
    (name === "LEFTHOOK" && (value === "0" || value === "false")) ||
    (name === "HUSKY" && value === "0") ||
    (name === "HUSKY_SKIP_HOOKS" && value !== "" && value !== "0") ||
    (name === "LEFTHOOK_EXCLUDE" && value !== "") ||
    (/^GIT_CONFIG_KEY_\d+$/u.test(name) && (value === "core.hookspath" || value.startsWith("alias."))) ||
    (name === "GIT_CONFIG_PARAMETERS" && (value.includes("core.hookspath") || value.includes("alias.")))
  );
};

/**
 * Peel off leading VAR=value words and wrapper commands (env, sudo, command, timeout ...).
 * `env -S 'cmd'` hands its string to a new command line, returned as `split`.
 * @param {Token[]} tokens
 * @returns {{ assignments: Token[], words: Token[], split: string | null }}
 */
const splitPrefix = (tokens) => {
  const assignments = [];
  let index = 0;
  let split = null;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;

    if (token.assignable && ASSIGNMENT.test(token.text)) {
      assignments.push(token);
      index += 1;
      continue;
    }

    const wrapper = basename(token.text);
    if (!WRAPPERS.has(wrapper)) break;

    index += 1;
    const valueOpts = WRAPPER_VALUE_OPTS.get(wrapper) ?? new Set();
    while ((tokens[index]?.text ?? "").length > 1 && (tokens[index]?.text ?? "").startsWith("-")) {
      const option = tokens[index]?.text ?? "";
      if (wrapper === "env" && /^(?:-S|--split-string)$/u.test(option)) {
        split = tokens[index + 1]?.text ?? "";
        index += 2;
        break;
      }
      if (wrapper === "env" && /^(?:-S.|--split-string=)/u.test(option)) {
        split = option.replace(/^(?:-S|--split-string=)/u, "");
        index += 1;
        break;
      }
      index += valueOpts.has(option) ? 2 : 1;
    }
    if (split !== null) break;
    if (wrapper === "timeout" && /^\.?\d/u.test(tokens[index]?.text ?? "")) index += 1;
  }

  return { assignments, words: tokens.slice(index), split };
};

const isNoVerify = (arg) => arg.length >= NO_VERIFY_SHORTEST_PREFIX && NO_VERIFY.startsWith(arg);

const setsHooksPath = (setting) => setting.split("=")[0]?.trim().toLowerCase() === "core.hookspath";
// include.path and includeIf.<condition>.path load a file the guard cannot read.
const setsInclude = (setting) => /^include(?:if\..+)?\.path$/u.test(setting.split("=")[0]?.trim().toLowerCase() ?? "");

const commitSkipsHooks = (args) => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (arg === "--") return false;
    if (isNoVerify(arg)) return true;

    if (COMMIT_LONG_WITH_VALUE.has(arg)) {
      index += 1;
    } else if (/^-[^-]/u.test(arg)) {
      for (let flag = 1; flag < arg.length; flag += 1) {
        const char = arg.charAt(flag);

        if (char === "n") return true;

        // -u<mode> and -S<keyid> take an optional value in the same word (-uno is untracked-files=no).
        if (char === "u" || char === "S") break;

        if (COMMIT_SHORT_WITH_VALUE.has(char)) {
          if (flag === arg.length - 1) index += 1;
          break;
        }
      }
    }
  }

  return false;
};

const configSetsKey = (args, isKey) => {
  const key = args.findIndex(isKey);

  if (key === -1) return false;
  if (args.some((arg) => CONFIG_UNSETS.has(arg))) return true;
  if (args.some((arg) => CONFIG_READS.has(arg))) return false;

  return (args[key] ?? "").includes("=") || key < args.length - 1;
};

const configSetsHooksPath = (args) => {
  const section = args.findIndex((arg) => CONFIG_SECTION_EDITS.has(arg));
  if (section !== -1 && (args[section + 1] ?? "").toLowerCase() === "core") return true;

  return configSetsKey(args, setsHooksPath);
};

/** The value a config setting gives remote.<name>.push, from `key=value` or `key value`. */
const pushRefspecSetting = (key, value) => (/^remote\..+\.push$/iu.test(key) ? value : null);

const isProtectedBranch = (name) => PROTECTED_BRANCH.test(name ?? "");

/** Branch a push or commit lands on: an override from a checkout earlier in the command, else the lookup. */
const currentBranch = (state, localDirs) => {
  if (localDirs.length === 0 && state.branch !== null) return state.branch;
  // A work tree that this command made for main: the folder does not exist yet when the hook runs.
  if (state.mainTrees.length > 0) {
    const folders = [...state.dirs, ...localDirs].map((dir) => path.posix.normalize(dir));
    if (state.mainTrees.some((tree) => folders.includes(tree))) return "main";
  }
  if (typeof state.ctx.branchOf !== "function") return null;

  return state.ctx.branchOf([...state.dirs, ...localDirs]) ?? null;
};

const refDestination = (spec) => {
  const target = spec.replace(/^\+/u, "");
  const dest = target.includes(":") ? target.slice(target.lastIndexOf(":") + 1) : target;

  // git also reads `heads/main` as refs/heads/main.
  return dest.replace(/^(?:refs\/)?heads\//u, "");
};

/** Why a push refspec is blocked: force (+), a protected target, or a pattern that can cover main. */
const refspecViolation = (spec, branch) => {
  if (spec.startsWith("+")) return V.forcePush;
  const dest = refDestination(spec);
  if (isProtectedBranch(dest) || dest.includes("*")) return V.pushProtected;
  if (isProtectedBranch(branch) && (dest === "HEAD" || dest === "@" || dest === "" || /[$`]/u.test(spec))) {
    return V.pushProtected;
  }
  return null;
};

const isDryRun = (arg) => arg.length >= 4 && "--dry-run".startsWith(arg);
// --no-dry-run turns a dry run off again. The last flag wins.
const isNoDryRun = (arg) => arg.length >= 8 && "--no-dry-run".startsWith(arg);

const pushViolation = (args, state, localDirs) => {
  const positional = [];
  let force = false;
  let pushesAll = false;
  let tagsOnly = false;
  let hasRepoOption = false;
  let rest = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (rest || !arg.startsWith("-") || arg === "-") {
      positional.push(arg);
    } else if (arg === "--") {
      rest = true;
    } else if (PUSH_OPTS_WITH_VALUE.has(arg)) {
      if (arg === "--repo") hasRepoOption = true;
      index += 1;
    } else if (arg.startsWith("--")) {
      if (arg === "--force") force = true;
      if (arg === "--all" || arg === "--mirror") pushesAll = true;
      if (arg === "--tags") tagsOnly = true;
      if (arg.startsWith("--repo=")) hasRepoOption = true;
      if (isDryRun(arg)) dryRun = true;
      if (isNoDryRun(arg)) dryRun = false;
    } else if (/^-[A-Za-z]+$/u.test(arg)) {
      // Short flags stop at -o, whose value can follow in the same word (-ofoo).
      const flags = arg.slice(1).replace(/o.*$/u, "");
      if (flags.includes("f")) force = true;
      if (flags.includes("n")) dryRun = true;
    }
  }

  // A dry run sends nothing, so the force and main rules do not apply.
  if (dryRun) return null;

  const refspecs = positional.slice(hasRepoOption ? 0 : 1);

  if (force || refspecs.some((spec) => spec.startsWith("+"))) return V.forcePush;
  if (pushesAll) return V.pushProtected;

  const branch = currentBranch(state, localDirs);

  if (refspecs.length === 0) {
    return !tagsOnly && isProtectedBranch(branch) ? V.pushProtected : null;
  }

  for (const spec of refspecs) {
    const found = refspecViolation(spec, branch);
    if (found !== null) return found;
  }

  return null;
};

const trackBranchSwitch = (subcommand, rest, state, localDirs) => {
  if (localDirs.length > 0) return;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? "";
    if (arg === "--") return;

    if (["-b", "-B", "-c", "-C"].includes(arg) && index + 1 < rest.length) {
      state.branch = rest[index + 1] ?? null;
      return;
    }
    if (!arg.startsWith("-")) {
      // `git checkout <rev> <path>` and `git checkout <rev> -- <path>` restore files and stay on the branch.
      if (subcommand === "checkout" && rest.slice(index + 1).some((word) => word === "--" || !word.startsWith("-"))) return;
      // `git checkout <word>` may restore a file and stay on the branch, so it only counts toward main.
      if (subcommand === "switch" || isProtectedBranch(arg)) state.branch = arg;
      return;
    }
  }
};

// ---- Git commands that write a guard file through a pathspec.
// These commands change the files they name: checkout, restore, rm, mv, clean, reset, checkout-index, stash push.
// The policy reads each pathspec word. It joins the word to the directories from `git -C` and `cd`
// and resolves `..`, so `git -C .claude restore settings.json` is read as `.claude/settings.json`.
// Options that take a value which is not a path are skipped (for example `checkout -b <name>`).
const PATHSPEC_COMMANDS = new Set(["checkout", "restore", "rm", "mv", "clean", "reset", "checkout-index", "stash"]);
const PATHSPEC_VALUE_OPTS = new Map([
  ["checkout", new Set(["-b", "-B", "--orphan", "--conflict"])],
  ["restore", new Set(["-s", "--source"])],
  ["clean", new Set(["-e", "--exclude"])],
  ["stash", new Set(["-m", "--message"])],
]);
const STASH_NO_PATH = new Set(["pop", "apply", "drop", "list", "show", "branch", "clear", "create", "store"]);
// Commands that write the work tree. A work tree set to a guard folder makes every one of them a guard write.
const WORK_TREE_WRITERS = new Set([
  ...PATHSPEC_COMMANDS, "am", "apply", "cherry-pick", "merge", "pull", "rebase", "revert", "switch",
]);

/** The pathspec words in `rest`, and whether the command only shows what it would do. */
const pathspecWords = (subcommand, rest) => {
  if (subcommand === "stash" && STASH_NO_PATH.has(rest[0] ?? "")) return { words: [], dry: false, fromFile: false };

  const valueOpts = PATHSPEC_VALUE_OPTS.get(subcommand) ?? new Set();
  const words = [];
  let dry = false;
  let fromFile = false;
  let ended = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? "";

    if (ended) {
      words.push(arg);
    } else if (arg === "--") {
      ended = true;
    } else if (arg.startsWith("--pathspec-from-file")) {
      fromFile = true;
    } else if (subcommand === "checkout-index" && arg.startsWith("--prefix")) {
      words.push(arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (rest[(index += 1)] ?? ""));
    } else if (arg.startsWith("-") && arg !== "-") {
      if (arg === "--dry-run" || (/^-[A-Za-z]*n[A-Za-z]*$/u.test(arg) && (subcommand === "rm" || subcommand === "clean"))) dry = true;
      if (arg === "--no-dry-run") dry = false;
      if (valueOpts.has(arg) || (subcommand === "clean" && /^-[A-Za-z]*e$/u.test(arg))) index += 1;
    } else if (!(subcommand === "stash" && /^(?:save)$/u.test(rest[0] ?? "") && arg !== rest[0])) {
      words.push(arg);
    }
  }

  return { words, dry: dry && (subcommand === "rm" || subcommand === "clean"), fromFile };
};

/** A pathspec word without its magic prefix, or null when the magic excludes the path (`:!x`, `:(exclude)x`). */
const stripMagic = (word) => {
  if (!word.startsWith(":")) return word;
  const magic = /^:(?:\(([^)]*)\)|[/!^]*)/u.exec(word);
  const flags = magic?.[1] ?? magic?.[0] ?? "";
  if (/exclude|[!^]/u.test(flags)) return null;
  return word.slice(magic?.[0].length ?? 0);
};

/** The word as written and the word joined to the directories seen so far, with `..` resolved. */
const pathCandidates = (word, roots) => {
  const bare = stripMagic(word);
  if (bare === null || bare === "") return [];

  let dir = ".";
  for (const root of roots) dir = /^[/~]/u.test(root) ? root : path.posix.join(dir, root);
  const joined = /^[/~]/u.test(bare) ? bare : path.posix.join(dir, bare);

  return [...new Set([path.posix.normalize(bare), path.posix.normalize(joined)])];
};

/** The rule a git command breaks when it names a guard path as a pathspec, or null. */
const gitPathVerdict = (subcommand, rest, state, frame) => {
  const roots = [...state.dirs, ...frame.localDirs];
  const names = (word) => pathCandidates(word, roots).some((candidate) => verdictOf(candidate) !== null);

  if (WORK_TREE_WRITERS.has(subcommand) && (frame.workTrees ?? []).some(names)) return V.gitGuardPath;

  // `git -C .stack clean -fd` and `cd .stack && git reset --hard` change files inside a guard folder.
  if (WORK_TREE_WRITERS.has(subcommand) && roots.length > 0 && names(".")) return V.gitGuardPath;

  if (subcommand === "apply" || subcommand === "am") {
    const at = rest.findIndex((arg) => arg === "--directory" || arg.startsWith("--directory="));
    const value = at === -1 ? "" : (rest[at] ?? "").includes("=") ? (rest[at] ?? "").slice("--directory=".length) : (rest[at + 1] ?? "");
    if (value !== "" && names(value)) return V.gitGuardPath;
  }

  // Options that write a file: git diff --output=<file>, git archive -o <file>, git format-patch -o <dir>.
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? "";
    if (arg === "--") break;
    const short = (subcommand === "archive" || subcommand === "format-patch") && arg === "-o";
    const long = /^--output(?:-directory)?(?:=|$)/u.test(arg);
    if (!short && !long) continue;
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (rest[index + 1] ?? "");
    if (value !== "" && names(value)) return V.gitGuardPath;
  }

  if (!PATHSPEC_COMMANDS.has(subcommand)) return null;

  const { words, dry, fromFile } = pathspecWords(subcommand, rest);
  if (dry) return null;
  if (fromFile) return V.gitPathspecFile;

  return words.some(names) ? V.gitGuardPath : null;
};

const aliasTokens = (value) => (segmentsOf(value).segments[0] ?? []).map((token) => token.text);

/**
 * @param {string} subcommand
 * @param {string[]} rest
 * @param {object} state
 * @param {{ aliases: Map<string,string>, localDirs: string[], workTrees?: string[] }} frame
 * @param {number} depth
 */
const checkSubcommand = (subcommand, rest, state, frame, depth) => {
  // git alias names are case-insensitive config keys.
  const alias = frame.aliases.get(subcommand.toLowerCase());

  if (alias !== undefined && depth < MAX_DEPTH) {
    // A shell alias gets the arguments after its text: `!git commit` run as `git x -n` is `git commit -n`.
    const quoted = rest.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`);
    // "$@", "$*" and $1 in the alias text stand for those arguments.
    const filled = alias
      .replace(/"?\$[@*]"?/gu, quoted.join(" "))
      .replace(/"?\$(\d)"?/gu, (_m, digit) => quoted[Number(digit) - 1] ?? "");
    const inner = alias.startsWith("!")
      ? scan([filled.slice(1), ...quoted].join(" "), state, depth + 1)
      : (() => {
          const [first = "", ...more] = [...aliasTokens(alias), ...rest];
          return checkSubcommand(first, more, state, frame, depth + 1);
        })();

    return inner === null ? null : { ...V.alias, reason: `${V.alias.reason} Inner rule: ${inner.rule}. ${inner.reason}` };
  }

  if (subcommand === "commit") {
    if (commitSkipsHooks(rest)) return V.noVerify;
    return isProtectedBranch(currentBranch(state, frame.localDirs)) ? V.commitOnMain : null;
  }

  // These commands search or show text, so a word like --no-verify in them is data.
  if (!TEXT_COMMANDS.has(subcommand) && rest.some(isNoVerify)) return V.noVerify;

  const guarded = gitPathVerdict(subcommand, rest, state, frame);
  if (guarded !== null) return guarded;

  if (subcommand === "commit-tree") return V.commitTree;

  if (subcommand === "update-ref") {
    // --stdin reads the ref names from a pipe, so they cannot be checked.
    if (rest.some((arg) => /^refs\/heads\/(?:main|master)$/iu.test(arg) || arg === "--stdin")) return V.commitOnMain;
    if (rest.includes("HEAD") && isProtectedBranch(currentBranch(state, frame.localDirs))) return V.commitOnMain;
  }

  if (subcommand === "branch") {
    const names = rest.filter((arg) => !arg.startsWith("-"));
    const moves = rest.some((arg) => /^(?:--move|--copy|-[A-Za-z]*[MmCc][A-Za-z]*)$/u.test(arg));
    const forced = rest.some((arg) => arg === "--force" || /^-[A-Za-z]*f[A-Za-z]*$/u.test(arg));
    // `branch -m x main` and `branch -M main` write main. `branch -f main <start>` moves it.
    // Renaming main away is not checked. A start point named main (`branch -f feature main`) is fine.
    if (moves && names.slice(-1).some(isProtectedBranch)) return V.commitOnMain;
    if (!moves && forced && names.slice(0, 1).some(isProtectedBranch)) return V.commitOnMain;
  }

  if (subcommand === "symbolic-ref" && frame.localDirs.length === 0) {
    const [target, value] = rest.filter((arg) => !arg.startsWith("-"));
    if (target === "HEAD" && value !== undefined) state.branch = value.replace(/^refs\/heads\//u, "");
  }

  if (subcommand === "worktree" && rest[0] === "add") {
    const args = rest.slice(1);
    const named = [];
    const positional = [];
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index] ?? "";
      if (arg === "-b" || arg === "-B") named.push(args[(index += 1)] ?? "");
      else if (/^-[bB]./u.test(arg)) named.push(arg.slice(2));
      else if (arg === "--reason") index += 1;
      else if (!arg.startsWith("-")) positional.push(arg);
    }
    const [folder, commitish] = positional;
    // The branch of the new tree is the -b or -B name, or else the commit-ish.
    const branch = named[0] ?? commitish ?? "";
    if (folder !== undefined && isProtectedBranch(branch)) state.mainTrees.push(path.posix.normalize(folder));
  }

  if (COMMIT_MAKERS.has(subcommand) && !rest.some((arg) => NO_NEW_COMMIT.has(arg))) {
    return isProtectedBranch(currentBranch(state, frame.localDirs)) ? V.commitOnMain : null;
  }

  if (subcommand === "push") return pushViolation(rest, state, frame.localDirs);

  if (subcommand === "checkout" || subcommand === "switch") {
    trackBranchSwitch(subcommand, rest, state, frame.localDirs);
    return null;
  }

  if (subcommand === "config") {
    if (configSetsHooksPath(rest)) return V.hooksPath;
    if (configSetsKey(rest, setsInclude)) return V.configInclude;

    const pushKey = rest.findIndex((arg) => pushRefspecSetting(arg, "") !== null);
    const pushValue = pushKey === -1 ? undefined : rest[pushKey + 1];
    if (pushValue !== undefined) {
      const found = refspecViolation(pushValue, null);
      if (found !== null) return found;
    }

    const key = rest.findIndex((arg) => arg.toLowerCase().startsWith("alias."));
    const value = key === -1 ? undefined : rest[key + 1];
    if (value !== undefined && key !== -1) state.aliases.set((rest[key] ?? "").slice("alias.".length).toLowerCase(), value);
    if (value !== undefined && depth < MAX_DEPTH) {
      const probe = new Map([["__probe__", value]]);
      const inner = checkSubcommand("__probe__", [], state, { aliases: probe, localDirs: frame.localDirs }, depth + 1);
      if (inner !== null) return inner;
    }
  }

  return null;
};

const checkGit = (args, state, depth, envDirs = []) => {
  const aliases = new Map(state.aliases);
  const localDirs = [...envDirs];
  const workTrees = [];
  let index = 0;

  while (index < args.length && (args[index] ?? "").startsWith("-")) {
    const option = args[index] ?? "";
    const setting = option === "-c" ? (args[index + 1] ?? "") : option.startsWith("-c") && option.length > 2 ? option.slice(2) : "";

    if (option === "-c" || (option.startsWith("-c") && option.length > 2 && !option.startsWith("--"))) {
      if (setsHooksPath(setting)) return V.hooksPath;
      if (setsInclude(setting)) return V.configInclude;
      const eq = setting.indexOf("=");
      if (setting.toLowerCase().startsWith("alias.") && eq !== -1) {
        aliases.set(setting.slice("alias.".length, eq).toLowerCase(), setting.slice(eq + 1));
      }
      const pushSpec = eq === -1 ? null : pushRefspecSetting(setting.slice(0, eq), setting.slice(eq + 1));
      if (pushSpec !== null && refspecViolation(pushSpec, null) !== null) return refspecViolation(pushSpec, null);
      index += option === "-c" ? 2 : 1;
    } else if (option === "--config-env" || option.startsWith("--config-env=")) {
      const value = option === "--config-env" ? (args[index + 1] ?? "") : option.slice("--config-env=".length);
      if (setsHooksPath(value)) return V.hooksPath;
      if (setsInclude(value)) return V.configInclude;
      // The alias body sits in an environment variable the guard cannot read.
      if (value.toLowerCase().startsWith("alias.")) return V.alias;
      index += option === "--config-env" ? 2 : 1;
    } else {
      const gitDir = /^--git-dir=/u.test(option) ? option.slice("--git-dir=".length) : null;
      if (option === "-C") localDirs.push(args[index + 1] ?? "");
      if (option === "--git-dir") localDirs.push(args[index + 1] ?? "");
      if (gitDir !== null) localDirs.push(gitDir);
      if (option === "--work-tree") workTrees.push(args[index + 1] ?? "");
      if (option.startsWith("--work-tree=")) workTrees.push(option.slice("--work-tree=".length));
      index += GIT_GLOBALS_WITH_VALUE.has(option) ? 2 : 1;
    }
  }

  const [subcommand = "", ...rest] = args.slice(index);

  return checkSubcommand(subcommand, rest, state, { aliases, localDirs, workTrees }, depth);
};

// ---- Protected paths: .git/hooks and the guard files.
// The policy looks at what a command does to a path, not at whether the path appears in it.
// A path is a write target when: a redirect points at it; the program is one that writes every
// operand (rm, mv, chmod, tee ...); it is the destination of cp, install, ln or rsync; it is the
// of= value of dd; the program edits in place (sed -i, perl -i, awk -i inplace); it sits in a code
// string of an interpreter; find deletes or runs a writer with it as a start path; or tar extracts
// into it or writes the archive there. A program that cannot be classified (not in any list) is
// blocked when it names .git/hooks, and allowed when it names a guard file.

// Brace words such as `.{stack,x}/check` and `.{s..s}tack` expand to several paths.
// Returns null when there are too many variants to list.
const braceItems = (body) => {
  if (body.includes(",")) return body.split(",");
  const range = /^(-?\d+|[A-Za-z])\.\.(-?\d+|[A-Za-z])$/u.exec(body);
  if (range === null) return null;
  const [from, to] = [range[1] ?? "", range[2] ?? ""];
  const numeric = /\d/u.test(from) && /\d/u.test(to);
  if (numeric !== (/\d/u.test(from) || /\d/u.test(to))) return null;
  const [low, high] = numeric ? [Number(from), Number(to)] : [from.charCodeAt(0), to.charCodeAt(0)];
  const step = low <= high ? 1 : -1;
  if (Math.abs(high - low) >= MAX_BRACE_VARIANTS) return Array.from({ length: MAX_BRACE_VARIANTS + 1 }, () => "");
  const items = [];
  for (let value = low; value !== high + step; value += step) items.push(numeric ? String(value) : String.fromCharCode(value));
  return items;
};

const expandBraces = (word) => {
  if (word.length > MAX_BRACE_WORD || !word.includes("{")) return [word];
  let list = [word];
  for (let round = 0; round < 64; round += 1) {
    let changed = false;
    const next = [];
    for (const item of list) {
      let expanded = null;
      for (const match of item.matchAll(/\{([^{}]*)\}/gu)) {
        const items = braceItems(match[1] ?? "");
        if (items === null) continue;
        const head = item.slice(0, match.index);
        const tail = item.slice(match.index + match[0].length);
        expanded = items.map((part) => head + part + tail);
        break;
      }
      if (expanded === null) next.push(item);
      else next.push(...expanded);
      changed ||= expanded !== null;
      if (next.length > MAX_BRACE_VARIANTS) return null;
    }
    list = next;
    if (!changed) break;
  }
  return list;
};

// A word with too many variants is read for the names of guard paths only.
const GUARD_FRAGMENT = /stack|githooks|\.git|claude/u;

// A case-insensitive disk (macOS, Windows) opens `.STACK` as `.stack`, so the match ignores case.
const hooksNamed = (text) =>
  (expandBraces(text.toLowerCase()) ?? []).some((word) => normalizePath(word).includes(".git/hooks") || globHits(word, HOOKS_SAMPLES));
const guardNamed = (text) => {
  const words = expandBraces(text.toLowerCase());
  if (words === null) return GUARD_FRAGMENT.test(text.toLowerCase());
  return words.some((word) => GUARD_PATH.test(normalizePath(word)) || globHits(word, GUARD_SAMPLES));
};

/** The rule a word breaks when it names a protected path, or null. */
const verdictOf = (text) => (hooksNamed(text) ? V.hooksDir : guardNamed(text) ? V.protectedPath : null);

const firstVerdict = (texts) => {
  for (const text of texts) {
    const found = verdictOf(text);
    if (found !== null) return found;
  }
  return null;
};

const URL_WORD = /^[a-z][a-z0-9+.-]*:\/\//iu;

// Words that carry code, not a path: a quote, a space, a bracket, a comma or a semicolon.
const CODE_WORD = /[\s'"(),;]/u;
const codeVerdict = (texts) => firstVerdict(texts.filter((text) => CODE_WORD.test(text)));

/** The program name without a version suffix: python3.12 is python, perl5.34 is perl. */
const family = (program) => (/^[A-Za-z]+[\d.]+$/u.test(program) ? program.replace(/[\d.]+$/u, "") : program);

const isInPlace = (program, args) => {
  if (program === "sed" || program === "gsed") return args.some((arg) => /^-[A-Za-z]*i|^--in-place/u.test(arg));
  // perl -i, -pi, -0777pi, -i.bak, -pie. Other letters, such as -MList::Util, are not flags that stand before i.
  if (program === "perl" || program === "ruby") return args.some((arg) => /^-[0-9adflnpsStTuUvwWxX]*i/u.test(arg));
  // awk -i inplace, gawk --include inplace
  return args.some((arg) => arg === "inplace" || arg === "-iinplace");
};

// rsync options whose value is a pattern or a program, never a destination.
const RSYNC_PATTERN_OPTS = new Set(["-e", "-f", "--rsh", "--exclude", "--include", "--filter", "--exclude-from", "--include-from"]);

/** The files a program writes when its output option names them (curl -o, wget -O, unzip -d, sort -o). */
const outputTargets = (program, args) => {
  const options = OUTPUT_OPTIONS.get(program);
  if (options === undefined) return [];
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (options.short.has(arg) || options.long.has(arg)) {
      found.push(args[index + 1] ?? "");
      index += 1;
    } else if (arg.startsWith("--") && arg.includes("=") && options.long.has(arg.slice(0, arg.indexOf("=")))) {
      found.push(arg.slice(arg.indexOf("=") + 1));
    } else if (/^-[A-Za-z]/u.test(arg)) {
      // Bundled flags: -sSo file, -qO file, -oFILE. The first flag that takes a value ends the bundle.
      for (let at = 1; at < arg.length; at += 1) {
        if (!options.short.has(`-${arg.charAt(at)}`)) continue;
        const attached = arg.slice(at + 1);
        found.push(attached !== "" ? attached : (args[index + 1] ?? ""));
        if (attached === "") index += 1;
        break;
      }
    }
  }
  return found;
};

/** A whole folder that holds guard files: `.git` or `.claude`, with an optional ./ or ../ or $PWD/ in front. */
const guardFolder = (word) => {
  const clean = path.posix.normalize(word.replace(/^\$\{?PWD\}?\//u, "")).replace(/\/+$/u, "");
  return /^(?:\.\.\/)*\.(?:git|claude)$/iu.test(clean);
};

/** The operands of cp, install, ditto or rsync that get written. */
const copyTargets = (program, args) => {
  if (program === "rsync" && args.some((arg) => /^--remove-(?:source|sent)-files$/u.test(arg))) return args;
  if (program === "install" && args.some((arg) => /^-[A-Za-z]*d|^--directory$/u.test(arg))) return args;

  const dirs = [];
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (program === "rsync" && RSYNC_PATTERN_OPTS.has(arg)) {
      index += 1;
    } else if (program !== "rsync" && (arg === "--target-directory" || /^-[A-Za-z]*t$/u.test(arg))) {
      dirs.push(args[index + 1] ?? "");
      index += 1;
    } else if (arg.startsWith("--target-directory=")) {
      dirs.push(arg);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return dirs.length > 0 ? dirs : positional.slice(-1);
};

const FIND_FILE_ACTIONS = new Set(["-fprint", "-fprint0", "-fprintf", "-fls"]);
const FIND_EXEC = /^-(?:exec|execdir|ok|okdir)$/u;
const FIND_TESTS = new Set(["-path", "-ipath", "-wholename", "-iwholename", "-name", "-iname", "-regex", "-iregex"]);

/**
 * find only writes when it deletes, prints into a file, or runs a program that is not a reader.
 * Then a start path or an expression word that names a protected path is a target, unless the word
 * only excludes it (`! -path P`, `-not -path P`, or `-path P -prune -o` when nothing is deleted).
 */
const findVerdict = (args) => {
  let index = 0;
  while (index < args.length && /^-(?:[HLP]|O\d?)$/u.test(args[index] ?? "")) index += 1;

  const starts = [];
  while (index < args.length && !/^(?:-|\(|!|,)/u.test(args[index] ?? "")) {
    starts.push(args[index] ?? "");
    index += 1;
  }
  const expr = args.slice(index);

  for (let at = 0; at < expr.length; at += 1) {
    if (FIND_FILE_ACTIONS.has(expr[at] ?? "")) {
      const found = verdictOf(expr[at + 1] ?? "");
      if (found !== null) return found;
    }
  }

  const deletes = expr.includes("-delete") || expr.some((arg) => FIND_FILE_ACTIONS.has(arg));
  let runsWriter = false;
  for (let at = 0; at < expr.length; at += 1) {
    if (!FIND_EXEC.test(expr[at] ?? "")) continue;
    const inner = expr.slice(at + 1);
    const end = inner.findIndex((arg) => arg === ";" || arg === "+");
    const program = programName(inner[0] ?? "");
    if (!READERS.has(program)) runsWriter = true;
    if (end === -1) runsWriter = true;
  }
  if (!deletes && !runsWriter) return null;

  const found = firstVerdict(starts);
  if (found !== null) return found;

  // -delete implies -depth, which makes -prune do nothing.
  const pruneWorks = !expr.includes("-delete") && !expr.includes("-depth") && !expr.includes("-d");
  for (let at = 0; at < expr.length; at += 1) {
    const hit = verdictOf(expr[at] ?? "");
    if (hit === null) continue;
    const negated = ["!", "-not"].includes(expr[at - 2] ?? "") && FIND_TESTS.has(expr[at - 1] ?? "");
    const pruned = pruneWorks && expr[at + 1] === "-prune" && ["-o", "-or"].includes(expr[at + 2] ?? "");
    if (!negated && !pruned) return hit;
  }
  return null;
};

const TAR_MODES = { extract: "x", get: "x", create: "c", append: "r", update: "u", delete: "w", catenate: "w", concatenate: "w", list: "t", diff: "t", compare: "t" };
const TAR_SHORT_VALUE = new Set(["T", "X", "b", "L", "N", "I", "K"]);
const TAR_LONG_VALUE = new Set(["--exclude", "--exclude-from", "--files-from", "--transform", "--xform", "--strip-components", "--to-command", "--newer", "--newer-mtime", "--owner", "--group", "--use-compress-program", "--blocking-factor", "--label", "--index-file", "--listed-incremental"]);

/** tar writes into the -C directory and the members when it extracts, and into the archive when it creates or edits. */
const tarVerdict = (args) => {
  let modes = "";
  const archives = [];
  const others = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (arg === "--") {
      others.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg : arg.slice(0, eq);
      const value = eq === -1 ? undefined : arg.slice(eq + 1);
      const mode = TAR_MODES[name.slice(2)];
      if (mode !== undefined) modes += mode;
      if (name === "--file") {
        archives.push(value ?? args[index + 1] ?? "");
        if (value === undefined) index += 1;
      } else if (name === "--directory") {
        others.push(value ?? args[index + 1] ?? "");
        if (value === undefined) index += 1;
      } else if (TAR_LONG_VALUE.has(name) && value === undefined) {
        index += 1;
      }
      continue;
    }

    const bundle = arg.startsWith("-") && arg.length > 1 ? arg.slice(1) : index === 0 && /^[A-Za-z]+$/u.test(arg) ? arg : null;
    if (bundle === null) {
      others.push(arg);
      continue;
    }
    for (let at = 0; at < bundle.length; at += 1) {
      const letter = bundle.charAt(at);
      if ("xcrutdA".includes(letter)) modes += letter === "A" ? "w" : letter === "d" ? "t" : letter;
      if (letter === "f" || letter === "C" || TAR_SHORT_VALUE.has(letter)) {
        const attached = bundle.slice(at + 1);
        const value = attached !== "" ? attached : (args[index + 1] ?? "");
        if (attached === "") index += 1;
        if (letter === "f") archives.push(value);
        if (letter === "C") others.push(value);
        break;
      }
    }
  }

  if (modes === "") return firstVerdict([...archives, ...others]);
  // c, r, u and w (--delete, -A) change the archive. x changes the -C directory and the members.
  const archiveHit = /[cruw]/u.test(modes) ? firstVerdict(archives) : null;
  return archiveHit ?? (modes.includes("x") ? firstVerdict(others) : null);
};

/** Which protected path a segment writes, and the rule it breaks. Null when it only reads or mentions. */
const protectedVerdict = (segment, words, assignments) => {
  for (let index = 1; index < segment.length; index += 1) {
    const previous = segment[index - 1];
    const token = segment[index];
    if (previous?.operator && REDIRECTS.has(previous.text) && token !== undefined && !token.operator) {
      const found = verdictOf(token.text);
      if (found !== null) return found;
    }
  }

  const program = programName(words[0]?.text ?? "");
  const args = words.slice(1).map((token) => token.text);
  const operands = [...assignments.map((token) => token.text), ...args];

  if (READERS.has(program) || program === "eval") return null;
  if (FOLDER_DESTROYERS.has(program)) {
    // mv takes the folder as a source. A folder as the last operand only receives files.
    const moved = program === "mv" ? args.filter((arg) => !arg.startsWith("-")).slice(0, -1) : args.filter((arg) => !arg.startsWith("-"));
    if (moved.some(guardFolder)) return V.protectedPath;
  }
  if (/^(?:chmod|chown|chgrp|chflags)$/u.test(program) && args.some((arg) => /^-[A-Za-z]*[RrH]/u.test(arg) || arg === "--recursive")) {
    if (args.some((arg) => !arg.startsWith("-") && guardFolder(arg))) return V.protectedPath;
  }
  if (WRITE_ALL.has(program)) return firstVerdict(operands);
  if (COPY_LIKE.has(program)) return firstVerdict([...assignments.map((token) => token.text), ...copyTargets(program, args)]);
  if (program === "dd") return firstVerdict([...assignments.map((token) => token.text), ...args.filter((arg) => arg.startsWith("of="))]);
  if (program === "find") return firstVerdict(assignments.map((token) => token.text)) ?? findVerdict(args);
  if (TAR.has(program)) return firstVerdict(assignments.map((token) => token.text)) ?? tarVerdict(args);

  const kind = family(program);

  if (IN_PLACE.has(kind)) {
    return (isInPlace(kind, args) ? firstVerdict(operands) : null) ?? codeVerdict(operands);
  }

  const code = INLINE_CODE.has(kind) ? codeVerdict(operands) : null;
  if (code !== null) return code;

  const written = firstVerdict(outputTargets(program, args));
  if (written !== null) return written;

  // Not classified. A shell script string is read by scan, so only the other words count.
  const script = SHELLS.has(program) ? shellScript(args) : null;
  const rest = [words[0]?.text ?? "", ...operands].filter((text) => text !== "" && text !== script);
  return rest.some(hooksNamed) ? V.hooksDir : null;
};

/**
 * Where a shell call takes its script: the string after -c, or null when it runs a file or reads stdin.
 * @param {string[]} args
 */
const shellScript = (args) => {
  let inline = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") return inline ? (args[index + 1] ?? "") : null;
    if (/^[-+][oO]$|^--(?:rcfile|init-file)$/u.test(arg)) {
      index += 1;
    } else if (/^[-+][A-Za-z]+$/u.test(arg)) {
      if (/^-[A-Za-z]*c/u.test(arg)) inline = true;
    } else if (!arg.startsWith("--")) {
      return inline ? arg : null;
    }
  }
  return null;
};

/** A shell that reads its script from stdin: no -c string and no script file. */
const readsStdin = (name, args) =>
  SHELLS.has(name) && shellScript(args) === null && !args.some((arg) => !/^[-+]/u.test(arg));

/**
 * After `cd .stack`, the word `check` names `.stack/check`. Read the segment again with its words joined to the cd folders.
 * Words that are options, absolute, variables or assignments stay as they are.
 */
const joinedVerdict = (segment, state) => {
  if (state.dirs.length === 0) return null;

  // The joined folder is kept between segments, so a long list of cd words is not joined again for each segment.
  if (state.baseAt !== state.dirs.length) {
    for (const folder of state.dirs.slice(state.baseAt)) {
      if (folder === "" || folder === "-" || /[$`]/u.test(folder)) continue;
      state.base = /^[/~]/u.test(folder) ? folder : path.posix.join(state.base, folder);
    }
    state.baseAt = state.dirs.length;
  }
  const base = state.base;

  const join = (text) => {
    const isOf = text.startsWith("of=");
    const target = isOf ? text.slice(3) : text;
    if (target === "" || /^[-/~$=]/u.test(target) || /\s/u.test(target)) return text;
    if (!isOf && ASSIGNMENT.test(text)) return text;
    return (isOf ? "of=" : "") + path.posix.join(base, target);
  };
  const moved = segment.map((token) => (token.operator ? token : { ...token, text: join(token.text) }));
  const { assignments, words } = splitPrefix(moved.filter((token) => !token.operator));

  return protectedVerdict(moved, words, assignments);
};

const checkSegment = (segment, state, depth) => {
  const plain = segment.filter((token) => !token.operator);
  const { assignments, words, split } = splitPrefix(plain);

  if (assignments.some(disablesHooks)) return V.hookEnv;
  if (split !== null) return scan([split, ...words.map((token) => token.text)].join(" "), state, depth + 1);

  const written = protectedVerdict(segment, words, assignments) ?? joinedVerdict(segment, state);
  if (written !== null) return written;

  const [program, ...args] = words.map((token) => token.text);
  const name = programName(program ?? "");

  if (INLINE_CODE.has(family(name))) {
    for (const arg of args.filter((text) => CODE_WORD.test(text))) {
      const found = gitInCode(arg, state, depth);
      if (found !== null) return found;
    }
  }

  if (name === "git") {
    // GIT_WORK_TREE=<guard folder> makes checkout, restore and reset write into that folder.
    if (assignments.some((token) => /^GIT_WORK_TREE=/u.test(token.text) && verdictOf(token.text.slice("GIT_WORK_TREE=".length)) !== null)) {
      return V.gitGuardPath;
    }
    const gitDirs = assignments.filter((token) => /^GIT_DIR=/u.test(token.text)).map((token) => token.text.slice("GIT_DIR=".length));
    return checkGit(args, state, depth, gitDirs);
  }

  // The dashed form of a git command, such as "$(git --exec-path)/git-commit".
  const dashed = /^git-([a-z][a-z-]*)$/u.exec(name);
  if (dashed !== null) return checkGit([dashed[1] ?? "", ...args], state, depth);

  if (name === "find") {
    for (let index = 0; index < words.length; index += 1) {
      if (!/^-(?:exec|execdir|ok|okdir)$/u.test(words[index]?.text ?? "")) continue;
      const end = words.findIndex((token, at) => at > index && (token.text === ";" || token.text === "+"));
      const found = checkSegment(words.slice(index + 1, end === -1 ? words.length : end), state, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  if (name === "cd" || name === "pushd") {
    // No honest command changes folder this often. The cap keeps the work small.
    if (state.dirs.length >= 256) return V.unparseable;
    state.dirs.push(args.find((arg) => !arg.startsWith("-")) ?? "");
    return null;
  }

  if (name === "export") return words.slice(1).some(disablesHooks) ? V.hookEnv : null;

  if (name === "eval") return scan(args.join(" "), state, depth + 1);

  if (name === "lefthook" || args.includes("lefthook")) {
    const lefthook = name === "lefthook" ? -1 : args.indexOf("lefthook");
    return args.slice(lefthook + 1).includes("uninstall") ? V.lefthook : null;
  }

  if (SHELLS.has(name)) {
    // A here-string feeds its text to the shell as the script: bash <<< 'cmd'.
    const here = args.findIndex((arg) => arg.startsWith("<<<"));
    if (here !== -1) {
      const body = args[here] === "<<<" ? (args[here + 1] ?? "") : (args[here] ?? "").slice(3);
      const found = scan(body, state, depth + 1);
      if (found !== null) return found;
    }
    const script = shellScript(args);
    return script === null ? null : scan(script, state, depth + 1);
  }

  if (!READERS.has(name)) {
    // `watch 'git push'` and `ssh host 'git push'` run a string.
    if (/\s/u.test(program ?? "") || STRING_RUNNERS.has(name)) {
      // A word that is itself a substitution was read already, and reading it again would loop.
      for (const text of [program ?? "", ...args].filter((word) => /\s/u.test(word) && !/^[$`]/u.test(word))) {
        const found = scan(text, state, depth + 1);
        if (found !== null) return found;
      }
    }
    // Any other program that is given git as a word: `arch -arm64 git commit -n`, `flock f git commit -n`.
    const at = args.findIndex((arg) => basename(arg) === "git");
    if (at !== -1) return checkGit(args.slice(at + 1), state, depth);
  }

  return null;
};

/** In `echo 'cmd' | sh`, the text that echo or printf prints becomes the script. */
const pipedScripts = (segments) => {
  const shellReads = segments.some((segment) => {
    const { words } = splitPrefix(segment.filter((token) => !token.operator));
    const [program, ...args] = words.map((token) => token.text);
    return readsStdin(programName(program ?? ""), args);
  });
  if (!shellReads) return [];

  return segments.flatMap((segment) => {
    const { words } = splitPrefix(segment.filter((token) => !token.operator));
    const [program, ...args] = words.map((token) => token.text);
    return ["echo", "printf"].includes(programName(program ?? "")) ? [args.join(" ")] : [];
  });
};

/**
 * @param {string} command
 * @param {{ ctx: object, dirs: string[], branch: string | null }} state
 * @param {number} depth
 */
const scan = (command, state, depth) => {
  if (depth > MAX_DEPTH) return V.unparseable;
  if (typeof command !== "string" || command.trim() === "") return depth === 0 ? V.noCommand : null;
  if (command.length > MAX_COMMAND_LENGTH) return V.tooLong;
  // A shell reads a command string up to the first null byte. The guard and the shell could then see different commands.
  if (command.includes("\0")) return V.unparseable;

  const stripped = stripHeredocs(command);
  // `$(which git)` and `$(command -v git)` stand for git itself.
  const text = stripped.text.replace(GIT_LOOKUP, "git");

  for (const body of stripped.shellBodies) {
    const found = scan(body, state, depth + 1);
    if (found !== null) return found;
  }

  // A heredoc that feeds an interpreter is code: `python3 - <<'PY' ... PY`.
  for (const body of stripped.codeBodies) {
    const found = firstVerdict([body]) ?? gitInCode(body, state, depth);
    if (found !== null) return found;
  }

  for (const inner of substitutionBodies(text)) {
    const found = scan(inner, state, depth + 1);
    if (found !== null) return found;
  }

  const { segments, unterminated } = segmentsOf(text);
  if (unterminated) return V.unparseable;

  for (const script of pipedScripts(segments)) {
    const found = scan(script, state, depth + 1);
    if (found !== null) return found;
  }

  for (const segment of segments) {
    const found = checkSegment(segment, state, depth);
    if (found !== null) return found;
  }

  return null;
};

/**
 * Decide whether a Bash command may run.
 * ctx.branchOf(dirs) is optional. It gets the directory words seen so far (from `cd` and `git -C`),
 * in order, and returns the branch name there or null. The hook resolves them against its cwd.
 * Without it the branch rules cannot see the branch, and a commit or bare push is allowed.
 * @param {unknown} command
 * @param {{ branchOf?: (dirs: string[]) => string | null }} [ctx]
 * @returns {{ allow: boolean, rule: string | null, reason: string | null, fix: string | null }}
 */
export const evaluateCommand = (command, ctx = {}) => {
  const violation = scan(typeof command === "string" ? command : "", { ctx, dirs: [], branch: null, aliases: new Map(), mainTrees: [], base: ".", baseAt: 0 }, 0);

  return violation === null
    ? { allow: true, rule: null, reason: null, fix: null }
    : { allow: false, rule: violation.rule, reason: violation.reason, fix: violation.fix };
};

/**
 * Resolve the directory words from `cd` and `git -C` against the hook's cwd.
 * A leading `~` or `$HOME` becomes `home` when the caller gives it.
 * @param {string} base
 * @param {string[]} dirs
 * @param {string} [home]
 */
export const resolveDirs = (base, dirs, home) =>
  dirs.reduce((dir, next) => {
    const expanded = home === undefined ? next : next.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u, home);
    return path.resolve(dir, expanded);
  }, base);
