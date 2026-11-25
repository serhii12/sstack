#!/usr/bin/env node
// churn: ranks the files of a git repo by the number of commits that changed them.
//
// The idea comes from mattpocock/skills skills/engineering/improve-codebase-architecture/SKILL.md
// (MIT, Copyright (c) 2026 Matt Pocock, see NOTICE): scope a survey to the files that keep
// changing, found from `git log`. The code is new.
//
// The window is the last N commits (default 200) that are not merges, or the commits since a
// date. A file counts once for each commit that changed it. Files that no longer exist,
// lockfiles, and files under agent tooling or dependency folders (SKIP_DIRS) are left out.
// Ties sort by path.
//
// Output: one header line, then one `count  path` line for each file. A path that holds a
// control character, such as a newline, prints as a JSON string, so that one file is always one
// line. The header says when the clone is shallow, and it shows the date that git read from --since.
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/improve-codebase/scripts/churn.mjs [--commits <n>] [--since <date>] [--top <n>] [dir]
// In the stack repo it is skills/improve-codebase/scripts/churn.mjs.
//
// Exit codes:
//   0  the ranking is printed
//   1  the window holds no changed file that still exists, so there is nothing to rank
//   2  usage error
//   3  the repo has no commits
//   4  the folder is not inside a git work tree
//   5  git cannot run, or a git command failed

import { realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/improve-codebase/scripts/churn.mjs [--commits <n>] [--since <date>] [--top <n>] [dir]";
export const DEFAULT_COMMITS = 200;
export const DEFAULT_TOP = 20;
// `git log -n` takes a 32-bit number. A larger value is a usage error, and git must not see it.
export const MAX_COUNT = 2 ** 31 - 1;
export const EXIT = { OK: 0, NOTHING: 1, USAGE: 2, NO_COMMITS: 3, NOT_A_REPO: 4, GIT_FAILED: 5 };

// Folders of agent tooling, work notes and dependencies. They are not the code of the project.
export const SKIP_DIRS = [".claude/", ".agents/", ".codex/", ".githooks/", ".stack/", ".artifacts/", ".scratch/", "node_modules/", "vendor/"];

// Generated files that change with every dependency update. They say nothing about design.
export const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
  "deno.lock", "Cargo.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "Gemfile.lock", "composer.lock",
  "go.sum", "mix.lock", "pubspec.lock", "Podfile.lock", "flake.lock",
]);

export class ChurnError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new ChurnError(EXIT.GIT_FAILED, `git cannot run: ${r.error.message}. Fix: install git, or put it on PATH.`);
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

/** Undo the C-style quotes that git puts around a path with unusual characters. */
export function unquotePath(p) {
  if (!(p.startsWith('"') && p.endsWith('"') && p.length >= 2)) return p;
  const body = p.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const n = body[++i];
    if (/[0-7]/.test(n)) {
      bytes.push(parseInt(body.slice(i, i + 3), 8));
      i += 2;
    } else bytes.push({ n: 10, t: 9, r: 13, b: 8, f: 12, v: 11, a: 7 }[n] ?? n.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Count commits per file. Returns { top, commits, files: [{ path, count }] }. */
export function churn(dirArg, { commits = DEFAULT_COMMITS, since } = {}) {
  const dir = resolve(dirArg ?? ".");
  let isDir = false;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new ChurnError(EXIT.USAGE, `${dir} is not a folder. Fix: pass the project folder, or run from it.`);

  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new ChurnError(EXIT.NOT_A_REPO, `${dir} is not inside a git work tree. Fix: run from a git repo, or name the area to scan.`);
  const root = top.out.trim();
  if (!git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).ok) {
    throw new ChurnError(EXIT.NO_COMMITS, "the repo has no commits, so no file has a history. Fix: scan the whole repo, or name the area to scan.");
  }

  const args = ["-c", "core.quotepath=false", "log", "--no-merges", "--format=%x00%H", "--name-only", "--no-color"];
  let sinceDate;
  if (since !== undefined) {
    args.push(`--since=${since}`);
    // git never refuses a date. It reads text that it does not know as "now", and a year that is too large as this year.
    const age = /^--max-age=(\d+)$/m.exec(git(root, ["rev-parse", `--since=${since}`]).out);
    if (age) sinceDate = new Date(Number(age[1]) * 1000).toISOString().slice(0, 10);
  } else args.push("-n", String(commits));
  args.push("HEAD", "--");
  const log = git(root, args);
  if (!log.ok) throw new ChurnError(EXIT.GIT_FAILED, `git log failed: ${log.err.split("\n")[0]}. Fix: check the --since value and the repo.`);

  const counts = new Map();
  let n = 0;
  // `git log --name-only` lists each changed file once for each commit.
  for (const line of log.out.split("\n")) {
    if (line.startsWith("\0")) {
      n++;
      continue;
    }
    if (line === "" || n === 0) continue;
    const path = unquotePath(line);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  const files = [...counts]
    .filter(([path]) => !LOCKFILES.has(basename(path)) && !SKIP_DIRS.some((d) => path.startsWith(d) || path.includes(`/${d}`)) && isFile(join(root, path)))
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]).out.trim() === "true";
  return { root, commits: n, files, shallow, sinceDate };
}

