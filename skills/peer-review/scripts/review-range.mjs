#!/usr/bin/env node
// review-range: prints the diff a reviewer should read for one task.
//
// It covers everything the author has done since the base: commits, staged
// changes, unstaged changes and new (untracked) files. A review that diffs only
// `<base>...HEAD` cannot see uncommitted work. This script exists to close that gap.
//
// Idea taken from mattpocock/skills skills/engineering/code-review/SKILL.md (MIT,
// Matt Pocock): pin the base once, check it resolves, and fail early on an empty
// diff. The script itself is new code. See NOTICE.
//
// Base: `--base <ref>`, else the first of `origin/main`, `main`, `master` that
// exists and shares history with HEAD. The diff starts at the merge base of that
// ref and HEAD, so changes that landed on the base after you branched stay out.
// Files under `.artifacts/` are left out. They hold review notes, not code.
//
// Usage: node .claude/skills/peer-review/scripts/review-range.mjs [--base <ref>] [--stat] [--json] [repo]
//   --stat  print only the header (the file list), without the diff
//   --json  print machine-readable output
// Exit 0 a diff was printed.
// Exit 3 nothing to review. An empty review must fail loudly.
// Exit 2 usage error, not a git repo, no commits, or no base found.
// Runs `git` with argument arrays only. No shell string is ever built.

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = "Usage: node .claude/skills/peer-review/scripts/review-range.mjs [--base <ref>] [--stat] [--json] [repo]";
const DEFAULT_BASES = ["origin/main", "main", "master"];
const EXCLUDE = ":(exclude).artifacts";

export class UsageError extends Error {}
export class NothingToReview extends Error {}

