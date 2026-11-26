#!/usr/bin/env node
// install: copies this stack into a project repo.
//
// --tool claude (the default), codex or both picks the agent tool. The lines below are for claude.
// For codex: skills/* go to <target>/.agents/skills/, the folder that Codex reads. In each .md and
// .mjs file of that copy, the text .claude/skills/ becomes .agents/skills/. The source keeps one
// written form, .claude/skills/. hooks/* go to <target>/.codex/hooks/, and
// templates/codex-hooks.json goes to <target>/.codex/hooks.json (never merged). Codex runs
// that hook only after the user trusts it, so the next steps say so. The installer never
// writes ~/.codex. Codex gets no CLAUDE.md link and no .claude/ folder. both does the two, and
// the Claude Code deny rules (in .claude/settings.json and printed) also name the .codex/ guard files.
//
//   skills/*                   -> <target>/.claude/skills/
//   hooks/*                    -> <target>/.claude/hooks/
//   templates/AGENTS.md, GLOSSARY.md -> <target>/
//   (built in)                 -> <target>/CLAUDE.md, a relative symlink to AGENTS.md
//   templates/adr/*            -> <target>/docs/adr/
//   templates/claude-settings.json -> <target>/.claude/settings.json (never merged)
//   templates/githooks/*       -> <target>/.githooks/
//   (built in)                 -> <target>/.stack/check, docs/agents/enforcement.md, docs/agents/permissions.md (starter files)
//   (printed, never written)   -> the allow and deny rules for Claude Code, to paste into .claude/settings.local.json
//   (built in)                 -> <target>/.gitignore: rules that keep evidence media out of commits
//
// After the copy, the installer runs `git config core.hooksPath .githooks` in the target.
// It does this only when the target is a git repo and core.hooksPath is not set.
// With core.hooksPath set, git no longer runs the hooks in .git/hooks. So when .git/hooks holds a
// hook that is not a .sample file, the installer names it and does not set core.hooksPath,
// unless the user passes --replace-git-hooks.

// Existing files are never overwritten. They are reported as skipped.
//
// .gitignore: the `prove` skill leaves screenshots and video in `.artifacts/<task>/evidence/`.
// `/land` pushes them to the branch `evidence/<task>`. A ticket commit must not take them by
// accident. So the installer appends one rule for each media type that `evidence-check.mjs`
// accepts, such as `.artifacts/*/evidence/**/*.png`. These rules are narrow on purpose. The
// review file `.artifacts/<task>/review.md`, the evidence index and the text output stay
// visible to git, because `build` and `land` read them and `land` can commit the review file.
// The installer only appends. It never rewrites a line, never writes through a symlink, and
// adds no rule that is already there. A rule that ignores all of `.artifacts/` counts as present.
//
// CLAUDE.md: one file for every agent tool. AGENTS.md is the file, and CLAUDE.md is a relative
// symlink to it (`ln -s AGENTS.md CLAUDE.md`). There is no templates/CLAUDE.md, because a symlink
// in templates/ would need special copy code. The installer makes the link itself:
//   - Nothing at CLAUDE.md: create the link. If the OS refuses symlinks, write a one-line file
//     `@AGENTS.md` instead (Claude Code follows that import) and say so.
//   - CLAUDE.md is already a link to AGENTS.md: skip.
//   - Anything else at CLAUDE.md (a file, another link, a dangling link): never touch it. Print
//     the steps to do by hand.
//   - AGENTS.md in the target is a symlink that leads outside the target, or that dangles: do not
//     make the link, because CLAUDE.md would lead outside too. Print the steps to do by hand.
// The link gets the same care as a copy: lstat, so a dangling link counts as present and is never
// replaced. symlinkSync never follows or replaces an existing path, and the fallback file uses flag wx.
// checkDestinations() does not need the link: its folder is the target root, which is never a symlink
// out of the target (the target itself is resolved with realpath).
//
// Paths checked against the Claude Code docs (skills and hooks pages): project
// skills live in `.claude/skills/<name>/SKILL.md`, and a hook command refers to a
// project script as `${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>`.
//
// Usage: node scripts/install.mjs [--tool claude|codex|both] [--dry-run] [--replace-git-hooks] <target-repo>
// Exit 0 done, 1 refused (not a git repo, or the target is this repo), 2 usage or read error.

import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, existsSync, writeFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The "kept" hook message tells the user to run the install again with --replace-git-hooks, so the usage line names it.
export const USAGE = "Usage: node scripts/install.mjs [--tool claude|codex|both] [--dry-run] [--replace-git-hooks] <target-repo>";

export class InstallRefusal extends Error {}
export class InstallUsageError extends Error {}

