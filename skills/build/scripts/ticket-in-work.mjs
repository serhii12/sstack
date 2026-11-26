#!/usr/bin/env node
// ticket-in-work: checks that no other checkout or branch already builds one ticket.
//
// Two sessions can run `/build` for the same ticket at the same time, in two checkouts of one
// repo or on two machines. The `build` skill runs this check before it makes or keeps a branch.
//
// The skill folder ships to projects. So this file runs from the project root as
//   node .claude/skills/build/scripts/ticket-in-work.mjs <ticket file | task key>
// In the stack repo, the path is skills/build/scripts/ticket-in-work.mjs.
//
// The task key names the ticket in branch and folder names:
//   - A ticket file gives the title part of its name: `01-slugify.md` gives `slugify`.
//   - Any other argument is the key itself, for example `issue-42`. It uses lowercase letters,
//     digits and hyphens.
// A branch or a worktree folder is work on the ticket when its last path part is the key, or the
// key plus a suffix in which each hyphen-separated part has a digit. The suffix can use capitals.
// With the key `slugify`, `agent/slugify-0a1`, `agent/slugify-0A1` and `agent/slugify-2026-11-25`
// match. `agent/slugify-docs` and `agent/slugify-urls-0a1` do not match.
//
// The check reads every worktree, every local branch and every remote branch that git knows.
// Run `git fetch origin` first. Then the check also sees a branch that another machine pushed.
// It cannot see a branch that another machine did not push.
//
// The current checkout is not other work. If its branch matches the key, the session already
// builds the ticket here. The remote copies of that branch are not other work either.
// The current checkout is found by its path, else by its branch. In a container the path that
// git lists for a linked checkout can be the host path, while the session sees a mount path.
// The current checkout is on the ticket when its branch matches the key. A linked checkout is on the
// ticket also when its folder name matches the key, because a tool can name the folder and not the
// branch. The folder name of the main checkout does not count.
//
// Exit codes:
//   0  no other work on the ticket
//   1  the ticket is already in work in another worktree or on another branch
//   2  usage error
//   3  git failed, for example because the folder is not in a git repo

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/build/scripts/ticket-in-work.mjs <ticket file | task key>";
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EXIT = { FREE: 0, IN_WORK: 1, USAGE: 2, GIT: 3 };

/** The task key for a ticket file path or a key. Returns null when the argument gives no valid key. */
export function taskKey(arg) {
  if (typeof arg !== "string" || arg === "") return null;
  let key = arg;
  if (arg.toLowerCase().endsWith(".md")) {
    key = basename(arg).slice(0, -3).replace(/^\d+-/, "").toLowerCase();
  }
  return KEY.test(key) ? key : null;
}

/** True when the last path part of a branch or folder name is the key, or the key plus suffix parts that each have a digit. */
export function matchesKey(name, key) {
  const last = String(name).split("/").pop();
  if (last === key) return true;
  if (!last.startsWith(`${key}-`)) return false;
  const rest = last.slice(key.length + 1);
  return rest.split("-").every((part) => /^[A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(part));
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) return { ok: false, out: "", err: r.error.message };
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** Parse `git worktree list --porcelain` into [{ path, branch }]. `branch` is null for a detached HEAD. */
export function parseWorktrees(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice("worktree ".length), branch: null, bare: false };
      out.push(cur);
    } else if (cur && line.startsWith("branch refs/heads/")) {
      cur.branch = line.slice("branch refs/heads/".length);
    } else if (cur && line === "bare") {
      cur.bare = true;
    }
  }
  return out.filter((w) => !w.bare);
}

/**
 * Look for other work on the ticket from the repo at `cwd`.
 * Returns { code, messages, checked }. `messages` use the form "<what failed>. <why>. Fix: <step>."
 */
