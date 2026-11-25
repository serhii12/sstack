#!/usr/bin/env node
// land-evidence: pushes the evidence files of the `prove` skill (screenshots, video and text output)
// to the branch `evidence/<task>` of the same repo, and prints a section for the pull request body.
//
// The files never go to an outside host and never into the ticket branch. The script uses git
// plumbing only (hash-object, mktree, commit-tree, push), so the worktree, the index, HEAD, the
// current branch and every local ref stay as they are.
//
// Rules:
//   only-indexed   only files that `.artifacts/<task>/evidence/index.json` names go up: every
//                  `checks[].evidence[].path`, media and text (for example `output/grep.txt`).
//                  A file that the index does not name never goes up. Reviewer replies
//                  (`review.reply.path`) never go up. Media only decides how a file shows:
//                  an image inline (png, jpg, jpeg, gif, webp), any other file as a plain link.
//   plain-path     a named path must be a plain relative path (no `..`, no absolute path, no
//                  backslash, no control character), and each part must be a real folder or file.
//                  A symlink, a symlinked parent folder, a symlinked `.artifacts`, task or `evidence`
//                  folder, or a path that resolves outside the evidence folder is refused.
//   no-dot-git     a path part named `.git` in any letter case is refused.
//   real-file      the file must exist, be a regular file and not be empty.
//   image-magic    a png, jpg, jpeg, gif or webp file must start with the bytes of its type.
//   same-bytes     when the index entry has a `sha256`, the file must hash to it.
//   size           10 MB for each file and 50 MB in total (options can lower the limits).
//   no-force       the push has no force flag. The new commit has the old branch tip as its parent.
//                  A rejected push is a failure. A rerun with the same files makes no commit and no push.
//   safe-markdown  a path is percent-encoded in the URL, and the alt text keeps only [A-Za-z0-9._/ -],
//                  so a file name cannot break a Markdown line, add a link or change the host.
//                  The check text and the reason come from a ticket file. `safeCell` makes them one line,
//                  caps them at 300 characters and escapes \ | [ ] < > ! so they cannot end a table cell,
//                  start a link or an image, or open an HTML tag.
//
// Usage (from the project root):
//   node .claude/skills/land/scripts/land-evidence.mjs <task> [--repo <dir>] [--remote origin] [--dry-run] [--json]
//
// Output on success, in this order:
//   1. `Evidence branch: evidence/<task> at <sha> (<n> file(s)).`
//   2. a blank line and a table, one row per check in index order:
//      `| Acceptance check | Result | Evidence |`, with links to the pinned file URLs. A check with no
//      file shows its reason, or `none`.
//   3. a blank line, then for each image (sorted by path) a caption line `<alt>. Check: <check text>` and
//      the line `![<alt>](<url>)`, then the same for each other media file with `[<alt>](<url>)`.
//      Text files show only in the table.
// With no parseable GitHub-style remote URL (a local path) there are no links. The table cells hold
// `<alt> (commit <sha>)` and the media lines hold `- <alt>: <encoded path> (commit <sha> on branch evidence/<task>)`.
// When the index names no file it prints `No evidence files for <task>.` and exits 0.
// With --json it prints one object: { task, branch, commit, pushed, checks: [{check, status, reason, files}],
// files: [{path, kind, bytes, url, markdown, check}] }. `kind` is image, media or text.
// --dry-run checks everything and prints `DRY-RUN` for the commit. It writes no object and pushes nothing.
//
// Exit codes:
//   0   done, or no evidence file to push
//   2   usage error, or not a git repo
//   40  the index is unreadable, not valid JSON, or has the wrong shape
//   41  a path is refused (outside the folder, symlink, not plain, missing, empty, not a regular file)
//   42  a file changed after it was indexed (sha256 mismatch)
//   43  a file or the total is over the size limit
//   44  no such remote
//   45  a git plumbing command failed
//   46  the push failed or was rejected
// When several problems exist, each prints and the lowest code (40, then 41, 42, 43) is the exit code.
//
// New code. Part of the land skill. Runs `git` with argument arrays only. No shell string is built.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { git, msg, plainPath, quoteName } from "./land-lib.mjs";

const USAGE = "Usage: node .claude/skills/land/scripts/land-evidence.mjs <task> [--repo <dir>] [--remote origin] [--dry-run] [--json]";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export const OTHER_MEDIA_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".svg", ".avif", ".bmp", ".tif", ".tiff"]);

