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
//   - Data that arrives on a pipe: `echo -- -n | xargs git commit`, `cat x.sh | sh`, `curl ... | sh`.
//     Only `echo` or `printf` text piped into a bare shell is read.
//   - Config files it cannot read: ~/.gitconfig, include.path, GIT_CONFIG_GLOBAL, push.default and
//     remote.<name>.push set in an earlier command, or a branch whose upstream is main.
//   - Relative moves it cannot follow: `cd .git && rm -rf hooks`, `cd -`, `..` inside a path.
//   - Merges and pulls on main are allowed (they sync with upstream). The push rule stops them leaving.
//   - People and scripts outside Claude Code. Branch protection on the host is the real fence.

import path from "node:path";

const PROTECTED_BRANCH = /^(?:main|master)$/u;
const MAX_DEPTH = 8;

const V = {
  noCommand: {
    rule: "no-command",
    reason: "The hook input has no shell command to check, so it cannot be judged.",
    fix: "Send a Bash tool call with a non-empty tool_input.command.",
  },
  unparseable: {
    rule: "unparseable-command",
    reason: "The command has an unclosed quote or is nested too deeply, so the guard cannot read it.",
    fix: "Close the quote or split the command into simpler steps.",
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
    reason: "This command commits (commit, cherry-pick, revert, am, update-ref) while the current branch is main or master.",
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
const REDIRECTS = new Set([">", ">>", ">|"]);
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
  ["xargs", new Set(["-I", "-n", "-P", "-L", "-s", "-d", "-E"])],
  ["timeout", new Set(["-s", "-k", "--signal", "--kill-after"])],
  ["watch", new Set(["-n", "--interval"])],
  ["ionice", new Set(["-c", "-n", "-p"])],
  ["caffeinate", new Set(["-t", "-w"])],
]);

// Programs that only read the paths they name. A redirect to .git/hooks is still caught.
// git, echo and printf are here so a commit message or a note that mentions .git/hooks is not blocked.
const HOOK_READERS = new Set([
  "[", "bat", "cat", "diff", "echo", "file", "git", "grep", "head", "less", "ls", "more", "printf", "rg", "stat",
  "tail", "test", "tree", "wc",
]);

const GUARD_MUTATORS = new Set([
  "chflags", "chmod", "chown", "cp", "dd", "ed", "ex", "install", "ln", "mv", "patch", "perl", "rm", "rmdir",
  "rsync", "shred", "sponge", "tee", "touch", "truncate", "unlink",
]);
const COPY_LIKE = new Set(["cp", "install", "ln", "rsync"]);
// Programs that take inline code. A guard path inside a code string means the code may write it.
const INLINE_CODE = new Set(["awk", "bun", "deno", "gawk", "node", "osascript", "php", "python", "python3", "ruby", "sed"]);
const GUARD_PATH =
  /(?:^|[^\w.-])(?:\.githooks(?![\w-])|\.stack(?![\w-])|\.git\/config(?![\w-])|\.claude\/(?:settings(?:\.local)?\.json|hooks(?![\w-])))/u;
// Sample protected paths. A glob word that matches one of them may expand to it.
const GUARD_SAMPLES = [
  ".githooks", ".githooks/prepare-commit-msg", ".stack", ".stack/check", ".git/config",
  ".claude/settings.json", ".claude/settings.local.json", ".claude/hooks", ".claude/hooks/guard-git.mjs",
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

/**
 * Split a command into segments of tokens. Returns whether a quote was left open.
 * @param {string} command
 * @returns {{ segments: Token[][], unterminated: boolean }}
 */
const segmentsOf = (command) => {
  /** @type {Token[][]} */
  const segments = [[]];
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
      const operator = next === ">" || next === "|" ? `>${next}` : ">";
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
 * @returns {{ text: string, shellBodies: string[] }}
 */
const stripHeredocs = (command) => {
  const shellBodies = [];
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

  return { text: out, shellBodies };
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
    } else if (char === "`") {
      const end = text.indexOf("`", index + 1);
      found.push(text.slice(index + 1, end === -1 ? text.length : end));
      if (end !== -1) index = end;
    }
  }

  return found;
};