export const TOOLS = ["claude", "codex", "both"];
// Codex reads skills from .agents/skills/, not from .claude/skills/ (Codex CLI 0.172.0, skills docs).
export const CLAUDE_SKILLS = ".claude/skills/";
export const CODEX_SKILLS = ".agents/skills/";
const REWRITE_FILES = /\.(?:md|mjs)$/;

/** The text of a skill file for the Codex copy: each .claude/skills/ becomes .agents/skills/. */
export function codexText(text) {
  return text.replaceAll(CLAUDE_SKILLS, CODEX_SKILLS);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === ".DS_Store") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** True when something is at p, including a dangling symlink (existsSync says false for those). */
function present(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuse before writing anything when a copy would land outside the target or cannot be made:
 * a symlinked folder that leads out of the target, or a file where a folder must go.
 */
function checkDestinations(items, tgt) {
  const realTgt = realpathSync(tgt);
  const bad = [];
  for (const it of items) {
    // A "link" item is not checked here: CLAUDE.md sits in the target root, so its folder is the target.
    if (it.kind !== "copy" && it.kind !== "generate") continue;
    let dir = dirname(it.dest);
    while (!present(dir)) dir = dirname(dir);
    const real = realpathSync(dir);
    if (real !== realTgt && !real.startsWith(realTgt + sep)) bad.push(`${relative(tgt, it.dest)} would be written through a symlink to ${real}, outside the target`);
    else if (!statSync(dir).isDirectory()) bad.push(`${relative(tgt, it.dest)} needs a folder, but ${relative(tgt, dir)} is a file`);
  }
  if (bad.length > 0) throw new InstallRefusal(`nothing was written. ${bad.join("; ")}. Fix: remove or move the symlink or file, then run the install again.`);
}

// Starter file for .stack/check. The git hook (templates/githooks/prepare-commit-msg) runs it
// before every commit. Exit 1 refuses the commit. Exit 0 allows it.
// Decision: the placeholder exits 0 and prints a warning. The hook itself allows a commit and
// warns when a repo has no check, so a placeholder that exits 1 would only block every commit
// until the user edits it. Exit 0 with a warning on each commit keeps the same policy and
// keeps the missing check visible.
export const STARTER_CHECK = `#!/bin/sh
# PLACEHOLDER. This file is not a real check yet.
# The git hook runs this file before every commit.
# If this file exits with a non-zero code, the commit is refused.
# This placeholder exits with 0, so it allows every commit.
# Replace the lines below with the check command of your project.
# Example: npm test
# The agent cannot edit this file. You must edit it by hand.

echo "warning: .stack/check is a placeholder. No real check ran for this commit." >&2
echo "Fix: edit .stack/check and put the check command of your project in it." >&2
exit 0
`;

export const STARTER_ENFORCEMENT = `# Enforcement

Every rule in this project and what holds it. \`No fence yet\` means nothing enforces the rule. It is only an instruction.
The retro skill reads this list and adds a row for each rule that it changes.

| Rule | Written in | Held by | Changed |
| --- | --- | --- | --- |
| No commits or direct pushes to main or master | AGENTS.md rule 2 | .claude/hooks/guard-git.mjs (Claude Code), .codex/hooks/guard-git.mjs (Codex, after you trust it) | install |
| No plain force push | AGENTS.md rule 3 | .claude/hooks/guard-git.mjs (Claude Code), .codex/hooks/guard-git.mjs (Codex, after you trust it) | install |
| Never skip checks | AGENTS.md rule 4 | .claude/hooks/guard-git.mjs (Claude Code), .codex/hooks/guard-git.mjs (Codex, after you trust it), .githooks/prepare-commit-msg | install |
| Every commit passes the project check | .githooks/prepare-commit-msg | .githooks/prepare-commit-msg, .stack/check (placeholder, no fence yet) | install |
`;

export const CLAUDE_LINK = "AGENTS.md";
export const CLAUDE_FALLBACK = "@AGENTS.md\n";

function inside(real, realTgt) {
  return real === realTgt || real.startsWith(realTgt + sep);
}

/**
 * Plan <target>/CLAUDE.md as a relative symlink to AGENTS.md. Returns one item, or null with a
 * note when there will be no AGENTS.md to link to. Never plans a write over something that exists.
 */
function claudeLinkItem(target, agentsComing, notes) {
  const dest = join(target, "CLAUDE.md");
  const agents = join(target, "AGENTS.md");
  if (present(dest)) {
    const st = lstatSync(dest);
    if (st.isSymbolicLink() && readlinkSync(dest) === CLAUDE_LINK) return { kind: "skip", dest, why: "already a link to AGENTS.md" };
    const what = st.isSymbolicLink() ? `a link to ${readlinkSync(dest)}` : "a file";
    return {
      kind: "manual",
      dest,
      why: `already exists as ${what}, not changed`,
      hint: [
        `CLAUDE.md already exists as ${what}, so it was not changed.`,
        "To give every agent tool one file, move any rules from CLAUDE.md into AGENTS.md.",
        "Then run this in the target: rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md",
      ],
    };
  }
  if (present(agents) && lstatSync(agents).isSymbolicLink()) {
    let real = null;
    try {
      real = realpathSync(agents);
    } catch {}
    if (real === null || !inside(real, realpathSync(target))) {
      return {
        kind: "manual",
        dest,
        why: "not linked, because AGENTS.md is a symlink that leads outside the target",
        hint: [
          `CLAUDE.md was not linked. AGENTS.md is a symlink to ${readlinkSync(agents)}, which ${real === null ? "does not exist" : "is outside the target"}.`,
          "A link to it would lead outside the target too. Make AGENTS.md a real file, then run this in the target: ln -s AGENTS.md CLAUDE.md",
        ],
      };
    }
  }
  if (!present(agents) && !agentsComing) {
    notes.push("CLAUDE.md was not linked: the target has no AGENTS.md and the source has no templates/AGENTS.md");
    return null;
  }
  return { kind: "link", dest, linkTo: CLAUDE_LINK };
}

/** Build the plan for tool claude, codex or both. Returns { items, notes }. Does not write. */
export function plan(source, target, tool = "claude") {
  const items = [];
  const notes = [];
  const claude = tool !== "codex";
  const codex = tool !== "claude";
  const addTree = (srcDir, destDir, { rewrite = false } = {}) => {
    if (!isDir(srcDir)) {
      notes.push(`nothing to copy: ${relative(source, srcDir)}/ is missing in the source`);
      return;
    }
    for (const f of walk(srcDir)) items.push({ kind: "copy", src: f, dest: join(destDir, relative(srcDir, f)), rewrite: rewrite && REWRITE_FILES.test(f) });
  };
  const addFile = (rel, destRel) => {
    const src = join(source, rel);
    if (!existsSync(src)) {
      notes.push(`nothing to copy: ${rel} is missing in the source`);
      return;
    }
    items.push({ kind: "copy", src, dest: join(target, destRel) });
  };

  if (claude) {
    addTree(join(source, "skills"), join(target, ".claude", "skills"));
    addTree(join(source, "hooks"), join(target, ".claude", "hooks"));
  }
  if (codex) {
    addTree(join(source, "skills"), join(target, ".agents", "skills"), { rewrite: true });
    addTree(join(source, "hooks"), join(target, ".codex", "hooks"));
  }
  for (const f of ["AGENTS.md", "GLOSSARY.md"]) addFile(join("templates", f), f);
  const link = claude ? claudeLinkItem(target, existsSync(join(source, "templates", "AGENTS.md")), notes) : null;
  if (link) items.push(link);
  addTree(join(source, "templates", "adr"), join(target, "docs", "adr"));
  addTree(join(source, "templates", "githooks"), join(target, ".githooks"));

  items.push({ kind: "generate", content: STARTER_CHECK, mode: 0o755, dest: join(target, ".stack", "check") });
  items.push({ kind: "generate", content: STARTER_ENFORCEMENT, mode: 0o644, dest: join(target, "docs", "agents", "enforcement.md") });
  items.push({ kind: "generate", content: STARTER_PERMISSIONS, mode: 0o644, dest: join(target, "docs", "agents", "permissions.md") });

  const settingsSrc = join(source, "templates", "claude-settings.json");
  if (claude && existsSync(settingsSrc)) items.push({ kind: "settings", src: settingsSrc, dest: join(target, ".claude", "settings.json"), merge: '"hooks" and "permissions"', content: codex ? claudeSettingsText(readFileSync(settingsSrc, "utf8")) : undefined });
  else if (claude) notes.push("nothing to copy: templates/claude-settings.json is missing in the source");
  // Codex: the git guard hook. Codex runs it only after the user trusts it in /hooks.
  const codexHooksSrc = join(source, "templates", "codex-hooks.json");
  if (codex && existsSync(codexHooksSrc)) items.push({ kind: "settings", src: codexHooksSrc, dest: join(target, ".codex", "hooks.json"), merge: '"hooks"' });
  else if (codex) notes.push("nothing to copy: templates/codex-hooks.json is missing in the source");

  for (const it of items) {
    if ((it.kind === "copy" || it.kind === "generate") && present(it.dest)) it.kind = "skip";
    if (it.kind === "settings") it.kind = present(it.dest) ? "manual" : "copy";
  }
  return { items, notes };
}

function git(tgt, args) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_") && !k.startsWith("GIT_CONFIG_")) delete env[k];
  return spawnSync("git", ["-C", tgt, ...args], { encoding: "utf8", env });
}

