#!/usr/bin/env node
// survey-lint: checks the report that the improve-codebase skill writes.
//
// The report shape is in skills/improve-codebase/OUTPUT-FORMAT.md. The candidate fields and the
// three ranks follow the candidate cards of mattpocock/skills
// skills/engineering/improve-codebase-architecture/SKILL.md (MIT, Copyright (c) 2026 Matt Pocock,
// see NOTICE). The checks are new code. The fence scan and the main check copy the style of
// skills/tickets/scripts/tickets-lint.mjs in this repo.
//
// Rules:
//   title         the first line outside code fences is a `# ` heading with text
//   scope         a `Scope:` line with text comes before the first `## ` heading
//   section       each of `## Candidates`, `## Instructions found in the code`,
//                 `## Top recommendation` and `## Next command` appears exactly once
//   candidate-id  a candidate heading is `### C<n>: <title>` inside `## Candidates`, with a unique n
//   field         each candidate has Rank, Files, Problem, Module boundary, Tests that change
//                 and Do not, each with text
//   rank          Rank is Strong, Worth a look or Speculative
//   path          a Files field cites at least one path. Each path in a Files field, and each
//                 location in `## Instructions found in the code`, is relative, stays inside
//                 the root (also after symlinks are resolved), exists, and is a file
//   no-change     with no candidates, `## Candidates` says None and the top recommendation is
//                 "No change recommended" with a reason
//   top           with candidates, the top recommendation names a candidate that exists, or
//                 says "No change recommended" with a reason
//   next          with candidates, `## Next command` names `/grill`
//   instructions  `## Instructions found in the code` says None, or lists items that each start
//                 with a `path:line` location
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/improve-codebase/scripts/survey-lint.mjs [--root <dir>] <report.md>
// Paths in the report resolve against --root, which is the current folder by default.
// There is no cap on the number of candidates. Each one has a rank.
// Exit 0 clean, 1 problems found, 2 usage or read error.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/improve-codebase/scripts/survey-lint.mjs [--root <dir>] <report.md>";
export const RANKS = ["Strong", "Worth a look", "Speculative"];
export const FIELDS = ["Rank", "Files", "Problem", "Module boundary", "Tests that change", "Do not"];
export const SECTIONS = ["Candidates", "Instructions found in the code", "Top recommendation", "Next command"];

const FIELD_LINE = new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*)?(${FIELDS.join("|")})(?:\\*\\*)?\\s*:(?:\\*\\*)?\\s*(.*)$`, "i");
const CANDIDATE = /^###\s+C(\d+)\s*[:.]\s*(\S.*)$/;
const PATH_TOKEN = /^(?:\.\/)?[\w@.+-]+(?:\/[\w@.+-]+)*\/?$/;
const NO_CHANGE = /^no change recommended\b[\s.:,]*/i;

export class SurveyLintError extends Error {}

/**
 * Lines with a flag for "inside a fenced code block". Fence lines themselves count as inside.
 * A fence opens with 3 or more backticks or tildes. It closes only on a line of the same
 * character, at least as long, with nothing after it. A UTF-8 byte order mark is dropped.
 */
function scan(text) {
  const raw = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  let open = null;
  return raw.map((t, i) => {
    const m = t.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (open === null) {
      if (m && !(m[1][0] === "`" && m[2].includes("`"))) {
        open = { ch: m[1][0], len: m[1].length };
        return { n: i + 1, t, fence: true };
      }
      return { n: i + 1, t, fence: false };
    }
    if (m && m[1][0] === open.ch && m[1].length >= open.len && m[2].trim() === "") open = null;
    return { n: i + 1, t, fence: true };
  });
}

const plain = (s) => s.replace(/\*\*|__/g, "").replace(/`/g, "").trim();
const words = (s) => plain(s).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/** Split one cited location into a path. Drops a `:line` or `:line-line` suffix. */
function stripLine(token) {
  return token.replace(/:\d+(?:-\d+)?$/, "");
}

/** Drop each `(...)` note. One pass over the text, so a long run of `(` costs no extra time. */
function stripParens(s) {
  let out = "";
  let from = 0;
  for (;;) {
    const open = s.indexOf("(", from);
    const close = open === -1 ? -1 : s.indexOf(")", open);
    if (close === -1) return out + s.slice(from);
    out += s.slice(from, open);
    from = close + 1;
  }
}