export class UsageError extends Error {}

/** A failure with an exit code. `problems` is a list of { code, what, fix }. */
export class EvidenceFail extends Error {
  constructor(problems) {
    super(problems.map((p) => p.what).join("; "));
    this.problems = problems;
  }
}
const fail = (code, what, fix) => new EvidenceFail([{ code, what, fix }]);

// ---------- pure helpers ----------

/** The task name becomes the ref `refs/heads/evidence/<task>`, so it must be a safe ref part. */
export function validTask(task) {
  return typeof task === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(task) && !task.includes("..") && !task.endsWith(".") && !task.endsWith(".lock");
}

/** The lower-case extension of the last path part, or "". */
export function extOf(p) {
  const base = p.slice(p.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}
export const isImage = (p) => IMAGE_EXT.has(extOf(p));
export const isMedia = (p) => isImage(p) || OTHER_MEDIA_EXT.has(extOf(p));

/** Percent-encode one path part. Also encodes ! ' ( ) * so no character can end a Markdown link. */
export function encodeSegment(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** The URL of one file on the evidence commit. Change the form here only. */
export function mediaUrl({ host, owner, repo, sha, path }) {
  return `https://${host}/${owner}/${repo}/blob/${sha}/${path.split("/").map(encodeSegment).join("/")}?raw=true`;
}

/** Alt text: the path with every character outside [A-Za-z0-9._/ -] replaced by `_`, at most 120 characters. */
export function altText(path) {
  return Array.from(path.replace(/[^A-Za-z0-9._/ -]/gu, "_")).slice(0, 120).join("");
}

/** Split a remote URL into { host, owner, repo }, or null for a local path or an unknown form. Never keeps credentials. */
export function parseRemoteUrl(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  let host;
  let rest;
  let m = /^(?:https?|ssh|git):\/\/(?:[^/@]*@)?([^/@:]+)(?::(\d+))?\/(.+)$/i.exec(u);
  if (m) {
    host = m[1];
    // A port of an https URL belongs to the web address. The port of ssh or git is not a web port.
    if (/^https?:/i.test(u) && m[2]) host += `:${m[2]}`;
    rest = m[3];
  } else {
    m = /^(?:[^/@:\s]+@)?([A-Za-z0-9.-]+):(?!\/)(.+)$/.exec(u);
    if (!m) return null;
    host = m[1];
    rest = m[2];
  }
  const parts = rest.replace(/\/+$/, "").replace(/\.git$/i, "").split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const name = /^[A-Za-z0-9._-]+$/;
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host) || !name.test(owner) || !name.test(repo) || owner === ".." || repo === ".." || owner === "." || repo === ".") return null;
  return { host, owner, repo };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Text from git for a message: credentials in a URL cut out, one line, quoted. */
export const safeText = (s) => quoteName(String(s).replace(/\/\/[^/@\s]*@/g, "//***@"), 200);

// ---------- git ----------

/** Run git with input and extra environment. For mktree and commit-tree. */
function gitRun(cwd, args, { input, env } = {}) {
  const r = spawnSync("git", ["--no-pager", "-c", "core.quotepath=off", ...args], {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", ...env },
  });
  if (r.error) return { ok: false, out: "", err: r.error.message };
  return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "").trim() };
}

const plumbing = (what, r) => fail(45, `git ${what} failed (${safeText(r.err)})`, "run git status in the repo, fix what it reports, then run the script again");

/** All remote-tracking refs as a Map(name -> sha). */
function trackingRefs(cwd) {
  const r = git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/"]);
  return new Map(r.out.split("\n").filter(Boolean).map((l) => l.split(" ")));
}

/** Put the remote-tracking refs back as they were: delete new ones, reset changed ones. */
function restoreTracking(cwd, before) {
  for (const [name, sha] of trackingRefs(cwd)) {
    if (!before.has(name)) git(cwd, ["update-ref", "-d", name]);
    else if (before.get(name) !== sha) git(cwd, ["update-ref", name, before.get(name)]);
  }
}