/** Names of the hooks in .git/hooks that git runs today. A .sample file is not a hook. */
function projectHooks(tgt) {
  const r = git(tgt, ["rev-parse", "--git-path", "hooks"]);
  if (r.status !== 0) return [];
  const dir = resolve(tgt, r.stdout.trim());
  try {
    return readdirSync(dir).filter((name) => !name.endsWith(".sample") && statSync(join(dir, name)).isFile()).sort();
  } catch {
    return [];
  }
}

/**
 * Turn on the copied git hooks: git config core.hooksPath .githooks, in the target only.
 * Returns { state, lines }. state is one of: set, would-set, already, other, kept, worktree, no-git.
 * kept: .git/hooks has hooks of the project and replaceGitHooks is false, so nothing changed.
 * worktree: the target is a linked worktree. Its config is the config of the main repo, so nothing changed.
 * A dry run changes nothing.
 */
function enableHooksPath(tgt, dryRun, replaceGitHooks = false) {
  const cmd = "git config core.hooksPath .githooks";
  const top = git(tgt, ["rev-parse", "--show-toplevel"]);
  let isRepo = false;
  try {
    isRepo = top.status === 0 && realpathSync(top.stdout.trim()) === realpathSync(tgt);
  } catch {}
  if (!isRepo) {
    return { state: "no-git", lines: ["git does not see a repo at the target, so core.hooksPath was not set.", `After you run git init, run this in the target: ${cmd}`] };
  }
  const cur = git(tgt, ["config", "--get", "core.hooksPath"]);
  const value = cur.status === 0 ? cur.stdout.trim() : "";
  if (value === ".githooks") return { state: "already", lines: ["core.hooksPath is already .githooks. Nothing changed."] };
  if (cur.status === 0) {
    return { state: "other", lines: [`core.hooksPath is already set to "${value}", so it was not changed.`, `The copied hooks will not run until you decide. To use them, run this in the target: ${cmd}`] };
  }
  if (cur.status !== 1) return { state: "no-git", lines: [`git could not read core.hooksPath: ${cur.stderr.trim()}`, `Run this in the target by hand: ${cmd}`] };
  const dirs = git(tgt, ["rev-parse", "--git-dir", "--git-common-dir"]).stdout.trim().split("\n");
  if (dirs.length === 2 && resolve(tgt, dirs[0]) !== resolve(tgt, dirs[1])) {
    return {
      state: "worktree",
      lines: [
        "The target is a linked worktree, so core.hooksPath was not set. In a worktree, git config changes the main repo and every other worktree.",
        `Fix: run the install in the main checkout. Or, after the installed files reach the main checkout, run this there: ${cmd}`,
      ],
    };
  }
  const own = projectHooks(tgt);
  if (own.length > 0 && !replaceGitHooks) {
    return {
      state: "kept",
      lines: [
        `.git/hooks has hooks of the project: ${own.join(", ")}. core.hooksPath was not set, so these hooks still run.`,
        `The copied hooks in .githooks/ do not run yet. With core.hooksPath set, git stops running ${own.join(", ")}.`,
        "To keep them, copy them into .githooks/ first. Then run the install again with --replace-git-hooks.",
      ],
    };
  }
  const lost = own.length > 0 ? [`These hooks in .git/hooks stop running now: ${own.join(", ")}.`] : [];
  if (dryRun) return { state: "would-set", lines: [`would run  ${cmd}`, ...lost] };
  const set = git(tgt, ["config", "core.hooksPath", ".githooks"]);
  if (set.status !== 0) return { state: "no-git", lines: [`git config failed: ${set.stderr.trim()}`, `Run this in the target by hand: ${cmd}`] };
  return { state: "set", lines: [`ran  ${cmd}`, ...lost] };
}