/** Paths in a Files field: code spans if there are any, else the comma-separated parts. */
export function filePaths(text) {
  const spans = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const parts = spans.length
    ? spans
    : text
        .split(/[,\n]/)
        .map((p) => stripParens(p.replace(/^\s*[-*]\s+/, "")).trim().split(/\s+/)[0] ?? "")
        .filter(Boolean);
  return parts.map((p) => stripLine(p.trim())).filter(Boolean);
}

/** Lint the text of one report. root is the folder that paths resolve against. */
export function checkReport(text, root) {
  const problems = [];
  const add = (line, rule, message, fix) => problems.push({ line, rule, message, fix });
  const lines = scan(text);
  const prose = lines.filter((l) => !l.fence);
  const seen = new Map();

  const first = prose.find((l) => l.t.trim() !== "");
  if (!first || !/^#\s+\S/.test(first.t)) {
    add(first ? first.n : 1, "title", "the report has no title (the first line is not a `# ` heading with text)", "make the first line `# Improve codebase report`.");
  }

  // Sections: level-2 headings.
  const h2 = prose.filter((l) => /^##\s+\S/.test(l.t)).map((l) => ({ n: l.n, name: l.t.replace(/^##\s+/, "").replace(/[\s:.]+$/, "").trim() }));
  const firstH2 = h2.length ? h2[0].n : Infinity;
  const scope = prose.find((l) => l.n < firstH2 && /^\s*(?:\*\*)?Scope:(?:\*\*)?\s*\S/i.test(l.t));
  if (!scope) add(1, "scope", "no `Scope:` line with text before the first `## ` heading", "add `Scope: <the area that the user named, the top churn paths, or the whole repo>` under the title.");

  const sectionAt = new Map();
  for (const name of SECTIONS) {
    const hits = h2.filter((h) => h.name.toLowerCase() === name.toLowerCase());
    if (hits.length === 0) add(1, "section", `no \`## ${name}\` section`, `add a \`## ${name}\` section. OUTPUT-FORMAT.md shows what goes in it.`);
    for (const extra of hits.slice(1)) add(extra.n, "section", `a second \`## ${name}\` section (the first is on line ${hits[0].n})`, "merge the two sections into one.");
    if (hits.length) sectionAt.set(name, hits[0].n);
  }
  /** Prose lines of one section, from its heading to the next `## ` heading. Empty if missing. */
  const body = (name) => {
    const start = sectionAt.get(name);
    if (start === undefined) return [];
    const end = h2.find((h) => h.n > start)?.n ?? Infinity;
    return lines.filter((l) => l.n > start && l.n < end);
  };

  // Candidates.
  const candStart = sectionAt.get("Candidates");
  const candEnd = candStart === undefined ? -1 : (h2.find((h) => h.n > candStart)?.n ?? Infinity);
  const candidates = [];
  const ids = new Map();
  for (const l of prose) {
    if (!/^###\s/.test(l.t)) continue;
    const inside = candStart !== undefined && l.n > candStart && l.n < candEnd;
    const m = l.t.match(CANDIDATE);
    if (!inside) {
      if (m) add(l.n, "candidate-id", `candidate heading \`${l.t.trim()}\` is outside \`## Candidates\``, "move the candidate under `## Candidates`.");
      continue;
    }
    if (!m) {
      add(l.n, "candidate-id", `heading \`${l.t.trim()}\` is not \`### C<n>: <title>\``, "write each candidate heading as `### C1: <title>`, with the next number for each candidate.");
      continue;
    }
    const id = Number(m[1]);
    if (ids.has(id)) add(l.n, "candidate-id", `\`C${id}\` is used twice (first on line ${ids.get(id)})`, "give each candidate its own number.");
    else ids.set(id, l.n);
    candidates.push({ id, n: l.n, title: m[2].trim() });
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const end = candidates[i + 1]?.n ?? candEnd;
    // lines[i] holds line i + 1, so a slice reads one block. A filter here makes a large report slow.
    const block = lines.slice(c.n, end === Infinity ? undefined : end - 1);
    const fields = new Map();
    let current = null;
    for (const l of block) {
      const m = !l.fence && l.t.match(FIELD_LINE);
      if (m) {
        const key = FIELDS.find((f) => f.toLowerCase() === m[1].toLowerCase());
        current = { n: l.n, text: m[2] };
        if (!fields.has(key)) fields.set(key, current);
        continue;
      }
      if (current && !l.fence && l.t.trim() !== "") current.text += `\n${l.t}`;
    }
    for (const f of FIELDS) {
      const v = fields.get(f);
      if (!v) add(c.n, "field", `candidate C${c.id} has no \`${f}:\` field`, `add \`${f}: <text>\` to C${c.id}.`);
      else if (plain(v.text) === "") add(v.n, "field", `the \`${f}:\` field of C${c.id} is empty`, `write the ${f.toLowerCase()} after \`${f}:\`.`);
    }
    const rank = fields.get("Rank");
    if (rank && plain(rank.text) !== "") {
      const value = plain(rank.text).replace(/\.$/, "");
      if (!RANKS.some((r) => r.toLowerCase() === value.toLowerCase())) {
        add(rank.n, "rank", `the rank \`${value}\` of C${c.id} is not one of ${RANKS.join(", ")}`, "write `Rank: Strong`, `Rank: Worth a look` or `Rank: Speculative`.");
      }
    }
    const filesField = fields.get("Files");
    if (filesField && plain(filesField.text) !== "") {
      const paths = filePaths(filesField.text);
      if (paths.length === 0) add(filesField.n, "path", `the \`Files:\` field of C${c.id} names no path`, "list each file as a path from the project root, such as `src/orders/service.mjs`.");
      for (const p of paths) checkPath(p, filesField.n, `C${c.id}`, root, add, seen);
    }
  }

  // No change, top recommendation and next command.
  const sectionText = (name) => body(name).filter((l) => !l.fence).map((l) => l.t).join("\n").trim();
  const candText = plain(sectionText("Candidates"));
  const top = sectionText("Top recommendation");
  const topPlain = plain(top);
  const noChange = NO_CHANGE.test(topPlain);
  const reasonWords = noChange ? words(topPlain.replace(NO_CHANGE, "")) : 0;
  const topLine = sectionAt.get("Top recommendation") ?? 1;
  if (candStart !== undefined && candidates.length === 0) {
    if (!/^none\b/i.test(candText)) add(candStart, "no-change", "`## Candidates` has no candidate and does not say None", "write `None.` under `## Candidates`, or add a `### C1: <title>` candidate.");
    if (sectionAt.has("Top recommendation") && !noChange) add(topLine, "no-change", "the report has no candidate, and the top recommendation is not \"No change recommended\"", "write `No change recommended.` and then the reason.");
  }
  if (sectionAt.has("Top recommendation")) {
    if (topPlain === "") add(topLine, "top", "`## Top recommendation` is empty", "name one candidate, such as `C1`, and one reason. Or write `No change recommended.` and the reason.");
    else if (noChange && reasonWords < 3) add(topLine, "no-change", "\"No change recommended\" has no reason", "add a sentence after it that says why no change is worth it.");
    else if (!noChange && candidates.length > 0) {
      const named = [...topPlain.matchAll(/\bC(\d+)\b/g)].map((m) => Number(m[1]));
      if (named.length === 0) add(topLine, "top", "the top recommendation names no candidate", "name one candidate by its number, such as `C1`, and give one reason.");
      for (const id of named) if (!ids.has(id)) add(topLine, "top", `the top recommendation names \`C${id}\`, which is not a candidate`, "name a candidate that the report lists.");
    }
  }
  const next = sectionText("Next command");
  const nextLine = sectionAt.get("Next command") ?? 1;
  if (sectionAt.has("Next command")) {
    if (plain(next) === "") add(nextLine, "next", "`## Next command` is empty", "write the command that the user can type next, or `None.`.");
    else if (candidates.length > 0 && !/\/grill\b/.test(next)) add(nextLine, "next", "`## Next command` does not name `/grill`", "write `Type /grill C1: <title> in a fresh session.` for one candidate.");
  }

  // Instructions found in the code.
  if (sectionAt.has("Instructions found in the code")) {
    const ins = body("Instructions found in the code").filter((l) => !l.fence && l.t.trim() !== "");
    const all = plain(ins.map((l) => l.t).join(" "));
    const items = ins.filter((l) => /^\s*[-*]\s+/.test(l.t));
    const insLine = sectionAt.get("Instructions found in the code");
    if (all === "") add(insLine, "instructions", "`## Instructions found in the code` is empty", "write `None.`, or list each instruction as `- path:line: <the text>`.");
    else if (!/^none\b/i.test(all) || items.length > 0) {
      if (items.length === 0) add(insLine, "instructions", "the instructions are not a list", "write each instruction as `- path:line: <the text>`.");
      for (const l of items) {
        const rest = l.t.replace(/^\s*[-*]\s+/, "");
        const m = rest.match(/^`([^`]+)`/) ?? rest.match(/^([^\s`]+?):?(?:\s|$)/);
        const loc = m ? m[1].replace(/:$/, "") : "";
        if (!/:\d+(?:-\d+)?$/.test(loc) || !PATH_TOKEN.test(stripLine(loc))) {
          add(l.n, "instructions", "an instruction does not start with a `path:line` location", "start the item with the location, such as `- src/auth.mjs:3: <the text>`.");
          continue;
        }
        checkPath(stripLine(loc), l.n, "an instruction", root, add, seen);
      }
    }
  }

  problems.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return { candidates: candidates.length, problems };
}