/** Build nested trees bottom-up with `git mktree -z`. `files` is [{ path, blob }]. Returns the root tree sha. */
function buildTree(cwd, files) {
  const root = { dirs: new Map(), files: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (const d of parts.slice(0, -1)) {
      if (!node.dirs.has(d)) node.dirs.set(d, { dirs: new Map(), files: new Map() });
      node = node.dirs.get(d);
    }
    node.files.set(parts[parts.length - 1], f.blob);
  }
  const write = (node) => {
    let input = "";
    for (const [name, blob] of node.files) input += `100644 blob ${blob}\t${name}\0`;
    for (const [name, child] of node.dirs) input += `040000 tree ${write(child)}\t${name}\0`;
    const r = gitRun(cwd, ["mktree", "-z"], { input });
    if (!r.ok) throw plumbing("mktree", r);
    return r.out.trim();
  };
  return write(root);
}

// ---------- the evidence folder ----------

/** lstat that returns null for a missing path. */
function lstatOrNull(p) {
  try {
    return lstatSync(p);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return null;
    throw e;
  }
}

/**
 * Parse the index. Returns { entries: Map(path -> [sha256]), checks: [{ check, status, reason, files }], first: Map(path -> check text) }.
 * Every path of `checks[].evidence[]` is named. Throws code 40 when the shape is wrong.
 */
export function namedFiles(index) {
  const shape = (what) => fail(40, what, "write the index as described in skills/prove/INDEX-FORMAT.md");
  if (index === null || typeof index !== "object" || Array.isArray(index)) throw shape("the index is not a JSON object");
  if (!Array.isArray(index.checks)) throw shape("the index has no `checks` list");
  const entries = new Map();
  const first = new Map();
  const checks = [];
  index.checks.forEach((c, i) => {
    if (c === null || typeof c !== "object" || Array.isArray(c)) throw shape(`checks[${i}] is not an object`);
    const rec = { check: typeof c.check === "string" ? c.check : "", status: typeof c.status === "string" ? c.status : "", reason: typeof c.reason === "string" ? c.reason : null, files: [] };
    checks.push(rec);
    if (c.evidence === undefined) return;
    if (!Array.isArray(c.evidence)) throw shape(`checks[${i}].evidence is not a list`);
    c.evidence.forEach((e, j) => {
      if (e === null || typeof e !== "object" || Array.isArray(e) || typeof e.path !== "string" || e.path === "") throw shape(`checks[${i}].evidence[${j}] has no \`path\` text`);
      if (e.sha256 !== undefined && typeof e.sha256 !== "string") throw shape(`checks[${i}].evidence[${j}].sha256 is not text`);
      if (!entries.has(e.path)) entries.set(e.path, []);
      if (e.sha256 !== undefined) entries.get(e.path).push(e.sha256.toLowerCase());
      if (!first.has(e.path)) first.set(e.path, rec.check);
      if (!rec.files.includes(e.path)) rec.files.push(e.path);
    });
  });
  return { entries, checks, first };
}

/** True when the bytes start like a file of this image extension. Other extensions are not checked. */
export function magicOk(ext, buf) {
  const at = (bytes, off = 0) => bytes.every((b, i) => buf[off + i] === b);
  if (ext === ".png") return at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === ".jpg" || ext === ".jpeg") return at([0xff, 0xd8, 0xff]);
  if (ext === ".gif") return ["GIF87a", "GIF89a"].includes(buf.toString("latin1", 0, 6));
  if (ext === ".webp") return buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
  return true;
}

/**
 * Clean text from the index (a check text or a reason) for a table cell or a caption. It comes from a
 * ticket file, so it is hostile: one line, no control or hidden character, at most `cap` characters,
 * and each of \ | [ ] < > ! escaped with a backslash. A link start (`://`, `www.`) is broken too.
 */