export const EVIDENCE_MEDIA = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"];
export const GITIGNORE_HEADER = "# sstack: evidence media from /prove stays out of commits. /land pushes it to the branch evidence/<task>.";
export const GITIGNORE_RULES = EVIDENCE_MEDIA.map((ext) => `.artifacts/*/evidence/**/*.${ext}`);
const BROAD_ARTIFACTS = new Set([".artifacts", ".artifacts/", "/.artifacts", "/.artifacts/", ".artifacts/*", ".artifacts/**", "/.artifacts/*", "/.artifacts/**"]);

// The text that marks the starter .stack/check and the line to replace in the AGENTS.md template.
export const CHECK_PLACEHOLDER_MARK = "# PLACEHOLDER.";
export const AGENTS_PLACEHOLDER_MARK = "Replace this line.";
// A file at the target root that shows that the repo has code with a check command to run.
const MANIFESTS = ["package.json", "pyproject.toml", "setup.py", "Cargo.toml", "go.mod", "Gemfile", "composer.json", "pom.xml", "build.gradle", "build.gradle.kts", "deno.json", "Makefile"];

function fileHas(p, text) {
  try {
    return readFileSync(p, "utf8").includes(text);
  } catch {
    return false;
  }
}

/**
 * The steps that a person must do after the install, before the first /build. Returns the lines to print.
 * /build makes every worktree from origin/main, so the stack must be in origin/main first (run 1: the first
 * build ran with no AGENTS.md, no hook and no .stack/check). /setup comes before the commit, so its file
 * goes into the same commit.
 */