const basename = (word) => word.slice(word.lastIndexOf("/") + 1);

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
    if (wrapper === "timeout" && /^\d/u.test(tokens[index]?.text ?? "")) index += 1;
  }

  return { assignments, words: tokens.slice(index), split };
};

const isNoVerify = (arg) => arg.length >= NO_VERIFY_SHORTEST_PREFIX && NO_VERIFY.startsWith(arg);

const setsHooksPath = (setting) => setting.split("=")[0]?.trim().toLowerCase() === "core.hookspath";

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

        if (COMMIT_SHORT_WITH_VALUE.has(char)) {
          if (flag === arg.length - 1) index += 1;
          break;
        }
      }
    }
  }

  return false;
};

const configSetsHooksPath = (args) => {
  const section = args.findIndex((arg) => CONFIG_SECTION_EDITS.has(arg));
  if (section !== -1 && (args[section + 1] ?? "").toLowerCase() === "core") return true;

  const key = args.findIndex(setsHooksPath);

  if (key === -1) return false;
  if (args.some((arg) => CONFIG_UNSETS.has(arg))) return true;
  if (args.some((arg) => CONFIG_READS.has(arg))) return false;

  return (args[key] ?? "").includes("=") || key < args.length - 1;
};

/** The value a config setting gives remote.<name>.push, from `key=value` or `key value`. */
const pushRefspecSetting = (key, value) => (/^remote\..+\.push$/iu.test(key) ? value : null);

const isProtectedBranch = (name) => PROTECTED_BRANCH.test(name ?? "");

/** Branch a push or commit lands on: an override from a checkout earlier in the command, else the lookup. */
const currentBranch = (state, localDirs) => {
  if (localDirs.length === 0 && state.branch !== null) return state.branch;
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
      // `git checkout <word>` may restore a file and stay on the branch, so it only counts toward main.
      if (subcommand === "switch" || isProtectedBranch(arg)) state.branch = arg;
      return;
    }
  }
};

const aliasTokens = (value) => (segmentsOf(value).segments[0] ?? []).map((token) => token.text);

/**
 * @param {string} subcommand
 * @param {string[]} rest
 * @param {object} state
 * @param {{ aliases: Map<string,string>, localDirs: string[] }} frame
 * @param {number} depth
 */
