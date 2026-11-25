#!/usr/bin/env node
// install: copies this stack into a project repo.
//
//   skills/*                   -> <target>/.claude/skills/
//   hooks/*                    -> <target>/.claude/hooks/
//   templates/AGENTS.md, GLOSSARY.md -> <target>/
//   (built in)                 -> <target>/CLAUDE.md, a relative symlink to AGENTS.md
//   templates/adr/*            -> <target>/docs/adr/
//   templates/claude-settings.json -> <target>/.claude/settings.json (never merged)
//   templates/githooks/*       -> <target>/.githooks/
//   (built in)                 -> <target>/.stack/check, docs/agents/enforcement.md (starter files)
//   (built in)                 -> <target>/.gitignore: rules that keep evidence media out of commits
//
// After the copy, the installer runs `git config core.hooksPath .githooks` in the target.
// It does this only when the target is a git repo and core.hooksPath is not set.

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
// Usage: node scripts/install.mjs [--dry-run] <target-repo>
// Exit 0 done, 1 refused (not a git repo, or the target is this repo), 2 usage or read error.

import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, existsSync, writeFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export class InstallRefusal extends Error {}
export class InstallUsageError extends Error {}

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
| No commits or direct pushes to main or master | AGENTS.md rule 2 | .claude/hooks/guard-git.mjs (Claude Code only) | install |
| No plain force push | AGENTS.md rule 3 | .claude/hooks/guard-git.mjs (Claude Code only) | install |
| Never skip checks | AGENTS.md rule 4 | .claude/hooks/guard-git.mjs (Claude Code only), .githooks/prepare-commit-msg | install |
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

/** Build the plan. Returns { items, notes }. Does not write. */
export function plan(source, target) {
  const items = [];
  const notes = [];
  const addTree = (srcDir, destDir) => {
    if (!isDir(srcDir)) {
      notes.push(`nothing to copy: ${relative(source, srcDir)}/ is missing in the source`);
      return;
    }
    for (const f of walk(srcDir)) items.push({ kind: "copy", src: f, dest: join(destDir, relative(srcDir, f)) });
  };
  const addFile = (rel, destRel) => {
    const src = join(source, rel);
    if (!existsSync(src)) {
      notes.push(`nothing to copy: ${rel} is missing in the source`);
      return;
    }
    items.push({ kind: "copy", src, dest: join(target, destRel) });
  };

  addTree(join(source, "skills"), join(target, ".claude", "skills"));
  addTree(join(source, "hooks"), join(target, ".claude", "hooks"));
  for (const f of ["AGENTS.md", "GLOSSARY.md"]) addFile(join("templates", f), f);
  const link = claudeLinkItem(target, existsSync(join(source, "templates", "AGENTS.md")), notes);
  if (link) items.push(link);
  addTree(join(source, "templates", "adr"), join(target, "docs", "adr"));
  addTree(join(source, "templates", "githooks"), join(target, ".githooks"));

  items.push({ kind: "generate", content: STARTER_CHECK, mode: 0o755, dest: join(target, ".stack", "check") });
  items.push({ kind: "generate", content: STARTER_ENFORCEMENT, mode: 0o644, dest: join(target, "docs", "agents", "enforcement.md") });

  const settingsSrc = join(source, "templates", "claude-settings.json");
  if (existsSync(settingsSrc)) items.push({ kind: "settings", src: settingsSrc, dest: join(target, ".claude", "settings.json") });
  else notes.push("nothing to copy: templates/claude-settings.json is missing in the source");

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

/**
 * Turn on the copied git hooks: git config core.hooksPath .githooks, in the target only.
 * Returns { state, lines }. state is one of: set, would-set, already, other, no-git.
 * A dry run changes nothing.
 */
function enableHooksPath(tgt, dryRun) {
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
  if (dryRun) return { state: "would-set", lines: [`would run  ${cmd}`] };
  const set = git(tgt, ["config", "core.hooksPath", ".githooks"]);
  if (set.status !== 0) return { state: "no-git", lines: [`git config failed: ${set.stderr.trim()}`, `Run this in the target by hand: ${cmd}`] };
  return { state: "set", lines: [`ran  ${cmd}`] };
}

export const EVIDENCE_MEDIA = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"];
export const GITIGNORE_HEADER = "# agent-stack: evidence media from /prove stays out of commits. /land pushes it to the branch evidence/<task>.";
export const GITIGNORE_RULES = EVIDENCE_MEDIA.map((ext) => `.artifacts/*/evidence/**/*.${ext}`);
const BROAD_ARTIFACTS = new Set([".artifacts", ".artifacts/", "/.artifacts", "/.artifacts/", ".artifacts/*", ".artifacts/**", "/.artifacts/*", "/.artifacts/**"]);

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
  if (text === "") writeFileSync(p, block, { flag: "wx", mode: 0o644 });
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
export function install({ source = DEFAULT_SOURCE, target, dryRun = false, log = console.log, symlink = symlinkSync, claudeVersion = lookupClaudeVersion }) {
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

  const { items, notes } = plan(src, tgt);
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
        copyFileSync(it.src, it.dest);
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
  const manual = items.find((i) => i.kind === "manual" && i.src);
  if (manual) {
    log("");
    log(`${relative(tgt, manual.dest)} already exists, so it was not changed. Add these entries by hand (merge into the existing "hooks" and "permissions"):`);
    log(readFileSync(manual.src, "utf8").trimEnd().replace(/^/gm, "    "));
  }
  if (items.some((i) => i.dest.startsWith(join(tgt, ".githooks")))) {
    log("");
    const hp = enableHooksPath(tgt, dryRun);
    for (const l of hp.lines) log(l);
    hooksPath = hp.state;
  }
  log("");
  const gi = ensureGitignore(tgt, dryRun);
  for (const l of gi.lines) log(l);
  if (items.some((i) => i.kind !== "skip" && i.dest === join(tgt, ".stack", "check"))) {
    log("");
    log(".stack/check is a placeholder. It allows every commit and prints a warning.");
    log("Edit .stack/check and put the check command of your project in it.");
  }
  // A note for the Claude Code adapter only. It never changes the result of the install.
  let version = null;
  try {
    version = claudeVersion();
  } catch {}
  if (isOlderVersion(version)) {
    log("");
    log(`note    The Claude Code adapter uses onFailure: block in the hook settings. This setting needs Claude Code ${MIN_CLAUDE_VERSION} or later. Your version is older, so please update Claude Code.`);
  }
  log("");
  log(`${dryRun ? "Dry run, nothing written. " : ""}${counts.copy + counts.generate + counts.link} to create, ${counts.skip} skipped, ${counts.manual} need a manual step.`);
  return { items, notes, counts, hooksPath, gitignore: gi.state };
}

function main(argv) {
  let dryRun = false;
  let target;
  let source;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--source") source = argv[++i];
    else if (a.startsWith("-")) {
      console.error(`install: unknown option ${a}\nUsage: node scripts/install.mjs [--dry-run] <target-repo>`);
      return 2;
    } else if (target === undefined) target = a;
    else {
      console.error("install: too many arguments\nUsage: node scripts/install.mjs [--dry-run] <target-repo>");
      return 2;
    }
  }
  try {
    install({ source: source ?? DEFAULT_SOURCE, target, dryRun });
    return 0;
  } catch (e) {
    if (e instanceof InstallRefusal) {
      console.error(`install: refused. ${e.message}`);
      return 1;
    }
    console.error(`install: ${e.message}${e instanceof InstallUsageError ? "\nUsage: node scripts/install.mjs [--dry-run] <target-repo>" : ""}`);
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
