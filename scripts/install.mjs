#!/usr/bin/env node
// install: copies this stack into a project repo.
//
//   skills/*                   -> <target>/.claude/skills/
//   hooks/*                    -> <target>/.claude/hooks/
//   templates/AGENTS.md, CLAUDE.md, GLOSSARY.md -> <target>/
//   templates/adr/*            -> <target>/docs/adr/
//   templates/claude-settings.json -> <target>/.claude/settings.json (never merged)
//   templates/githooks/*       -> <target>/.githooks/
//
// Existing files are never overwritten. They are reported as skipped.
// Paths checked against the Claude Code docs (skills and hooks pages): project
// skills live in `.claude/skills/<name>/SKILL.md`, and a hook command refers to a
// project script as `${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>`.
//
// Usage: node scripts/install.mjs [--dry-run] <target-repo>
// Exit 0 done, 1 refused (not a git repo, or the target is this repo), 2 usage or read error.

import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    if (it.kind !== "copy") continue;
    let dir = dirname(it.dest);
    while (!present(dir)) dir = dirname(dir);
    const real = realpathSync(dir);
    if (real !== realTgt && !real.startsWith(realTgt + sep)) bad.push(`${relative(tgt, it.dest)} would be written through a symlink to ${real}, outside the target`);
    else if (!statSync(dir).isDirectory()) bad.push(`${relative(tgt, it.dest)} needs a folder, but ${relative(tgt, dir)} is a file`);
  }
  if (bad.length > 0) throw new InstallRefusal(`nothing was written. ${bad.join("; ")}. Fix: remove or move the symlink or file, then run the install again.`);
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
  for (const f of ["AGENTS.md", "CLAUDE.md", "GLOSSARY.md"]) addFile(join("templates", f), f);
  addTree(join(source, "templates", "adr"), join(target, "docs", "adr"));
  addTree(join(source, "templates", "githooks"), join(target, ".githooks"));

  const settingsSrc = join(source, "templates", "claude-settings.json");
  if (existsSync(settingsSrc)) items.push({ kind: "settings", src: settingsSrc, dest: join(target, ".claude", "settings.json") });
  else notes.push("nothing to copy: templates/claude-settings.json is missing in the source");

  for (const it of items) {
    if (it.kind === "copy" && present(it.dest)) it.kind = "skip";
    if (it.kind === "settings") it.kind = present(it.dest) ? "manual" : "copy";
  }
  return { items, notes };
}

export function install({ source = DEFAULT_SOURCE, target, dryRun = false, log = console.log }) {
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
  const counts = { copy: 0, skip: 0, manual: 0 };
  for (const it of items) {
    counts[it.kind]++;
    const rel = relative(tgt, it.dest);
    if (it.kind === "skip") log(`skip    ${rel} (already exists, not overwritten)`);
    else if (it.kind === "manual") log(`manual  ${rel} (already exists, not merged)`);
    else {
      log(`${dryRun ? "would copy" : "copy"}  ${rel}`);
      if (!dryRun) {
        mkdirSync(dirname(it.dest), { recursive: true });
        copyFileSync(it.src, it.dest);
        chmodSync(it.dest, statSync(it.src).mode & 0o777);
      }
    }
  }
  for (const n of notes) log(`note    ${n}`);

  const manual = items.find((i) => i.kind === "manual");
  if (manual) {
    log("");
    log(`${relative(tgt, manual.dest)} already exists, so it was not changed. Add these entries by hand (merge into the existing "hooks" and "permissions"):`);
    log(readFileSync(manual.src, "utf8").trimEnd().replace(/^/gm, "    "));
  }
  if (items.some((i) => i.dest.startsWith(join(tgt, ".githooks")))) {
    log("");
    log("Next step: run this in the target repo so git uses the copied hooks:");
    log("    git config core.hooksPath .githooks");
  }
  log("");
  log(`${dryRun ? "Dry run, nothing written. " : ""}${counts.copy} to copy, ${counts.skip} skipped, ${counts.manual} need a manual step.`);
  return { items, notes, counts };
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