export function nextSteps(tgt, { checkIsPlaceholder = false, agentsHasPlaceholder = false, hooksOff = false, codex = false } = {}) {
  const lines = ["Next steps, before the first /build:"];
  let n = 0;
  const step = (text) => lines.push(`${++n}. ${text}`);
  if (agentsHasPlaceholder) step("Fill in the Project line and the check commands in AGENTS.md.");
  // hooksOff: the installer did not set core.hooksPath (kept, worktree, other, no-git), so the copied hook is off.
  if (hooksOff) step("Turn on the copied git hooks, as the core.hooksPath lines above say. Until then, no commit runs .stack/check.");
  if (checkIsPlaceholder) {
    if (MANIFESTS.some((m) => existsSync(join(tgt, m)))) {
      step("Put the check command of this repo in .stack/check, for example npm test. The agent cannot edit that file. Until you do, no commit runs a check.");
    } else {
      step("This repo has no check command yet, so no commit runs a check. That includes the commits of the first ticket. When a ticket adds a check command, put it in .stack/check. The agent cannot edit that file.");
    }
  }
  if (!existsSync(join(tgt, "docs", "agents", "tracker.md"))) step("Type /setup once to choose the issue tracker. It writes docs/agents/tracker.md, which goes into the commit of the next step.");
  if (git(tgt, ["remote", "get-url", "origin"]).status === 0) {
    step("Commit the new files and get them into origin/main, with a pull request or a push by a person. /build makes every worktree from origin/main, so the stack must be there first.");
  } else {
    step("This repo has no origin remote. /build makes every worktree from origin/main. Add a remote, then commit the new files and push them to origin/main.");
  }
  // Codex skips an untrusted project hook, and `codex exec` says nothing about it (Codex CLI 0.172.0).
  if (codex) step('In Codex, trust this project, then trust the hook "sstack git guard" in /hooks. Until then, Codex skips the guard with no warning. Type $name where these steps say /name.');
  step("Then type /start and say what you want done.");
  return lines;
}

// Permissions. Owner ruling: the installer PRINTS the allow list and writes it to
// docs/agents/permissions.md. It never writes a rule into a settings file. A later
// --write-permissions option is possible. In e2e runs 1 and 2 an unattended /build stopped at
// each command that needed approval, and no file named the commands that the stack runs.
// Each entry: [Claude Code rule, the same thing in plain words for other agent tools].
export const ALLOW_RULES = [
  ["Bash(git:*)", "`git`. In Claude Code the git guard hook still checks each git command."],
  ["Bash(node .claude/skills/*)", "`node .claude/skills/<skill>/scripts/<script>.mjs`, or in Codex `node .agents/skills/<skill>/scripts/<script>.mjs`: the lints and checks of the stack."],
  ["Bash(./.stack/check)", "`./.stack/check`: the project check, the same file that the commit hook runs."],
  ["Bash(gh --version)", "`gh --version`, `gh auth status`, `gh repo view`, `gh issue view|list|create`, `gh pr list|view|diff|create`: read or create only, for /setup, /tickets, /build and /land."],
  ["Bash(gh auth status)", null],
  ["Bash(gh repo view:*)", null],
  ["Bash(gh issue view:*)", null],
  ["Bash(gh issue list:*)", null],
  ["Bash(gh issue create:*)", null],
  ["Bash(gh pr list:*)", null],
  ["Bash(gh pr view:*)", null],
  ["Bash(gh pr diff:*)", null],
  ["Bash(gh pr create:*)", null],
  ["Bash(glab --version)", "`glab --version`: /setup looks for the GitLab tool."],
  ["Edit(/.scratch/**)", "Write `.scratch/`: local specs, tickets and their status."],
  ["Edit(/docs/agents/**)", "Write `docs/agents/`: the tracker doc and the enforcement list."],
  ["Edit(/GLOSSARY.md)", "Write `GLOSSARY.md`."],
  ["Edit(/docs/adr/**)", "Write `docs/adr/`: decision records."],
];
// Rules that the list must never hold. Each one lets the agent run a command that the git guard
// cannot read (`node -e`, `npm exec`, `gh pr merge --admin`, `gh api`), or write any file.
export const NEVER_ALLOW = ["Bash(node:*)", "Bash(npm:*)", "Bash(npx:*)", "Bash(gh:*)", "Bash(cd:*)", "Bash(cp:*)", "Bash(mv:*)", "Bash(rm:*)", "Bash(sh:*)", "Bash(bash:*)", "Bash(python3:*)"];
// Guard files that the agent must not edit, also in a worktree of the repo.
const GUARD_PATHS = [".stack/**", ".githooks/**", ".claude/hooks/**", ".claude/settings.json", ".claude/settings.local.json"];
// The Codex guard files. With --tool both, the Claude Code deny rules name them too, so the Edit tool cannot change them.
const CODEX_GUARD_PATHS = [".codex/hooks/**", ".codex/hooks.json", ".codex/config.toml", ".codex/rules/**"];