/** One path as one output line. A path with a control character prints as a JSON string. */
export function printable(path) {
  return /[\u0000-\u001f\u007f]/.test(path) ? JSON.stringify(path) : path;
}

function parseArgs(argv) {
  const opts = { commits: DEFAULT_COMMITS, top: DEFAULT_TOP, since: undefined, dir: undefined, help: false };
  const whole = (flag, v) => {
    if (v === undefined || !/^[1-9]\d*$/.test(v) || Number(v) > MAX_COUNT) throw new ChurnError(EXIT.USAGE, `${flag} needs a whole number from 1 to ${MAX_COUNT}. Fix: write ${flag} 50.`);
    return Number(v);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--commits") opts.commits = whole(a, argv[++i]);
    else if (a === "--top") opts.top = whole(a, argv[++i]);
    else if (a === "--since") {
      const v = argv[++i];
      if (v === undefined || v.trim() === "" || v.startsWith("-")) throw new ChurnError(EXIT.USAGE, "--since needs a date. Fix: write --since 2026-01-01 or --since \"3 months ago\".");
      opts.since = v;
    } else if (a.startsWith("-")) throw new ChurnError(EXIT.USAGE, `unknown option ${a}. Fix: use --commits, --since or --top.`);
    else if (opts.dir !== undefined) throw new ChurnError(EXIT.USAGE, "too many arguments. Fix: pass one folder at most.");
    else opts.dir = a;
  }
  return opts;
}

export function main(argv, out = console.log, err = console.error) {
  let opts;
  let result;
  try {
    opts = parseArgs(argv);
    if (opts.help) {
      out(USAGE);
      return EXIT.OK;
    }
    result = churn(opts.dir, opts);
  } catch (e) {
    if (!(e instanceof ChurnError)) throw e;
    err(`churn: ${e.message}${e.code === EXIT.USAGE ? `\n${USAGE}` : ""}`);
    return e.code;
  }
  const read = result.sinceDate ? ` (git reads it as ${result.sinceDate})` : "";
  const window = opts.since !== undefined ? `since ${opts.since}${read}` : `last ${opts.commits} commits`;
  const shallow = result.shallow ? " The clone is shallow, so older commits are missing." : "";
  if (result.files.length === 0) {
    out(`churn: ${result.commits} commit(s) in the window (${window}), and no changed file still exists.${shallow} Fix: widen the window with --commits or --since, or scan the whole repo.`);
    return EXIT.NOTHING;
  }
  const shown = result.files.slice(0, opts.top);
  out(`Churn over ${result.commits} commit(s), ${window}, merges left out.${shallow} Top ${shown.length} of ${result.files.length} file(s):`);
  const width = String(shown[0].count).length;
  for (const f of shown) out(`${String(f.count).padStart(width)}  ${printable(f.path)}`);
  return EXIT.OK;
}

/** True when this file is the script that node started. Compares real paths, so a symlink to it still runs. */
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