/** What is wrong with one cited path: [the end of the message, the fix], or null for a good path. */
function pathProblem(p, root) {
  if (isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return [`the absolute path \`${p}\``, "write the path relative to the project root."];
  const full = resolve(root, p);
  const rel = relative(root, full);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return [`\`${p}\`, which is outside the project root`, "cite only files inside the project."];
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [`\`${p}\`, which does not exist`, "cite only files that exist now, with the path from the project root. Name a new file in `Module boundary:`."];
  }
  // A symlink inside the root can point outside it. Compare the real paths.
  const realRel = relative(realpathSync(root), realpathSync(full));
  if (realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
    return [`\`${p}\`, which is a link to a place outside the project root`, "cite only files inside the project."];
  }
  if (!stat.isFile()) return [`\`${p}\`, which is a folder`, "name the files of the module, each with its path from the project root."];
  return null;
}

/** Report one cited path. `seen` keeps the verdict of each path, so a path that many candidates cite is read once. */
function checkPath(p, line, owner, root, add, seen) {
  if (!seen.has(p)) seen.set(p, pathProblem(p, root));
  const problem = seen.get(p);
  if (problem) add(line, "path", `${owner} cites ${problem[0]}`, problem[1]);
}

export function lint(file, { root = "." } = {}) {
  const rootDir = resolve(root);
  let isDir = false;
  try {
    isDir = statSync(rootDir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new SurveyLintError(`the root ${rootDir} is not a folder`);
  let text;
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new SurveyLintError(`cannot read ${file}: ${e.message}`);
  }
  return checkReport(text, rootDir);
}

export function formatProblem(file, p) {
  return `${file}:${p.line}  ${p.rule}  ${p.message}. Fix: ${p.fix}`;
}

export function main(argv, out = console.log, err = console.error) {
  let file;
  let root = ".";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      out(USAGE);
      return 0;
    }
    if (a === "--root") {
      const v = argv[++i];
      if (v === undefined || v === "") {
        err(`survey-lint: --root needs a folder. Fix: write --root <dir>.\n${USAGE}`);
        return 2;
      }
      root = v;
      continue;
    }
    if (a.startsWith("-")) {
      err(`survey-lint: unknown option ${a}. Fix: use --root <dir> or no option.\n${USAGE}`);
      return 2;
    }
    if (file !== undefined) {
      err(`survey-lint: too many arguments. Fix: pass one report file.\n${USAGE}`);
      return 2;
    }
    file = a;
  }
  if (file === undefined) {
    err(`survey-lint: no report file. Fix: pass the path of the report, such as .artifacts/improve-codebase/report.md.\n${USAGE}`);
    return 2;
  }
  let result;
  try {
    result = lint(file, { root });
  } catch (e) {
    if (!(e instanceof SurveyLintError)) throw e;
    err(`survey-lint: ${e.message}. Fix: check the path and run again.\n${USAGE}`);
    return 2;
  }
  for (const p of result.problems) out(formatProblem(file, p));
  out(`${file}: ${result.candidates} candidate(s), ${result.problems.length} problem(s).`);
  return result.problems.length === 0 ? 0 : 1;
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
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`survey-lint: internal error: ${e.message}. Fix: report this bug with the report file.`);
    process.exitCode = 2;
  }
}