/** The Claude settings template with deny rules for the Codex guard files added. */
export function claudeSettingsText(text) {
  const settings = JSON.parse(text);
  const deny = [...(settings.permissions?.deny ?? []), ...CODEX_GUARD_PATHS.map((g) => `Edit(/${g})`)];
  settings.permissions = { ...settings.permissions, deny };
  return `${JSON.stringify(settings, null, 2)}\n`;
}
export const TEMP_FOLDER = "sstack";

function realOrSame(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * The rules for this machine: the static list, plus the worktrees folder that /build uses
 * (../<repo>-worktrees) and the temp folder of the /start note and the diagnose notebook.
 * The deny rules close the hole that the worktree allow opens (e2e run 1 break 8: an edit to
 * <worktree>/.stack/check was applied, while the same edit in the project was denied).
 * Returns { allow, deny, worktrees }.
 */
export function permissionRules(tgt, tmp = tmpdir(), codex = false) {
  const real = realOrSame(tgt);
  const worktrees = join(dirname(real), `${basename(real)}-worktrees`);
  const allow = ALLOW_RULES.map(([rule]) => rule);
  allow.push(`Read(/${worktrees}/**)`, `Edit(/${worktrees}/**)`, "Bash(echo $TMPDIR)");
  for (const t of new Set([tmp, realOrSame(tmp)])) allow.push(`Edit(/${join(t, TEMP_FOLDER)}/**)`);
  const deny = [...GUARD_PATHS, ...(codex ? CODEX_GUARD_PATHS : [])].map((g) => `Edit(/${worktrees}/*/${g})`);
  return { allow, deny, worktrees };
}

export const STARTER_PERMISSIONS = `# Permissions

The stack runs the commands below and writes the files below. If your agent tool asks before each command, allow these. If not, an unattended run stops at each one, and the first /build stops many times.

With \`--tool claude\` or \`--tool both\`, the installer printed the same list in the syntax of Claude Code. It wrote no settings file. You decide what to allow.

## Commands

${ALLOW_RULES.filter(([r, plain]) => plain && r.startsWith("Bash(")).map(([, plain]) => `- ${plain}`).join("\n")}
- The test command of this project, for example \`npm test\`.
- \`echo $TMPDIR\`, to find the temp folder.

## Files and folders

${ALLOW_RULES.filter(([r, plain]) => plain && r.startsWith("Edit(")).map(([, plain]) => `- ${plain}`).join("\n")}
- Read and write the worktrees folder \`../<repo>-worktrees/\`, where /build makes one worktree for each ticket.
- Write \`$TMPDIR/${TEMP_FOLDER}/\`: the /start note and the diagnose notebook.

## Never allow

- \`node\`, \`npm\`, \`npx\`, \`sh\`, \`bash\` or \`python3\` with any argument. They run code that the git guard cannot read.
- \`gh\` with any argument. \`gh pr merge --admin\` and \`gh api\` skip the merge gate.
- \`cd\`, \`cp\`, \`mv\` or \`rm\` with any argument.
- Edits to \`.stack/\`, \`.githooks/\`, \`.claude/hooks/\`, \`.claude/settings*.json\`, \`.codex/hooks/\`, \`.codex/hooks.json\`, \`.codex/config.toml\` and \`.codex/rules/\`, in the repo and in each worktree.
`;

// Codex: print only (owner ruling). The installer writes no .codex/config.toml and no .codex/rules.
export const CODEX_PERMISSION_LINES = [
  "Permissions for Codex. The installer wrote no .codex/config.toml and no .codex/rules/ file. You decide.",
  "docs/agents/permissions.md lists the commands that the stack runs and the files that it writes.",
];

/** The lines to print: where to paste the rules, why, and the rules as JSON. */
export function permissionLines(tgt, tmp = tmpdir(), codex = false) {
  const { allow, deny } = permissionRules(tgt, tmp, codex);
  return [
    "Permissions for Claude Code. The installer wrote no settings file. You decide.",
    "Paste these rules into the \"permissions\" of .claude/settings.local.json. Without them, the first /build stops for permission many times.",
    "Add one rule for the test command of the project, for example Bash(npm test:*). docs/agents/permissions.md has the same list for other agent tools.",
    ...JSON.stringify({ allow, deny }, null, 2).split("\n").map((l) => `    ${l}`),
  ];
}

/**
 * Append the evidence media rules to <target>/.gitignore. Returns { state, lines }.
 * state is one of: added, would-add, already, manual. A dry run changes nothing.
 */
export function ensureGitignore(tgt, dryRun = false) {
  const p = join(tgt, ".gitignore");
  let text = "";
  if (present(p)) {
    const st = lstatSync(p);
    if (!st.isFile()) {
      return {
        state: "manual",
        lines: [`.gitignore is ${st.isSymbolicLink() ? "a symlink" : "not a regular file"}, so it was not changed.`, "Add these lines to it by hand, so that evidence media stays out of commits:", ...GITIGNORE_RULES.map((r) => `    ${r}`)],
      };
    }
    text = readFileSync(p, "utf8");
  }
  const have = new Set(text.split("\n").map((l) => l.replace(/\r$/, "").trim()));
  if ([...have].some((l) => BROAD_ARTIFACTS.has(l))) return { state: "already", lines: ["skip    .gitignore (it already ignores .artifacts/)"] };
  const missing = GITIGNORE_RULES.filter((r) => !have.has(r));
  if (missing.length === 0) return { state: "already", lines: ["skip    .gitignore (the evidence media rules are already there)"] };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = [...(have.has(GITIGNORE_HEADER) ? [] : [GITIGNORE_HEADER]), ...missing].join(eol) + eol;
  const lead = text === "" ? "" : (text.endsWith("\n") ? "" : eol) + eol;
  const verb = text === "" ? "create" : "append to";
  if (dryRun) return { state: "would-add", lines: [`would ${verb}  .gitignore (${missing.length} evidence media rule(s))`] };
  if (!present(p)) writeFileSync(p, block, { flag: "wx", mode: 0o644 });
  else appendFileSync(p, lead + block);
  return { state: "added", lines: [`${verb}  .gitignore (${missing.length} evidence media rule(s))`] };
}

export const MIN_CLAUDE_VERSION = "2.1.295";

/** Returns the version text of the claude binary, or null when there is no binary or no output. */
export function lookupClaudeVersion() {
  try {
    const r = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 5000 });
    if (r.error || r.status !== 0) return null;
    return r.stdout;
  } catch {
    return null;
  }
}