export function safeCell(text, cap = 300) {
  let s = String(text ?? "").replace(/[\r\n\t\u2028\u2029]/g, " ");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = Array.from(s).slice(0, cap).join("").trim();
  return s.replace(/[\\|[\]<>!]/g, "\\$&").replace(/:\/\//g, "\\://").replace(/www\./gi, (m) => `${m.slice(0, 3)}\\.`);
}

/**
 * Check every named file. Returns { files: [{ path, abs, bytes, buf }] } or throws EvidenceFail with every problem.
 * `files` is empty when the folder, the index or the named files do not exist.
 */
export function collectFiles(root, task, { maxFile = MAX_FILE_BYTES, maxTotal = MAX_TOTAL_BYTES } = {}) {
  // The folders and the index: a missing one means no evidence. A symlink is refused.
  let cur = root;
  for (const part of [".artifacts", task, "evidence"]) {
    cur = join(cur, part);
    const st = lstatOrNull(cur);
    if (!st) return { files: [], checks: [], first: new Map() };
    if (st.isSymbolicLink()) throw fail(41, `the folder ${quoteName(posix.relative(root.split(sep).join("/"), cur.split(sep).join("/")))} is a symlink`, "make it a real folder in the project and copy the files into it");
    if (!st.isDirectory()) throw fail(41, `${quoteName(part)} is not a folder`, "make it a real folder");
  }
  const evDir = realpathSync(cur);
  const indexAbs = join(evDir, "index.json");
  const ist = lstatOrNull(indexAbs);
  if (!ist) return { files: [], checks: [], first: new Map() };
  if (ist.isSymbolicLink()) throw fail(41, "index.json is a symlink", "write the index as a real file in the evidence folder");
  if (!ist.isFile()) throw fail(40, "index.json is not a regular file", "write the index as a real file");
  let index;
  try {
    index = JSON.parse(readFileSync(indexAbs, "utf8"));
  } catch (e) {
    throw fail(40, `index.json cannot be read as JSON (${safeText(e.message)})`, "write valid JSON as described in skills/prove/INDEX-FORMAT.md");
  }
  const { entries, checks, first } = namedFiles(index);

  const problems = [];
  const files = [];
  let total = 0;
  for (const [path, hashes] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const q = quoteName(path);
    const refuse = (what, fix) => problems.push({ code: 41, what, fix });
    if (!plainPath(path) || path !== path.toWellFormed()) {
      refuse(`the path ${q} is not a plain relative path`, "name the file relative to the evidence folder with forward slashes and no `..`");
      continue;
    }
    if (path.split("/").some((part) => /^\.git[. ]*$/i.test(part))) {
      refuse(`the path ${q} has a .git part`, "rename the folder or the file, because a tree with a .git part is not safe");
      continue;
    }
    // Walk the parts. Each part must be a real folder, and the last one a real file.
    let abs = evDir;
    let bad = null;
    const parts = path.split("/");
    for (let i = 0; i < parts.length && !bad; i++) {
      abs = join(abs, parts[i]);
      const st = lstatOrNull(abs);
      if (!st) bad = [`the file ${q} does not exist`, "capture the file again, or fix the path in the index"];
      else if (st.isSymbolicLink()) bad = [`the path ${q} goes through a symlink`, "copy the real file into the evidence folder"];
      else if (i < parts.length - 1 && !st.isDirectory()) bad = [`the path ${q} goes through a file`, "fix the path in the index"];
      else if (i === parts.length - 1 && !st.isFile()) bad = [`${q} is not a regular file`, "name a file, not a folder"];
      else if (i === parts.length - 1 && st.size === 0) bad = [`the file ${q} is empty`, "capture the file again"];
    }
    if (bad) {
      refuse(...bad);
      continue;
    }
    let real;
    try {
      real = realpathSync(abs);
    } catch {
      refuse(`the file ${q} cannot be resolved`, "capture the file again");
      continue;
    }
    if (real !== evDir && !real.startsWith(evDir + sep)) {
      refuse(`the file ${q} resolves outside the evidence folder`, "copy the real file into the evidence folder");
      continue;
    }
    const size = lstatSync(abs).size;
    if (size > maxFile) {
      problems.push({ code: 43, what: `the file ${q} has ${size} bytes, over the limit of ${maxFile}`, fix: "shrink the file, or leave it out of the index" });
      continue;
    }
    const buf = readFileSync(abs);
    if (isImage(path) && !magicOk(extOf(path), buf)) {
      refuse(`${q} is not a ${extOf(path).slice(1)} image`, "capture the file again, or fix the extension and the path in the index");
      continue;
    }
    const digest = sha256(buf);
    if (hashes.some((h) => h !== digest)) {
      problems.push({ code: 42, what: `the file ${q} changed after it was indexed (sha256 does not match)`, fix: "capture the file again, then run `evidence-check fill-hashes <task> --write`" });
      continue;
    }
    total += buf.length;
    files.push({ path, abs, bytes: buf.length });
  }
  if (total > maxTotal) problems.push({ code: 43, what: `the files have ${total} bytes in total, over the limit of ${maxTotal}`, fix: "shrink the files, or leave some out of the index" });
  if (problems.length) throw new EvidenceFail(problems);
  return { files, checks, first };
}

// ---------- the core ----------

/**
 * Validate the evidence of a task and push it to `evidence/<task>`.
 * Returns { task, branch, commit, pushed, files: [...], empty }. Throws UsageError or EvidenceFail.
 * `beforePush` is a test seam: it runs just before the push.
 */
export function publishEvidence({ dir = ".", task, remote = "origin", dryRun = false, maxFile = MAX_FILE_BYTES, maxTotal = MAX_TOTAL_BYTES, beforePush = null } = {}) {
  if (!validTask(task)) throw new UsageError(msg(`the task name ${quoteName(task ?? "")} is not valid`, "use letters, digits, dots, dashes and underscores, start with a letter or digit, and do not end with `.` or `.lock`"));
  const cwd = resolve(dir);
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new UsageError(msg(`not a git repository: ${quoteName(cwd)}`, "run the script inside the repo, or pass --repo <dir>"));
  const root = realpathSync(top.out.trim());
  const branch = `evidence/${task}`;
  const ref = `refs/heads/${branch}`;

  const { files, checks, first } = collectFiles(root, task, { maxFile, maxTotal });
  if (files.length === 0) return { task, branch, commit: null, pushed: false, files: [], checks: [], lines: [], empty: true };

  const url = git(root, ["remote", "get-url", remote]);
  if (!url.ok) throw fail(44, `the remote ${quoteName(remote)} does not exist`, "add it with git remote add, or pass --remote <name>");
  // The URL after `insteadOf` rewriting may be a local path. Then try the URL as configured.
  let parsed = parseRemoteUrl(url.out.trim());
  if (!parsed) {
    const cfg = git(root, ["config", "--get", `remote.${remote}.url`]);
    if (cfg.ok) parsed = parseRemoteUrl(cfg.out.trim());
  }

  let commit = "DRY-RUN";
  let pushed = false;
  if (!dryRun) {
    const blobs = files.map((f) => {
      const r = git(root, ["hash-object", "-w", "--no-filters", "--", f.abs]);
      if (!r.ok) throw plumbing("hash-object", r);
      return { path: f.path, blob: r.out.trim() };
    });
    const tree = buildTree(root, blobs);

    const ls = git(root, ["ls-remote", remote, ref]);
    if (!ls.ok) throw fail(46, `cannot read the branch list of the remote (${safeText(ls.err)})`, "check the network and your access, then run the script again");
    const line = ls.out.split("\n").map((l) => l.split("\t")).find((p) => p[1] === ref);
    const parent = line ? line[0].trim() : null;
    let reuse = false;
    if (parent) {
      // --refmap= keeps git from updating a remote-tracking ref, so no local ref changes.
      const fetch = git(root, ["fetch", "--no-tags", "--no-write-fetch-head", "--refmap=", remote, ref]);
      if (!fetch.ok) throw fail(46, `cannot fetch ${branch} from the remote (${safeText(fetch.err)})`, "check the network and your access, then run the script again");
      const pt = git(root, ["rev-parse", "--verify", `${parent}^{tree}`]);
      if (!pt.ok) throw plumbing("rev-parse", pt);
      reuse = pt.out.trim() === tree;
    }
    if (reuse) {
      commit = parent;
    } else {
      const head = git(root, ["rev-parse", "--short", "--verify", "--quiet", "HEAD"]);
      const short = head.ok && head.out.trim() ? head.out.trim() : "no commit";
      const args = ["-c", "commit.gpgsign=false", "commit-tree", tree];
      if (parent) args.push("-p", parent);
      args.push("-m", `Evidence for ${task} on ${short}`);
      // commit-tree needs an identity. Use a fixed one only when the repo has none.
      const ident = git(root, ["var", "GIT_COMMITTER_IDENT"]);
      const env = ident.ok ? {} : { GIT_AUTHOR_NAME: "sstack", GIT_AUTHOR_EMAIL: "sstack@localhost", GIT_COMMITTER_NAME: "sstack", GIT_COMMITTER_EMAIL: "sstack@localhost" };
      const ct = gitRun(root, args, { env });
      if (!ct.ok) throw plumbing("commit-tree", ct);
      commit = ct.out.trim();
      if (beforePush) beforePush({ root, commit, parent });
      // No force flag and no `+`. A rejected push is a failure.
      // A push also writes a remote-tracking ref in this repo. No local ref may change, so put those refs back.
      const trackBefore = trackingRefs(root);
      const push = git(root, ["push", remote, `${commit}:${ref}`]);
      restoreTracking(root, trackBefore);
      if (!push.ok) throw fail(46, `the push of ${branch} failed or was rejected (${safeText(push.err)})`, "fetch the remote branch and check who changed it, then run the script again. Never force the push");
      pushed = true;
    }
  }

  const out = files.map((f) => {
    const alt = altText(f.path);
    const kind = isImage(f.path) ? "image" : isMedia(f.path) ? "media" : "text";
    const url = parsed ? mediaUrl({ ...parsed, sha: commit, path: f.path }) : null;
    const cell = url ? `[${alt}](${url})` : `${alt} (commit ${commit})`;
    const markdown = !url ? `- ${alt}: ${f.path.split("/").map(encodeSegment).join("/")} (commit ${commit} on branch ${branch})` : kind === "image" ? `!${cell}` : cell;
    return { path: f.path, kind, bytes: f.bytes, url, markdown, check: first.get(f.path) ?? null, alt, cell };
  });
  return { task, branch, commit, pushed, files: out, checks, lines: renderLines({ branch, commit, files: out, checks }), empty: false };
}

/** The text of the pull request section: the headline, the table of checks, then a caption and a line for each media file. */
export function renderLines({ branch, commit, files, checks }) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const lines = [`Evidence branch: ${branch} at ${commit} (${files.length} file(s)).`, "", "| Acceptance check | Result | Evidence |", "| --- | --- | --- |"];
  for (const c of checks) {
    const cell = c.files.length ? c.files.map((p) => byPath.get(p).cell).join(", ") : safeCell(c.reason) || "none";
    lines.push(`| ${safeCell(c.check) || "(no text)"} | ${safeCell(c.status) || "unknown"} | ${cell} |`);
  }
  const shown = [...files.filter((f) => f.kind === "image"), ...files.filter((f) => f.kind === "media")];
  if (shown.length) lines.push("");
  for (const f of shown) lines.push(`${f.alt}. Check: ${safeCell(f.check) || "(no text)"}`, f.markdown);
  return lines;
}