const checkSubcommand = (subcommand, rest, state, frame, depth) => {
  // git alias names are case-insensitive config keys.
  const alias = frame.aliases.get(subcommand.toLowerCase());

  if (alias !== undefined && depth < MAX_DEPTH) {
    const inner = alias.startsWith("!")
      ? scan(alias.slice(1), state, depth + 1)
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

  if (rest.some(isNoVerify)) return V.noVerify;

  if (subcommand === "commit-tree") return V.commitTree;

  if (subcommand === "update-ref" && rest.some((arg) => /^refs\/heads\/(?:main|master)$/u.test(arg))) {
    return V.commitOnMain;
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

    const pushKey = rest.findIndex((arg) => pushRefspecSetting(arg, "") !== null);
    const pushValue = pushKey === -1 ? undefined : rest[pushKey + 1];
    if (pushValue !== undefined) {
      const found = refspecViolation(pushValue, null);
      if (found !== null) return found;
    }

    const key = rest.findIndex((arg) => arg.toLowerCase().startsWith("alias."));
    const value = key === -1 ? undefined : rest[key + 1];
    if (value !== undefined && depth < MAX_DEPTH) {
      const probe = new Map([["__probe__", value]]);
      const inner = checkSubcommand("__probe__", [], state, { aliases: probe, localDirs: frame.localDirs }, depth + 1);
      if (inner !== null) return inner;
    }
  }

  return null;
};

const checkGit = (args, state, depth) => {
  const aliases = new Map();
  const localDirs = [];
  let index = 0;

  while (index < args.length && (args[index] ?? "").startsWith("-")) {
    const option = args[index] ?? "";
    const setting = option === "-c" ? (args[index + 1] ?? "") : option.startsWith("-c") && option.length > 2 ? option.slice(2) : "";

    if (option === "-c" || (option.startsWith("-c") && option.length > 2 && !option.startsWith("--"))) {
      if (setsHooksPath(setting)) return V.hooksPath;
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
      // The alias body sits in an environment variable the guard cannot read.
      if (value.toLowerCase().startsWith("alias.")) return V.alias;
      index += option === "--config-env" ? 2 : 1;
    } else {
      const gitDir = /^--git-dir=/u.test(option) ? option.slice("--git-dir=".length) : null;
      if (option === "-C") localDirs.push(args[index + 1] ?? "");
      if (option === "--git-dir") localDirs.push(args[index + 1] ?? "");
      if (gitDir !== null) localDirs.push(gitDir);
      index += GIT_GLOBALS_WITH_VALUE.has(option) ? 2 : 1;
    }
  }

  const [subcommand = "", ...rest] = args.slice(index);

  return checkSubcommand(subcommand, rest, state, { aliases, localDirs }, depth);
};

const touchesHooksDirectory = (segment, words) => {
  const program = basename(words[0]?.text ?? "");

  return segment.some((token, index) => {
    if (token.operator) return false;
    if (!normalizePath(token.text).includes(".git/hooks") && !globHits(token.text, HOOKS_SAMPLES)) return false;

    const previous = segment[index - 1];

    return (
      (previous !== undefined && previous.operator && REDIRECTS.has(previous.text)) ||
      !HOOK_READERS.has(program)
    );
  });
};

const touchesGuardFile = (segment, words) => {
  const program = basename(words[0]?.text ?? "");
  const args = words.slice(1).map((token) => token.text);
  // sed writes files only in place (-i, -i.bak, -Ei, --in-place).
  const sedInPlace = program === "sed" && args.some((arg) => /^-[A-Za-z]*i|^--in-place/u.test(arg));
  // cp, install, ln and rsync write only their destination: the last operand or the -t value.
  const targets = COPY_LIKE.has(program)
    ? new Set([
        words.slice(1).filter((word) => !word.text.startsWith("-")).at(-1),
        ...words.filter((word, at) => ["-t", "--target-directory"].includes(words[at - 1]?.text ?? "")),
        ...words.filter((word) => word.text.startsWith("--target-directory=")),
      ])
    : null;

  return segment.some((token, index) => {
    if (token.operator) return false;
    const named = GUARD_PATH.test(normalizePath(token.text));
    if (!named && !globHits(token.text, GUARD_SAMPLES)) return false;

    const previous = segment[index - 1];
    const insideCode = /[\s'"(),;]/u.test(token.text);

    return (
      (previous !== undefined && previous.operator && REDIRECTS.has(previous.text)) ||
      (GUARD_MUTATORS.has(program) && (targets === null || targets.has(token))) ||
      sedInPlace ||
      (named && INLINE_CODE.has(program) && insideCode)
    );
  });
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

const checkSegment = (segment, state, depth) => {
  const plain = segment.filter((token) => !token.operator);
  const { assignments, words, split } = splitPrefix(plain);

  if (assignments.some(disablesHooks)) return V.hookEnv;
  if (split !== null) return scan([split, ...words.map((token) => token.text)].join(" "), state, depth + 1);
  if (touchesHooksDirectory(segment, words)) return V.hooksDir;
  if (touchesGuardFile(segment, words)) return V.protectedPath;

  const [program, ...args] = words.map((token) => token.text);
  const name = programName(program ?? "");

  if (name === "git") return checkGit(args, state, depth);

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

  const { text, shellBodies } = stripHeredocs(command);

  for (const body of shellBodies) {
    const found = scan(body, state, depth + 1);
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
  const violation = scan(typeof command === "string" ? command : "", { ctx, dirs: [], branch: null }, 0);

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