/** True when text holds a version that is older than min. Text that holds no version is never old. */
export function isOlderVersion(text, min = MIN_CLAUDE_VERSION) {
  const m = String(text ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const have = m.slice(1, 4).map(Number);
  const want = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (have[i] !== want[i]) return have[i] < want[i];
  }
  return false;
}

/**
 * symlink is the function that makes the CLAUDE.md link. Tests pass one that throws, to act as an
 * OS that refuses symlinks. claudeVersion returns the output of `claude --version` or null.
 * Tests pass a fake, so no real binary runs.
 */
export function install({ source = DEFAULT_SOURCE, target, tool = "claude", dryRun = false, replaceGitHooks = false, log = console.log, symlink = symlinkSync, claudeVersion = lookupClaudeVersion }) {
  if (!TOOLS.includes(tool)) throw new InstallUsageError(`unknown tool "${tool}". Use claude, codex or both.`);
  if (!target) throw new InstallUsageError("missing target directory");
  const src = resolve(source);
  const tgt = resolve(target);
  if (!isDir(tgt)) throw new InstallUsageError(`target ${tgt} is not a directory`);
  if (realpathSync(tgt) === realpathSync(src)) {
    throw new InstallRefusal(`target is this repo itself (${tgt}). Pick a project repo.`);
  }
  if (!existsSync(join(tgt, ".git"))) {
    throw new InstallRefusal(`target ${tgt} is not a git repo (no .git). Run \`git init\` there first, or pick the repo root.`);
  }

  const { items, notes } = plan(src, tgt, tool);
  checkDestinations(items, tgt);
  const counts = { copy: 0, generate: 0, link: 0, skip: 0, manual: 0 };
  for (const it of items) {
    counts[it.kind]++;
    const rel = relative(tgt, it.dest);
    if (it.kind === "skip") log(`skip    ${rel} (${it.why ?? "already exists, not overwritten"})`);
    else if (it.kind === "manual") log(`manual  ${rel} (${it.why ?? "already exists, not merged"})`);
    else if (it.kind === "link") {
      if (dryRun) log(`would link  ${rel} -> ${it.linkTo}`);
      else {
        try {
          symlink(it.linkTo, it.dest, "file");
          log(`link  ${rel} -> ${it.linkTo}`);
        } catch (e) {
          writeFileSync(it.dest, CLAUDE_FALLBACK, { flag: "wx", mode: 0o644 });
          it.fallback = true;
          log(`create  ${rel} (one line, @AGENTS.md, because the OS refused the symlink: ${e.code ?? e.message})`);
          it.hint = [
            `The OS refused a symlink, so ${rel} is a one-line file that imports AGENTS.md. Claude Code follows that import.`,
            "If your OS allows symlinks later, run this in the target: rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md",
          ];
        }
      }
    } else if (it.kind === "generate") {
      log(`${dryRun ? "would create" : "create"}  ${rel} (starter file)`);
      if (!dryRun) {
        mkdirSync(dirname(it.dest), { recursive: true });
        writeFileSync(it.dest, it.content, { flag: "wx", mode: it.mode });
        chmodSync(it.dest, it.mode);
      }
    } else {
      log(`${dryRun ? "would copy" : "copy"}  ${rel}`);
      if (!dryRun) {
        mkdirSync(dirname(it.dest), { recursive: true });
        if (it.content !== undefined) writeFileSync(it.dest, it.content, { flag: "wx" });
        else if (it.rewrite) writeFileSync(it.dest, codexText(readFileSync(it.src, "utf8")), { flag: "wx" });
        else copyFileSync(it.src, it.dest);
        chmodSync(it.dest, statSync(it.src).mode & 0o777);
      }
    }
  }
  for (const n of notes) log(`note    ${n}`);
  let hooksPath = "none";

  for (const it of items.filter((i) => i.hint)) {
    log("");
    for (const l of it.hint) log(l);
  }
  for (const manual of items.filter((i) => i.kind === "manual" && i.src)) {
    log("");
    log(`${relative(tgt, manual.dest)} already exists, so it was not changed. Add these entries by hand (merge into the existing ${manual.merge}):`);
    log((manual.content ?? readFileSync(manual.src, "utf8")).trimEnd().replace(/^/gm, "    "));
  }
  if (items.some((i) => i.dest.startsWith(join(tgt, ".githooks")))) {
    log("");
    const hp = enableHooksPath(tgt, dryRun, replaceGitHooks);
    for (const l of hp.lines) log(l);
    hooksPath = hp.state;
  }
  log("");
  const gi = ensureGitignore(tgt, dryRun);
  for (const l of gi.lines) log(l);
  // A note for the Claude Code adapter only. It never changes the result of the install.
  let version = null;
  try {
    if (tool !== "codex") version = claudeVersion();
  } catch {}
  if (isOlderVersion(version)) {
    log("");
    log(`note    The Claude Code adapter uses onFailure: block in the hook settings. This setting needs Claude Code ${MIN_CLAUDE_VERSION} or later. Your version is older, so please update Claude Code.`);
  }
  log("");
  if (tool !== "codex") for (const l of permissionLines(tgt, undefined, tool === "both")) log(l);
  else for (const l of CODEX_PERMISSION_LINES) log(l);
  log("");
  log(`${dryRun ? "Dry run, nothing written. " : ""}${counts.copy + counts.generate + counts.link} to create, ${counts.skip} skipped, ${counts.manual} need a manual step.`);
  const planned = (rel) => dryRun && items.some((i) => i.dest === join(tgt, rel) && (i.kind === "copy" || i.kind === "generate"));
  const steps = nextSteps(tgt, {
    checkIsPlaceholder: planned(join(".stack", "check")) || fileHas(join(tgt, ".stack", "check"), CHECK_PLACEHOLDER_MARK),
    agentsHasPlaceholder: (planned("AGENTS.md") && fileHas(join(src, "templates", "AGENTS.md"), AGENTS_PLACEHOLDER_MARK)) || fileHas(join(tgt, "AGENTS.md"), AGENTS_PLACEHOLDER_MARK),
    hooksOff: ["kept", "worktree", "other", "no-git"].includes(hooksPath),
    codex: tool !== "claude",
  });
  log("");
  for (const l of steps) log(l);
  return { items, notes, counts, hooksPath, gitignore: gi.state, nextSteps: steps };
}

function main(argv) {
  let dryRun = false;
  let replaceGitHooks = false;
  let tool = "claude";
  let target;
  let source;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--replace-git-hooks") replaceGitHooks = true;
    else if (a === "--source") source = argv[++i];
    else if (a === "--tool") tool = argv[++i] ?? "";
    else if (a.startsWith("-")) {
      console.error(`install: unknown option ${a}\n${USAGE}`);
      return 2;
    } else if (target === undefined) target = a;
    else {
      console.error(`install: too many arguments\n${USAGE}`);
      return 2;
    }
  }
  try {
    install({ source: source ?? DEFAULT_SOURCE, target, tool, dryRun, replaceGitHooks });
    return 0;
  } catch (e) {
    if (e instanceof InstallRefusal) {
      console.error(`install: refused. ${e.message}`);
      return 1;
    }
    console.error(`install: ${e.message}${e instanceof InstallUsageError ? `\n${USAGE}` : ""}`);
    return 2;
  }
}

// Compare real paths so a run through a symlink still counts as a direct run.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv.slice(2));
}
