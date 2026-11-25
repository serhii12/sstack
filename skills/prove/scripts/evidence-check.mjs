#!/usr/bin/env node
// evidence-check: the fence of the `prove` skill. It checks the evidence index of one task.
//
// It reads `.artifacts/<task>/evidence/index.json` and the ticket file that holds the
// `## Acceptance checks` list. It opens every evidence file that the index names.
//
// WHAT IT CHECKS
//   - The shape of the index (schema 1).
//   - Every acceptance check of the ticket has exactly one entry. No entry is unknown.
//   - Every entry is `pass`, `fail` or `untested`. `untested` has a reason.
//   - `pass` and `fail` name at least one evidence file.
//   - The evidence folder and the index are inside the project. A link that leaves it fails.
//   - Every named file exists inside the evidence folder (no `..`, no absolute path, no
//     symlink that leaves the folder), is not empty, and has the sha256 that the index lists.
//     A file that holds only white space counts as empty.
//   - An image or video file starts with the magic bytes of its extension (PNG, JPEG, WebP,
//     GIF, MP4, WebM). A PNG has a real IHDR header and ends with IEND. A text file renamed
//     to .png fails. A declared viewport must fit the real width of the image.
//   - A visual check marked `pass` has a reviewer verdict of `matches`, a saved reviewer reply
//     that holds the same verdict and names every reviewed image, and screenshots at a phone
//     width and a desktop width (or a written waiver).
//   - At level `red-then-green` every `pass` has a `before` file and an `after` file.
//   - The index names a commit, and that commit is HEAD or an ancestor of HEAD.
//     `--strict-head` requires HEAD, and no uncommitted change outside `.artifacts/`.
//
// WHAT IT CANNOT PROVE
//   It cannot prove that an image really shows what the agent says it shows. It cannot prove
//   that the reviewer reply came from a fresh reviewer, or that a `before` capture really
//   failed. The agent writes the index and the reply file. The script only makes a false
//   claim costly: the files must exist, match their hashes, look like the media they claim
//   to be, and agree with each other. The fresh reviewer, and then a human who opens the
//   images, are the only checks on what an image shows.
//
// Usage:
//   node .claude/skills/prove/scripts/evidence-check.mjs <task> [--repo <dir>] [--ticket <file>]
//        [--strict-head] [--require-fresh-reviewer] [--json]
//   node .claude/skills/prove/scripts/evidence-check.mjs fill-hashes <task> [--repo <dir>] [--write]
//   (`hash` is an old name of `fill-hashes`. A guard that parses shell text can read `hash` as the
//   shell builtin and refuse the command, so the documented name is `fill-hashes`.)
//   node .claude/skills/prove/scripts/evidence-check.mjs report <task> [--repo <dir>]
//
// Exit 0 the evidence is sound and every check is `pass`.
// Exit 1 the evidence has problems. Each problem prints as `path  rule  what is wrong  Fix: ...`.
// Exit 2 usage error, or a file that cannot be read (no index, bad JSON, not a git repo).
// Exit 3 the evidence is sound, but at least one check is `fail` or `untested`.
// A later merge check can tell "sound and complete" (0) from "sound, but not all proven" (3).
//
// Idea taken from rstack evidence-driven-testing/scripts/evidence.py (Michael Shimeles, no
// license file): the three results passed, failed and untested, the commit stamp, and the
// report counts. Idea taken from kcd-skills skills/autopilot/scripts/audit-report.mjs (MIT,
// Kent C. Dodds): a score needs evidence, and a "not known" needs a reason. Unlike both
// sources, this script opens the files. The before and after table of `report` takes its idea
// from rstack before-and-after/SKILL.md (PolyForm Shield 1.0.0, James Clements). The code is new.
// See NOTICE.
// Runs `git` with argument arrays only. No shell string is ever built.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE =
  "Usage: node .claude/skills/prove/scripts/evidence-check.mjs <task> [--repo <dir>] [--ticket <file>] [--strict-head] [--require-fresh-reviewer] [--json]\n" +
  "       node .claude/skills/prove/scripts/evidence-check.mjs fill-hashes <task> [--repo <dir>] [--write]\n" +
  "       node .claude/skills/prove/scripts/evidence-check.mjs report <task> [--repo <dir>]";

export const STATUSES = ["pass", "fail", "untested"];
export const LEVELS = ["cite", "content", "behavior", "red-then-green", "checks"];
export const VERDICTS = ["matches", "does-not-match", "cannot-tell"];
export const REVIEWERS = ["fresh-subagent", "same-context"];
const PHASES = ["before", "after", "single"];
const SCHEMES = ["light", "dark"];
const PHONE_MAX_WIDTH = 480;
const DESKTOP_MIN_WIDTH = 1024;

export class UsageError extends Error {}

// ---------- media ----------

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);