// ---------- command line ----------

function parseArgs(argv) {
  const o = { remote: "origin" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) throw new UsageError(msg(`${a} needs a value`, USAGE));
      return v;
    };
    if (a === "--repo") o.repo = val();
    else if (a === "--remote") o.remote = val();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("-")) throw new UsageError(msg(`unknown argument ${quoteName(a)}`, "use only the arguments in the usage line"));
    else rest.push(a);
  }
  if (!o.help) {
    if (rest.length !== 1) throw new UsageError(msg("the script needs exactly one task name", USAGE));
    o.task = rest[0];
  }
  return o;
}

export function main(argv, { out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n"), maxFile = MAX_FILE_BYTES, maxTotal = MAX_TOTAL_BYTES, beforePush = null } = {}) {
  try {
    const o = parseArgs(argv);
    if (o.help) {
      out(USAGE);
      return 0;
    }
    const r = publishEvidence({ dir: o.repo ?? ".", task: o.task, remote: o.remote, dryRun: !!o.dryRun, maxFile, maxTotal, beforePush });
    if (o.json) {
      const files = r.files.map(({ path, kind, bytes, url, markdown, check }) => ({ path, kind, bytes, url, markdown, check }));
      out(JSON.stringify({ task: r.task, branch: r.branch, commit: r.commit, pushed: r.pushed, checks: r.checks, files }, null, 2));
    } else if (r.empty) {
      out(`No evidence files for ${r.task}.`);
    } else {
      for (const l of r.lines) out(l);
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err(`land-evidence: FAIL 2: ${e.message}`);
      return 2;
    }
    if (e instanceof EvidenceFail) {
      for (const p of e.problems) err(`land-evidence: FAIL ${p.code}: ${msg(p.what, p.fix)}`);
      return Math.min(...e.problems.map((p) => p.code));
    }
    throw e;
  }
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