export function checkInWork(key, cwd = process.cwd()) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    return { code: EXIT.GIT, messages: [`Cannot check the ticket ${key}. Git failed in ${cwd} (${top.err || "no output"}). Fix: run \`node .claude/skills/build/scripts/ticket-in-work.mjs\` from the project root.`], checked: 0 };
  }
  const here = real(top.out.trim());
  const wt = git(cwd, ["worktree", "list", "--porcelain"]);
  const refs = git(cwd, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"]);
  if (!wt.ok || !refs.ok) {
    return { code: EXIT.GIT, messages: [`Cannot check the ticket ${key}. Git could not list the worktrees or branches (${wt.err || refs.err}). Fix: run \`git worktree list\` and \`git branch -a\` to see the problem.`], checked: 0 };
  }
  const worktrees = parseWorktrees(wt.out);
  const head = git(cwd, ["branch", "--show-current"]);
  const ownBranch = (head.ok && head.out.trim()) || null;
  // git checks out one branch in one place only, so the entry with our branch is this checkout.
  const current = worktrees.find((w) => real(w.path) === here) ?? worktrees.find((w) => ownBranch !== null && w.branch === ownBranch);

  const messages = [];
  const reported = new Set();
  for (const w of worktrees) {
    if (w === current) continue;
    if ((w.branch && matchesKey(w.branch, key)) || matchesKey(basename(w.path), key)) {
      if (w.branch) reported.add(w.branch);
      const on = w.branch ? `has branch ${w.branch}` : "has a detached HEAD";
      messages.push(`Ticket ${key} is already in work. Worktree ${w.path} ${on}. Fix: continue in \`${w.path}\`, or ask its owner before you run \`git worktree remove ${w.path}\`.`);
    }
  }
  const names = refs.out.split(/\r?\n/).filter(Boolean);
  for (const ref of names) {
    if (ref.startsWith("refs/heads/")) {
      const b = ref.slice("refs/heads/".length);
      if (b === ownBranch || reported.has(b) || !matchesKey(b, key)) continue;
      messages.push(`Ticket ${key} is already in work. Local branch ${b} exists. Fix: ask its owner, then switch a clean checkout to \`${b}\` to finish it, or delete it with \`git branch -D ${b}\`.`);
    } else if (ref.startsWith("refs/remotes/")) {
      const rest = ref.slice("refs/remotes/".length);
      const slash = rest.indexOf("/");
      if (slash === -1) continue;
      const remote = rest.slice(0, slash);
      const b = rest.slice(slash + 1);
      if (b === "HEAD" || b === ownBranch || !matchesKey(b, key)) continue;
      messages.push(`Ticket ${key} is already in work. Branch ${b} exists on the remote ${remote}, so another session or machine can be building it. Fix: ask its owner, then switch a clean checkout to \`${b}\` to finish it.`);
    }
  }
  const checked = worktrees.length + names.length;
  // A tool can name the folder of a linked checkout for the ticket, but not the branch: `claude --worktree
  // slugify` gives the branch worktree-slugify. The main checkout (the first entry) never counts by its folder.
  const ownFolder = ownBranch !== null && current !== undefined && worktrees.indexOf(current) > 0 && matchesKey(basename(current.path), key) ? basename(current.path) : null;
  return { code: messages.length > 0 ? EXIT.IN_WORK : EXIT.FREE, messages, checked, ownBranch: ownBranch && matchesKey(ownBranch, key) ? ownBranch : null, ownFolder: ownBranch && !matchesKey(ownBranch, key) ? ownFolder : null, branch: ownBranch };
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
    console.log(USAGE);
    return EXIT.FREE;
  }
  const key = argv.length === 1 && !argv[0].startsWith("-") ? taskKey(argv[0]) : null;
  if (key === null) {
    console.error(`Usage error: this script needs one ticket file or one task key of lowercase letters, digits and hyphens. Fix: run it as shown below.\n${USAGE}`);
    return EXIT.USAGE;
  }
  const r = checkInWork(key);
  for (const m of r.messages) console.error(m);
  if (r.code === EXIT.FREE) {
    console.log(`No other work on ticket ${key}. Checked ${r.checked} worktree(s) and branch(es).`);
    if (r.ownBranch) console.log(`This checkout is on ${r.ownBranch}, which matches the ticket. Keep using it.`);
    else if (r.ownFolder) console.log(`This checkout is on ${r.branch}. Its folder name ${r.ownFolder} matches the ticket. Keep using it.`);
  }
  return r.code;
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