function git(cwd, args) {
  const r = spawnSync("git", ["--no-pager", "-c", "core.quotepath=off", "-c", "color.ui=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.error) throw new UsageError(`cannot run git (${r.error.message}). Fix: install git and put it on PATH.`);
  return { status: r.status, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

const names = (out) => out.split("\0").filter((s) => s !== "");

function listFiles(top, extra) {
  const r = git(top, ["diff", "--name-only", "-z", "--no-renames", ...extra, "--", ".", EXCLUDE]);
  if (r.status !== 0) throw new UsageError(`git diff failed (${r.err}). Fix: run \`git status\` in the repo and fix what it reports.`);
  return names(r.out);
}

function findBase(top, wanted) {
  const candidates = wanted ? [wanted] : DEFAULT_BASES;
  for (const c of candidates) {
    const ok = git(top, ["rev-parse", "--verify", "--quiet", `${c}^{commit}`]);
    if (ok.status !== 0) continue;
    const mb = git(top, ["merge-base", c, "HEAD"]);
    if (mb.status !== 0 || !mb.out.trim()) continue;
    return { ref: c, mergeBase: mb.out.trim() };
  }
  if (wanted) {
    throw new UsageError(`base ref \`${wanted}\` does not resolve to a commit that shares history with HEAD. Fix: pass a branch, tag or commit that exists, for example \`--base main\`.`);
  }
  throw new UsageError(`no base found (tried ${DEFAULT_BASES.join(", ")}). Fix: pass one with \`--base <ref>\`.`);
}

/** Collect what to review. Throws UsageError or NothingToReview. */
export function collect(repoArg, baseArg, { withDiff = true } = {}) {
  const dir = resolve(repoArg ?? ".");
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) {
    throw new UsageError(`not a git repository: ${dir}. Fix: pass a path inside a git repo, or run from one.`);
  }
  const root = top.out.trim();
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head.status !== 0) throw new UsageError("this repo has no commits yet, so there is no base. Fix: make a first commit, then run again.");
  const headSha = head.out.trim();
  const base = findBase(root, baseArg);

  const committed = listFiles(root, [base.mergeBase, "HEAD"]);
  const staged = listFiles(root, ["--cached"]);
  const unstaged = listFiles(root, []);
  // Net change of tracked files: merge base against the working tree. A file that was
  // staged and then reverted, or committed and then undone, is not in this list.
  const changed = listFiles(root, [base.mergeBase]);
  const u = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (u.status !== 0) throw new UsageError(`git ls-files failed (${u.err}). Fix: run \`git status\` in the repo.`);
  const untracked = names(u.out).filter((p) => p !== ".artifacts" && !p.startsWith(".artifacts/"));

  const result = { repo: root, base: { ref: base.ref, mergeBase: base.mergeBase }, head: headSha, committed, staged, unstaged, untracked };
  if (changed.length + untracked.length === 0) {
    throw Object.assign(new NothingToReview(`nothing to review: no net change since ${base.ref} (merge base ${base.mergeBase.slice(0, 7)}) in commits, the index or the working tree, and no untracked files. Fix: make the change first, or pass an older \`--base <ref>\`.`), { result });
  }

  if (withDiff) {
    // Tracked files: the merge base against the working tree covers commits, staged and unstaged work in one diff.
    const d = git(root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", base.mergeBase, "--", ".", EXCLUDE]);
    if (d.status !== 0) throw new UsageError(`git diff failed (${d.err}). Fix: run \`git status\` in the repo and fix what it reports.`);
    let diff = d.out;
    for (const f of untracked) {
      if (f.endsWith("/")) continue; // a nested repo: git lists the folder, not its files
      const n = git(root, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", "--", "/dev/null", f]);
      if (n.status !== 0 && n.status !== 1) throw new UsageError(`git diff failed on untracked file \`${f}\` (${n.err}). Fix: check the file can be read.`);
      diff += n.out;
    }
    result.diff = diff;
  }
  return result;
}

export function header(r) {
  const short = (s) => s.slice(0, 7);
  const lines = [
    `# review-range: base ${r.base.ref} (merge base ${short(r.base.mergeBase)}), head ${short(r.head)}, plus the working tree`,
    "# Included, with the files in each group:",
  ];
  for (const [label, list] of [["committed since the base", r.committed], ["staged", r.staged], ["unstaged", r.unstaged], ["untracked", r.untracked]]) {
    lines.push(`#   ${label}: ${list.length}`);
    for (const f of list) lines.push(`#     ${f}`);
  }
  lines.push("# Left out: .artifacts/");
  return lines.join("\n") + "\n";
}

function parseArgs(argv) {
  const o = { json: false, stat: false, base: undefined, repo: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--stat") o.stat = true;
    else if (a === "--base") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-") || v === "") throw new UsageError("`--base` needs a ref. Fix: write `--base main`.");
      o.base = v;
    } else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}. ${USAGE}`);
    else if (o.repo === undefined) o.repo = a;
    else throw new UsageError(`too many arguments. ${USAGE}`);
  }
  return o;
}

export function main(argv, out = process.stdout, err = process.stderr) {
  let o;
  try {
    o = parseArgs(argv);
    const r = collect(o.repo, o.base, { withDiff: !o.stat });
    if (o.json) out.write(JSON.stringify({ ok: true, ...r }, null, 2) + "\n");
    else out.write(header(r) + (o.stat ? "" : "\n" + r.diff));
    return 0;
  } catch (e) {
    if (e instanceof NothingToReview) {
      if (o?.json) out.write(JSON.stringify({ ok: false, reason: "nothing-to-review", ...e.result }, null, 2) + "\n");
      err.write(`review-range  ${e.message.replace(/\. Fix: /, "  Fix: ")}\n`);
      return 3;
    }
    if (e instanceof UsageError) {
      // Messages carry "<what>. Fix: <how>". Print them as `what  why  Fix: ...`.
      err.write(`review-range  ${e.message.replace(/\. Fix: /, "  Fix: ")}\n`);
      return 2;
    }
    err.write(`review-range  unexpected error: ${e.message}  Fix: report this with the command you ran.\n`);
    return 2;
  }
}

// Compare real paths: Node resolves symlinks in import.meta.url, so a symlinked script path would
// otherwise match nothing and the script would exit 0 without output.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv.slice(2));
}