/** Magic-byte test per extension. Each entry: [label, test(buf)]. */
const MEDIA = {
  ".png": ["PNG", (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ".jpg": ["JPEG", (b) => startsWith(b, [0xff, 0xd8, 0xff])],
  ".jpeg": ["JPEG", (b) => startsWith(b, [0xff, 0xd8, 0xff])],
  ".webp": ["WebP", (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP"],
  ".gif": ["GIF", (b) => ["GIF87a", "GIF89a"].includes(b.toString("latin1", 0, 6))],
  ".mp4": ["MP4", (b) => b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp"],
  ".webm": ["WebM", (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])],
};
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".webm"]);
// Media extensions that the reviewer step cannot read. Name them so the agent converts the file.
const UNSUPPORTED_MEDIA = new Set([".mov", ".avi", ".mkv", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif", ".wmv", ".flv"]);

const PNG_IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

/** The pixel width of an image, read from its header. Returns null when the header cannot be read. */
export function imageWidth(buf, ext) {
  try {
    if (ext === ".png") return buf.length >= 24 && buf.toString("latin1", 12, 16) === "IHDR" ? buf.readUInt32BE(16) : null;
    if (ext === ".gif") return buf.length >= 10 ? buf.readUInt16LE(6) : null;
    if (ext === ".webp") {
      const kind = buf.toString("latin1", 12, 16);
      if (kind === "VP8X" && buf.length >= 30) return 1 + buf.readUIntLE(24, 3);
      if (kind === "VP8 " && buf.length >= 30) return buf.readUInt16LE(26) & 0x3fff;
      if (kind === "VP8L" && buf.length >= 25) return 1 + (((buf[22] & 0x3f) << 8) | buf[21]);
      return null;
    }
    if (ext === ".jpg" || ext === ".jpeg") {
      // Walk the JPEG segments to the first start-of-frame (SOF) marker. C4, C8 and CC are not SOF.
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const m = buf[i + 1];
        if (m === 0xff) {
          i++;
          continue;
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return buf.readUInt16BE(i + 7);
        if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
          i += 2;
          continue;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

const extOf = (p) => extname(p).toLowerCase();
export const isImage = (p) => IMAGE_EXT.has(extOf(p));
export const isVideo = (p) => VIDEO_EXT.has(extOf(p));

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** True when the real path `p` is the folder `dir` or inside it. Both paths are real paths. */
const inside = (dir, p) => p === dir || p.startsWith(dir + sep);

// ---------- git ----------

function git(cwd, args) {
  const r = spawnSync("git", ["--no-pager", "-c", "core.quotepath=off", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.error) throw new UsageError(`cannot run git (${r.error.message}). Fix: install git and put it on PATH.`);
  return { status: r.status, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

// ---------- the ticket ----------

/** Read the `## Acceptance checks` list. Returns the check texts in order. */
export function parseAcceptanceChecks(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Acceptance checks\s*$/i.test(l));
  if (start === -1) return null;
  const items = [];
  let fence = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^##\s/.test(l)) break;
    const m = /^\s*[-*]\s+\[[ xX]\]\s+(.*\S)\s*$/.exec(l);
    if (m) items.push(m[1]);
    // An indented line, a nested bullet too, belongs to the check above it. tickets-lint.mjs accepts
    // nested bullets, so they are part of the check (e2e run 1 break 7: 8 nested parts were dropped).
    else if (items.length > 0 && /^\s{2,}\S/.test(l)) items[items.length - 1] += " " + l.trim();
  }
  return items.map(norm);
}

// ---------- paths ----------

/**
 * Resolve an evidence path. Returns { abs } or { rule, msg, fix }.
 * The path must be relative, must not climb out, and must not leave the folder through a symlink.
 */
function resolveEvidence(evDirReal, rel) {
  if (!isText(rel)) return { rule: "path", msg: "the path is empty or not a string", fix: "write the path of the file relative to the evidence folder, for example `screenshots/after-375.png`." };
  if (rel.includes("\0")) return { rule: "path", msg: "the path holds a NUL byte", fix: "write a plain relative path." };
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith("/") || rel.startsWith("\\")) {
    return { rule: "path", msg: `\`${rel}\` is an absolute path`, fix: "use a path relative to the evidence folder." };
  }
  if (rel.includes("\\")) return { rule: "path", msg: `\`${rel}\` uses a backslash`, fix: "use forward slashes." };
  const n = posix.normalize(rel);
  if (n === ".." || n.startsWith("../") || n === ".") {
    return { rule: "path", msg: `\`${rel}\` leaves the evidence folder`, fix: "keep every evidence file inside `.artifacts/<task>/evidence/`. Copy the file there." };
  }
  const full = join(evDirReal, ...n.split("/"));
  let st;
  try {
    st = lstatSync(full);
  } catch {
    return { rule: "file-missing", msg: `\`${rel}\` does not exist`, fix: "capture the file again, or fix the path in the index." };
  }
  let real;
  try {
    real = realpathSync(full);
  } catch {
    return { rule: "file-missing", msg: `\`${rel}\` is a broken link`, fix: "replace the link with the real file." };
  }
  if (real !== evDirReal && !real.startsWith(evDirReal + sep)) {
    return { rule: "path", msg: `\`${rel}\` is a link that leads outside the evidence folder (${st.isSymbolicLink() ? "symlink" : "path"})`, fix: "copy the real file into the evidence folder." };
  }
  if (!statSync(real).isFile()) return { rule: "path", msg: `\`${rel}\` is not a regular file`, fix: "name a file, not a folder." };
  return { abs: real, rel: n };
}

// ---------- checking ----------

/** Run every check. Returns { problems, notProven, warnings, summary, index, checks }. Throws UsageError. */
export function check({ repo, task, ticket, strictHead = false, requireFresh = false }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(task ?? "")) {
    throw new UsageError(`task name \`${task ?? ""}\` is not valid. Use letters, numbers, dots, dashes and underscores. ${USAGE}`);
  }
  const top = git(resolve(repo ?? "."), ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) throw new UsageError(`not a git repository: ${resolve(repo ?? ".")}. Fix: run from the project root or pass \`--repo <dir>\`.`);
  const root = realpathSync(top.out.trim());
  const evDir = join(root, ".artifacts", task, "evidence");
  const indexRel = `.artifacts/${task}/evidence/index.json`;

  const problems = [];
  const add = (path, rule, msg, fix) => problems.push({ path, rule, message: msg, fix });
  const warnings = [];
  const summary = { pass: 0, fail: 0, untested: 0 };
  const checks = [];
  let index = null;

  let evReal;
  try {
    evReal = realpathSync(evDir);
  } catch {
    throw new UsageError(`${indexRel} does not exist. Fix: gather the evidence first, then write the index. See skills/prove/INDEX-FORMAT.md.`);
  }
  // The evidence must stay in the project. A linked `.artifacts/<task>` or `evidence` folder
  // can put it on a shared or public disk, where nobody checks who reads it.
  if (!inside(root, evReal)) {
    add(`.artifacts/${task}/evidence`, "path", "the evidence folder is a link that leads outside the project", "make `.artifacts/<task>/evidence/` a real folder in the project, and copy the files into it.");
    return finish();
  }
  const indexAbs = join(evReal, "index.json");
  try {
    if (!inside(evReal, realpathSync(indexAbs))) {
      add(indexRel, "path", "the index is a link that leads outside the evidence folder", "write the index as a real file in the evidence folder.");
      return finish();
    }
  } catch {
    // A missing index is reported below, with the read error.
  }
  let raw;
  try {
    raw = readFileSync(indexAbs, "utf8");
  } catch (e) {
    throw new UsageError(`cannot read ${indexRel} (${e.code ?? e.message}). Fix: write the index file.`);
  }
  try {
    index = JSON.parse(raw);
  } catch (e) {
    throw new UsageError(`${indexRel} is not valid JSON (${e.message}). Fix: correct the JSON.`);
  }

  // --- schema of the top level ---
  if (!isObj(index)) {
    add(indexRel, "schema", "the index is not a JSON object", "write an object with the fields in INDEX-FORMAT.md.");
    return finish();
  }
  if (index.schema !== 1) add(indexRel, "schema", `\`schema\` must be 1 (got ${JSON.stringify(index.schema)})`, "set `\"schema\": 1`.");
  if (index.task !== task) add(indexRel, "schema", `\`task\` is ${JSON.stringify(index.task)} but the folder is \`${task}\``, `set \`"task": "${task}"\`.`);
  if (!LEVELS.includes(index.level)) add(indexRel, "schema", `\`level\` must be one of ${LEVELS.join(", ")} (got ${JSON.stringify(index.level)})`, "copy the level from the handoff note of `/start`.");
  if (!isText(index.gathered_at) || Number.isNaN(Date.parse(index.gathered_at))) add(indexRel, "schema", "`gathered_at` must be an ISO date and time", "write `new Date().toISOString()` output.");
  if (!isText(index.environment)) add(indexRel, "schema", "`environment` is missing", "say where the evidence ran, for example `macOS, Chrome headless 158, http://localhost:4173`.");
  if (!isText(index.ticket)) add(indexRel, "schema", "`ticket` is missing", "name the file that holds the `## Acceptance checks` list, relative to the project root.");
  if (!Array.isArray(index.checks)) {
    add(indexRel, "schema", "`checks` must be a list", "write one entry for each acceptance check.");
    return finish();
  }

  // --- commit ---
  checkCommit();

  // --- the ticket ---
  const ticketRel = ticket ?? index.ticket;
  let expected = null;
  if (isText(ticketRel)) {
    const t = resolveInRepo(root, ticketRel);
    if (t.error) add(indexRel, "ticket", t.error, "name a ticket file inside the project.");
    else {
      let text = null;
      try {
        text = readFileSync(t.abs, "utf8");
      } catch {
        add(indexRel, "ticket", `the ticket file \`${ticketRel}\` cannot be read`, "fix the `ticket` path, or save the issue text to `.artifacts/<task>/ticket.md`.");
      }
      if (text !== null) {
        expected = parseAcceptanceChecks(text);
        if (expected === null) add(ticketRel, "ticket", "the file has no `## Acceptance checks` heading", "add the heading and a `- [ ]` list. See skills/tickets/TICKET-FORMAT.md.");
        else if (expected.length === 0) add(ticketRel, "ticket", "the `## Acceptance checks` list has no `- [ ]` items", "add at least one check.");
        else {
          const dup = expected.filter((c, i) => expected.indexOf(c) !== i);
          if (dup.length) add(ticketRel, "ticket", `two checks have the same text: "${dup[0]}"`, "make each check text unique, so that one entry matches one check.");
        }
      }
    }
  }

  // --- entries ---
  const byCheck = new Map();
  index.checks.forEach((e, i) => {
    const ep = `${indexRel}#checks[${i}]`;
    if (!isObj(e)) return add(ep, "schema", "the entry is not an object", "write an object with `check`, `status` and `evidence`.");
    if (!isText(e.check)) return add(ep, "schema", "the entry has no `check` text", "copy the text of the acceptance check word for word.");
    const key = norm(e.check);
    if (byCheck.has(key)) add(ep, "check-duplicate", `the check "${key}" has more than one entry`, "keep one entry for each acceptance check.");
    else byCheck.set(key, e);
    if (expected && !expected.includes(key)) {
      add(ep, "check-unknown", `the check "${key}" is not in \`${ticketRel}\``, "copy the check text from the ticket word for word, or remove the entry.");
    }
    if (!STATUSES.includes(e.status)) {
      add(ep, "status", `\`status\` must be one of ${STATUSES.join(", ")} (got ${JSON.stringify(e.status)})`, "use `pass`, `fail` or `untested`.");
      return;
    }
    summary[e.status]++;
    checks.push({ check: key, status: e.status, reason: e.reason });
    checkEntry(e, ep, key);
  });
  if (expected) {
    for (const c of expected) {
      if (!byCheck.has(c)) add(indexRel, "check-missing", `the ticket check "${c}" has no entry`, "add an entry for it. Mark it `untested` with a reason when you could not test it. Never leave it out.");
    }
  }
  return finish();

  function finish() {
    const notProven = problems.length === 0 ? checks.filter((c) => c.status !== "pass") : [];
    return { problems, notProven, warnings, summary, index, checks, root, indexRel };
  }

  function resolveInRepo(rootDir, rel) {
    if (isAbsolute(rel) || rel.includes("\0")) return { error: `the ticket path \`${rel}\` is absolute` };
    const n = posix.normalize(rel.replace(/\\/g, "/"));
    if (n === ".." || n.startsWith("../")) return { error: `the ticket path \`${rel}\` leaves the project` };
    const abs = join(rootDir, ...n.split("/"));
    try {
      const real = realpathSync(abs);
      if (real !== rootDir && !real.startsWith(rootDir + sep)) return { error: `the ticket path \`${rel}\` leads outside the project` };
      return { abs: real };
    } catch {
      return { error: `the ticket file \`${rel}\` does not exist` };
    }
  }

  function checkCommit() {
    const c = index.commit;
    if (!isText(c) || !/^[0-9a-f]{7,40}$/i.test(c)) {
      add(indexRel, "commit", `\`commit\` must be a 7 to 40 digit hex sha (got ${JSON.stringify(c)})`, "write the output of `git rev-parse HEAD` on the commit that the evidence ran on.");
      return;
    }
    const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
    if (head.status !== 0) throw new UsageError("this repo has no commits. Fix: commit the change first, then gather the evidence.");
    const r = git(root, ["rev-parse", "--verify", "--quiet", `${c}^{commit}`]);
    if (r.status !== 0) {
      add(indexRel, "commit", `commit ${c} does not exist in this repo`, "write the sha of the commit that the evidence ran on.");
      return;
    }
    const full = r.out.trim();
    const headSha = head.out.trim();
    const anc = git(root, ["merge-base", "--is-ancestor", full, "HEAD"]);
    if (anc.status === 1) {
      add(indexRel, "commit", `commit ${full.slice(0, 7)} is not HEAD or an ancestor of HEAD (${headSha.slice(0, 7)}). The evidence is stale`, "gather the evidence again on the current branch.");
    } else if (anc.status !== 0) {
      throw new UsageError(`git merge-base failed (${anc.err}). Fix: run \`git status\` in the repo.`);
    } else if (strictHead) {
      if (full !== headSha) add(indexRel, "commit", `commit ${full.slice(0, 7)} is not HEAD (${headSha.slice(0, 7)}). \`--strict-head\` needs HEAD`, "gather the evidence again on HEAD, or commit only files that cannot change behavior and drop `--strict-head`.");
      const st = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
      if (st.status !== 0) throw new UsageError(`git status failed (${st.err}).`);
      const dirty = st.out.split("\0").filter((l) => l.length > 3).map((l) => l.slice(3)).filter((p) => !p.startsWith(".artifacts/"));
      if (dirty.length) add(indexRel, "dirty-tree", `${dirty.length} uncommitted change(s) outside .artifacts/ (first: ${dirty[0]}). The evidence may not match the code`, "commit or revert the change, then gather the evidence again.");
    }
  }

  /** Validate one evidence file object. Returns { path } with details when it is sound, else null. */
  function checkFile(f, fp, where) {
    if (!isObj(f)) {
      add(where, "schema", `${fp} is not an object with \`path\` and \`sha256\``, "write `{ \"path\": \"...\", \"sha256\": \"...\" }`.");
      return null;
    }
    const r = resolveEvidence(evReal, f.path);
    if (r.rule) {
      add(where, r.rule, `${fp}: ${r.msg}`, r.fix);
      return null;
    }
    const rel = `.artifacts/${task}/evidence/${r.rel}`;
    let buf;
    try {
      buf = readFileSync(r.abs);
    } catch (e) {
      add(rel, "file-missing", `cannot read the file (${e.code ?? e.message})`, "capture the file again.");
      return null;
    }
    let ok = true;
    const ext = extOf(r.rel);
    if (buf.length === 0) {
      add(rel, "file-empty", "the file is empty", "capture the file again. A zero-byte file proves nothing.");
      ok = false;
    } else if (!MEDIA[ext] && /^\s*$/.test(buf.toString("utf8"))) {
      add(rel, "file-empty", "the file holds only white space", "save the real command, its exit code and its output. A blank file proves nothing.");
      ok = false;
    }
    const digest = sha256(buf);
    if (!isText(f.sha256) || !/^[0-9a-f]{64}$/.test(f.sha256)) {
      add(rel, "sha256", "the index has no valid sha256 for this file", `run \`node .claude/skills/prove/scripts/evidence-check.mjs fill-hashes ${task} --write\`, or write "${digest}".`);
      ok = false;
    } else if (f.sha256 !== digest) {
      add(rel, "sha256", `the file changed after it was indexed (index ${f.sha256.slice(0, 12)}, file ${digest.slice(0, 12)})`, "capture the evidence again, then update the hash. Never edit a file after you index it.");
      ok = false;
    }
    if (MEDIA[ext]) {
      if (buf.length > 0 && !MEDIA[ext][1](buf)) {
        add(rel, "media-magic", `the extension says ${MEDIA[ext][0]} but the first bytes are not ${MEDIA[ext][0]}`, "this is not a real image or video. Capture a real file with the headless browser.");
        ok = false;
      } else if (ext === ".png" && buf.length > 0) {
        const bad = buf.length < 24 || buf.toString("latin1", 12, 16) !== "IHDR" || buf.readUInt32BE(16) === 0 || buf.readUInt32BE(20) === 0;
        if (bad) {
          add(rel, "png-ihdr", "the PNG has no valid header with a width and a height", "capture the image again. This file is cut short or made up.");
          ok = false;
        } else if (!startsWith(buf, PNG_IEND, buf.length - PNG_IEND.length)) {
          add(rel, "png-end", "the PNG does not end with an IEND chunk, so it is cut short", "capture the image again, and wait until the capture tool exits.");
          ok = false;
        }
      }
    } else if (UNSUPPORTED_MEDIA.has(ext)) {
      add(rel, "media-type", `\`${ext}\` is not a supported media type`, "convert to .png, .jpg, .webp or .gif for images, or .mp4 or .webm for video.");
      ok = false;
    }
    if (f.phase !== undefined && !PHASES.includes(f.phase)) add(rel, "schema", `\`phase\` must be one of ${PHASES.join(", ")}`, "use `before`, `after` or `single`.");
    if (f.scheme !== undefined && !SCHEMES.includes(f.scheme)) add(rel, "schema", "`scheme` must be `light` or `dark`", "use `light` or `dark`.");
    let width = null;
    if (f.viewport !== undefined) {
      const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(f.viewport));
      if (!m) add(rel, "schema", `\`viewport\` must look like 375x812 (got ${JSON.stringify(f.viewport)})`, "write WIDTHxHEIGHT in CSS pixels.");
      else {
        width = Number(m[1]);
        if (width === 0 || Number(m[2]) === 0) add(rel, "schema", `\`viewport\` ${f.viewport} has a zero size`, "write WIDTHxHEIGHT in CSS pixels.");
        // Every image type gets this test. Without it, a JPEG could claim any width.
        else if (IMAGE_EXT.has(ext) && ok && f.element === undefined) {
          const w = imageWidth(buf, ext);
          if (w === null) add(rel, "viewport", `the index says viewport ${f.viewport} but the width of the image cannot be read`, "capture the screenshot as a PNG.");
          else if (w % width !== 0 || w / width > 4) add(rel, "viewport", `the index says viewport ${f.viewport} but the image is ${w} px wide`, "write the real viewport, or capture at the viewport you claim. For an element capture add `\"element\": \"<selector>\"`.");
        }
      }
    }
    return { rel: r.rel, ext, ok, width, f, full: rel, buf };
  }

  function checkEntry(e, ep, key) {
    const evList = e.evidence === undefined ? [] : e.evidence;
    if (!Array.isArray(evList)) return add(ep, "schema", "`evidence` must be a list", "write a list of `{ path, sha256 }` objects.");
    if (e.status !== "untested" && evList.length === 0) {
      add(ep, "evidence-required", `status ${e.status} but no evidence file is named`, "name at least one file, or mark the check `untested` with a reason.");
    }
    if (e.status === "untested" && !isText(e.reason)) {
      add(ep, "reason", "status untested but there is no `reason`", "say why the check could not run, for example `no browser on this server`.");
    }
    if (e.status === "fail" && !isText(e.reason)) {
      add(ep, "reason", "status fail but there is no `reason`", "say in one line what you saw that does not meet the check.");
    }
    const files = [];
    const seen = new Set();
    evList.forEach((f, j) => {
      const info = checkFile(f, `evidence[${j}]`, ep);
      if (!info) return;
      if (seen.has(info.rel)) add(ep, "path", `\`${info.rel}\` is listed twice in this entry`, "list each file once.");
      seen.add(info.rel);
      files.push(info);
    });
    if (e.status === "untested") return;

    // red-then-green
    if (index.level === "red-then-green" && e.status === "pass") {
      const phases = new Set(files.map((x) => x.f.phase ?? "single"));
      for (const need of ["before", "after"]) {
        if (!phases.has(need)) add(ep, "phase", `level is red-then-green but no \`${need}\` file is named`, `add a file with \`"phase": "${need}"\`. A bug fix needs the failure before the fix and the pass after it.`);
      }
    }

    // visual checks
    const visual = e.visual === true || files.some((x) => isImage(x.rel) || isVideo(x.rel));
    if (!visual || e.status !== "pass") return;
    const imgs = files.filter((x) => isImage(x.rel));
    if (imgs.length === 0) add(ep, "review-images", "a visual check needs at least one image file that a reviewer can open", "for a video, save key frames as .png files and name them too.");
    const rv = e.review;
    if (!isObj(rv)) return add(ep, "review", "a visual check marked pass has no `review`", "have a fresh reviewer look at the images, then record its verdict. See REVIEWER-BRIEF.md.");
    if (!VERDICTS.includes(rv.verdict)) return add(ep, "review", `\`review.verdict\` must be one of ${VERDICTS.join(", ")} (got ${JSON.stringify(rv.verdict)})`, "record the verdict of the reviewer.");
    if (rv.verdict !== "matches") add(ep, "review", `the reviewer verdict is \`${rv.verdict}\`, so the check cannot be \`pass\``, "mark the check `fail`, or fix the change and capture again.");
    if (!REVIEWERS.includes(rv.reviewer)) add(ep, "review", `\`review.reviewer\` must be one of ${REVIEWERS.join(", ")}`, "say whether a fresh subagent or the same context did the review.");
    else if (rv.reviewer === "same-context") {
      if (requireFresh) add(ep, "review", "the review ran in the same context as the author, and `--require-fresh-reviewer` is set", "run the review again with a fresh subagent.");
      else warnings.push(`${ep}  review  reviewer is same-context (weaker). Run the review again from a fresh session when you can.`);
    }
    const reviewed = Array.isArray(rv.images) ? rv.images.map(String) : [];
    if (reviewed.length === 0) add(ep, "review-images", "`review.images` is empty", "list the image files that the reviewer opened.");
    for (const p of reviewed) {
      if (!imgs.some((x) => x.rel === posix.normalize(p))) add(ep, "review-images", `reviewed image \`${p}\` is not an image file of this entry`, "list only images that this entry names.");
    }
    for (const x of imgs) {
      if (!reviewed.some((p) => posix.normalize(p) === x.rel)) add(ep, "review-images", `image \`${x.rel}\` was never reviewed`, "have the reviewer open every image, or remove the image from the entry.");
    }
    // the saved reply
    const reply = checkFile(rv.reply, "review.reply", ep);
    if (reply && reply.ok) {
      if (reply.ext !== ".md" && reply.ext !== ".txt") add(reply.full, "review-reply", "the reviewer reply must be a .md or .txt file", "save the reply of the reviewer as text.");
      else {
        const verdict = replyVerdict(reply.buf.toString("utf8"), key);
        if (verdict === null) add(reply.full, "review-reply", `the reply has no block \`Check: ${key.slice(0, 40)}...\` with a \`Verdict:\` line`, "save the whole reply of the reviewer, word for word. See REVIEWER-BRIEF.md for the format.");
        else {
          if (verdict.verdict !== rv.verdict) add(reply.full, "review-reply", `the reply says \`${verdict.verdict}\` but the index says \`${rv.verdict}\``, "record the verdict that the reviewer gave.");
          for (const p of reviewed) {
            const base = posix.basename(posix.normalize(p));
            if (!verdict.block.includes(base)) add(reply.full, "review-reply", `the reply block does not mention reviewed image \`${base}\``, "the reviewer must name each image that it opened.");
          }
        }
      }
    }
    // viewports
    if (isText(e.viewport_waiver)) return;
    const widths = files.filter((x) => isImage(x.rel) && x.f.element === undefined && x.width !== null).map((x) => x.width);
    if (!widths.some((w) => w <= PHONE_MAX_WIDTH) || !widths.some((w) => w >= DESKTOP_MIN_WIDTH)) {
      add(ep, "viewport", `a visual check needs an image at a phone width (${PHONE_MAX_WIDTH} px or less) and one at a desktop width (${DESKTOP_MIN_WIDTH} px or more). Found: ${widths.length ? widths.join(", ") : "none declared"}`, "capture both, and write `viewport` on each file. Or write `viewport_waiver` with the reason, for example a terminal screenshot.");
    }
  }
}

/** Find the `Verdict:` of the block for one check in a reviewer reply. */
export function replyVerdict(text, checkText) {
  const parts = text.split(/^Check:[ \t]*/im).slice(1);
  for (const part of parts) {
    const firstEnd = part.indexOf("\n");
    const head = norm(firstEnd === -1 ? part : part.slice(0, firstEnd));
    if (head !== checkText) continue;
    const m = /^Verdict:[ \t]*([A-Za-z -]+?)[ \t]*$/im.exec(part);
    if (!m) return null;
    return { verdict: m[1].toLowerCase().replace(/\s+/g, "-"), block: part };
  }
  return null;
}

// ---------- hash and report ----------

function openIndex(repo, task) {
  const top = git(resolve(repo ?? "."), ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) throw new UsageError(`not a git repository: ${resolve(repo ?? ".")}. Fix: run from the project root or pass \`--repo <dir>\`.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(task ?? "")) throw new UsageError(`task name \`${task ?? ""}\` is not valid. ${USAGE}`);
  const root = realpathSync(top.out.trim());
  let evReal;
  try {
    evReal = realpathSync(join(root, ".artifacts", task, "evidence"));
  } catch {
    throw new UsageError(`.artifacts/${task}/evidence/ does not exist. Fix: gather the evidence first.`);
  }
  if (!inside(root, evReal)) throw new UsageError(`.artifacts/${task}/evidence/ is a link that leads outside the project. Fix: make it a real folder in the project.`);
  const indexPath = join(evReal, "index.json");
  let indexReal = null;
  try {
    indexReal = realpathSync(indexPath);
  } catch {
    // A missing index is reported when it is read.
  }
  // `hash --write` writes the index. Never write through a link to a file outside the folder.
  if (indexReal !== null && !inside(evReal, indexReal)) throw new UsageError(`.artifacts/${task}/evidence/index.json is a link that leads outside the evidence folder. Fix: write the index as a real file.`);
  return { root, evReal, indexPath };
}

/** Print sha256 lines for the files that the index names. With write, fill the missing hashes. */
export function hashCommand({ repo, task, write = false }, out) {
  const { evReal, indexPath } = openIndex(repo, task);
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch (e) {
    throw new UsageError(`cannot read the index (${e.message}). Fix: write .artifacts/${task}/evidence/index.json first.`);
  }
  let changed = 0;
  const files = [];
  for (const e of Array.isArray(index?.checks) ? index.checks : []) {
    for (const f of [...(Array.isArray(e?.evidence) ? e.evidence : []), e?.review?.reply]) if (isObj(f)) files.push(f);
  }
  const done = new Set();
  for (const f of files) {
    const r = resolveEvidence(evReal, f.path);
    if (r.rule) {
      out.write(`# ${f.path}: ${r.msg}\n`);
      continue;
    }
    const d = sha256(readFileSync(r.abs));
    if (!done.has(r.rel)) out.write(`${d}  ${r.rel}\n`);
    done.add(r.rel);
    if (write && !f.sha256) {
      f.sha256 = d;
      changed++;
    }
  }
  if (write && changed > 0) writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  if (write) out.write(`# filled ${changed} missing sha256 value(s). Existing values are never changed.\n`);
}

/** Markdown report for a person or a pull request. Reads only. Run the check first. */
export function reportMarkdown(index, task) {
  const rows = Array.isArray(index?.checks) ? index.checks : [];
  const count = (s) => rows.filter((r) => r?.status === s).length;
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const L = [
    `# Evidence: ${task}`,
    "",
    `- Commit: \`${esc(index?.commit)}\``,
    `- Level: ${esc(index?.level)}`,
    `- Environment: ${esc(index?.environment)}`,
    `- Result: ${count("pass")} pass, ${count("fail")} fail, ${count("untested")} untested`,
    "",
    "| Check | Status | Why or evidence |",
    "| --- | --- | --- |",
  ];
  for (const r of rows) {
    const files = (Array.isArray(r?.evidence) ? r.evidence : []).map((f) => `\`${esc(f?.path)}\``).join(", ");
    // Show a viewport waiver, so that a reader sees why a visual check has only one width.
    const waiver = isText(r?.viewport_waiver) ? `Width rule waived: ${r.viewport_waiver}` : "";
    const note = (r?.status === "pass" ? [files, waiver] : [r?.reason, files, waiver]).filter(Boolean).join(". ");
    L.push(`| ${esc(r?.check)} | ${esc(r?.status)} | ${esc(note)} |`);
  }
  const pairs = [];
  for (const r of rows) {
    const ev = Array.isArray(r?.evidence) ? r.evidence : [];
    const before = ev.filter((f) => f?.phase === "before" && isImage(String(f.path)));
    const after = ev.filter((f) => f?.phase === "after" && isImage(String(f.path)));
    for (let i = 0; i < Math.min(before.length, after.length); i++) pairs.push([before[i], after[i]]);
  }
  if (pairs.length) {
    L.push("", "## Before and after", "", "| Before | After |", "| --- | --- |");
    for (const [b, a] of pairs) L.push(`| ![before](${esc(b.path)}) | ![after](${esc(a.path)}) |`);
  }
  L.push("", "Paths are relative to `.artifacts/" + task + "/evidence/`.", "");
  return L.join("\n");
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { cmd: "check", task: undefined, repo: undefined, ticket: undefined, strictHead: false, requireFresh: false, json: false, write: false };
  const rest = [...argv];
  if (rest[0] === "fill-hashes" || rest[0] === "hash") o.cmd = (rest.shift(), "hash");
  else if (rest[0] === "report") o.cmd = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const val = () => {
      const v = rest[++i];
      if (v === undefined || v === "" || v.startsWith("-")) throw new UsageError(`\`${a}\` needs a value. ${USAGE}`);
      return v;
    };
    if (a === "--json") o.json = true;
    else if (a === "--strict-head") o.strictHead = true;
    else if (a === "--require-fresh-reviewer") o.requireFresh = true;
    else if (a === "--write") o.write = true;
    else if (a === "--repo") o.repo = val();
    else if (a === "--ticket") o.ticket = val();
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}. ${USAGE}`);
    else if (o.task === undefined) o.task = a;
    else throw new UsageError(`too many arguments. ${USAGE}`);
  }
  if (o.task === undefined) throw new UsageError(`missing task name. ${USAGE}`);
  if (o.write && o.cmd !== "hash") throw new UsageError(`\`--write\` works only with \`fill-hashes\`. ${USAGE}`);
  return o;
}

const line = (p) => `${p.path}  ${p.rule}  ${p.message}  Fix: ${p.fix}\n`;

export function main(argv, out = process.stdout, err = process.stderr) {
  try {
    const o = parseArgs(argv);
    if (o.cmd === "hash") {
      hashCommand(o, out);
      return 0;
    }
    const r = check({ repo: o.repo, task: o.task, ticket: o.ticket, strictHead: o.strictHead, requireFresh: o.requireFresh });
    if (o.cmd === "report") {
      // A table for a pull request must not show `pass` for evidence that the check refuses.
      if (r.problems.length > 0) {
        for (const p of r.problems) err.write(line(p));
        err.write(`evidence-check  report refused: ${r.problems.length} problem(s). Fix each line, then run the report again.\n`);
        return 1;
      }
      out.write(reportMarkdown(r.index, o.task));
      return 0;
    }
    const code = r.problems.length > 0 ? 1 : r.notProven.length > 0 ? 3 : 0;
    const s = r.summary;
    if (o.json) {
      out.write(JSON.stringify({ ok: code === 0, exit: code, task: o.task, summary: s, problems: r.problems, notProven: r.notProven, warnings: r.warnings }, null, 2) + "\n");
      return code;
    }
    for (const p of r.problems) err.write(line(p));
    for (const w of r.warnings) err.write(`${w}\n`);
    if (code === 3) {
      for (const c of r.notProven) {
        err.write(`${r.indexRel}  not-proven  check "${c.check}" is ${c.status}${c.reason ? `: ${c.reason}` : ""}  Fix: ${c.status === "fail" ? "fix the change and gather the evidence again" : "test it where it can run, or tell the reader that it is not proven"}.\n`);
      }
    }
    const label = code === 0 ? "sound and complete" : code === 3 ? "sound, but not every check is proven" : `${r.problems.length} problem(s)`;
    // Name the exit code in the text too. Some agent tools show the output of a command but not its exit code.
    out.write(`evidence-check  ${o.task}: ${s.pass} pass, ${s.fail} fail, ${s.untested} untested. ${label}. Exit ${code}.\n`);
    return code;
  } catch (e) {
    if (e instanceof UsageError) {
      err.write(`evidence-check  ${e.message.replace(/\. Fix: /, "  Fix: ")}\n`);
      return 2;
    }
    err.write(`evidence-check  unexpected error: ${e.message}  Fix: report this with the command you ran.\n`);
    return 2;
  }
}

// Compare real paths: Node resolves symlinks in import.meta.url, so a run through a symlink
// would otherwise match nothing and the script would exit 0 without output.
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
