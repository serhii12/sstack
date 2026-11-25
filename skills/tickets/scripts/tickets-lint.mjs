#!/usr/bin/env node
// tickets-lint: checks local ticket files under .scratch/<feature>/tickets/.
//
// The ticket shape comes from the local ticket template in mattpocock/skills
// skills/engineering/to-tickets/SKILL.md (MIT, Copyright (c) 2026 Matt Pocock,
// see NOTICE): one file per ticket, numbered, a title, a "Blocked by" line and
// a checkbox list of acceptance criteria. The checks are new code.
//
// Rules, per ticket file:
//   file-name   the name is NN-title.md (two or more digits, then lowercase words joined by -)
//   title       the first non-empty line is a `# ` heading with text
//   acceptance  a `## Acceptance checks` section with at least one `- [ ]` item
//   blocked-by  exactly one `Blocked by:` line that says `none` or names ticket
//               files in the same tickets folder
//   number      no two ticket files in one folder start with the same number
//   cycle       no ticket is blocked, directly or through others, by itself
//   cap         only with `--max <n>`: no tickets folder holds more than n ticket files
//               (one spec, one folder). With no `--max` there is no cap.
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/tickets/scripts/tickets-lint.mjs [--max <n>] [rootDir]
// In the stack repo it is skills/tickets/scripts/tickets-lint.mjs.
// Exit 0 clean, 1 problems found, 2 usage or read error.

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/tickets/scripts/tickets-lint.mjs [--max <n>] [rootDir]";
const FILE_NAME = /^\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const BLOCKED_BY = /^\s*(?:[-*]\s+)?(?:\*\*)?Blocked by:(?:\*\*)?\s*(.*?)\s*$/i;
const NONE = /^none(?:\s*\([^)]*\))?\.?$/i;
const ACCEPTANCE_HEADING = /^##\s+Acceptance checks\s*$/i;
const CHECKBOX = /^\s*[-*]\s+\[[ xX]\]\s+\S/;

export class TicketsLintError extends Error {}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new TicketsLintError(`cannot read ${dir}: ${e.message}`);
  }
}

/** A regular file, or a symlink to one. A symlinked ticket still counts toward a `--max` cap. */
function isTicketEntry(dir, e) {
  if (!e.name.endsWith(".md")) return false;
  if (e.isFile()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return statSync(join(dir, e.name)).isFile();
  } catch {
    return false;
  }
}

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

/** One entry of a `Blocked by:` list, reduced to a file name. */
function entryTarget(entry) {
  let e = entry.trim().replace(/^`+|`+$/g, "").trim();
  const link = e.match(/^\[[^\]]*\]\(([^)\s]+)\)$/);
  if (link) e = link[1];
  return e.replace(/^\.\//, "");
}

/** Parse one ticket file. Returns { problems, blockers: [{ target, line }], blockedByLine }. */
export function checkTicket(name, text) {
  const problems = [];
  const add = (line, rule, message, fix) => problems.push({ line, rule, message, fix });
  const lines = scan(text);

  if (!FILE_NAME.test(name)) {
    add(1, "file-name", `file name \`${name}\` is not \`NN-title.md\``, "rename it to two or more digits, a dash and lowercase words joined by dashes, such as `03-export-csv.md`.");
  }

  const first = lines.find((l) => l.t.trim() !== "");
  if (!first || !/^#\s+\S/.test(first.t)) {
    add(first ? first.n : 1, "title", "the ticket has no title (the first line is not a `# ` heading with text)", "make the first line `# NN: <ticket title>`.");
  }

  const heading = lines.find((l) => !l.fence && ACCEPTANCE_HEADING.test(l.t));
  if (!heading) {
    add(1, "acceptance", "no `## Acceptance checks` section", "add `## Acceptance checks` with at least one `- [ ] <check>` line.");
  } else {
    let items = 0;
    for (const l of lines) {
      if (l.n <= heading.n || l.fence) continue;
      if (/^#{1,2}\s/.test(l.t)) break;
      if (CHECKBOX.test(l.t)) items++;
    }
    if (items === 0) {
      add(heading.n, "acceptance", "`## Acceptance checks` has no `- [ ]` items", "add at least one `- [ ] <check>` line under the heading.");
    }
  }

  const blockedLines = lines.filter((l) => !l.fence && BLOCKED_BY.test(l.t));
  const blockers = [];
  if (blockedLines.length === 0) {
    add(1, "blocked-by", "no `Blocked by:` line", "add `Blocked by: None (can start immediately)`, or `Blocked by:` and the file names of the tickets that must finish first.");
  } else {
    for (const extra of blockedLines.slice(1)) {
      add(extra.n, "blocked-by", `more than one \`Blocked by:\` line (the first is on line ${blockedLines[0].n})`, "keep one `Blocked by:` line and list every blocker on it, separated by commas.");
    }
    const l = blockedLines[0];
    const value = l.t.match(BLOCKED_BY)[1].trim();
    if (value === "") {
      add(l.n, "blocked-by", "`Blocked by:` is empty", "write `Blocked by: None (can start immediately)`, or list the blocking ticket files.");
    } else if (!NONE.test(value)) {
      for (const entry of value.split(/\s*,\s*/)) {
        const target = entryTarget(entry);
        if (target === "" || NONE.test(target)) {
          add(l.n, "blocked-by", `\`Blocked by:\` mixes \`none\` or an empty entry with ticket names: \`${value}\``, "write either `none` or a comma-separated list of ticket files.");
          continue;
        }
        blockers.push({ target, line: l.n });
      }
    }
  }
  return { problems, blockers, blockedByLine: blockedLines[0]?.n ?? 1 };
}

/** Strongly connected components (Tarjan). nodes: sorted names. edges: Map name -> names. */
function components(nodes, edges) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const out = [];
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      out.push(comp.sort());
    }
  };
  for (const v of nodes) if (!idx.has(v)) visit(v);
  return out;
}

/** A path start -> ... -> start inside one component. */
function cyclePath(start, members, edges) {
  const inComp = new Set(members);
  const prev = new Map();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const v = queue.shift();
    for (const w of [...(edges.get(v) ?? [])].sort()) {
      if (!inComp.has(w)) continue;
      if (w === start) {
        const path = [v];
        while (path[0] !== start) path.unshift(prev.get(path[0]));
        return [...path, start];
      }
      if (!seen.has(w)) {
        seen.add(w);
        prev.set(w, v);
        queue.push(w);
      }
    }
  }
  return [start, start];
}

export function lint(rootArg, { max } = {}) {
  const root = resolve(rootArg ?? ".");
  if (!isDir(root)) throw new TicketsLintError(`${root} is not a directory`);
  const problems = [];
  let files = 0;
  const scratch = join(root, ".scratch");
  if (!isDir(scratch)) return { root, files, problems };

  const features = listDir(scratch)
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  for (const feature of features) {
    const dir = join(scratch, feature, "tickets");
    if (!isDir(dir)) continue;
    const names = listDir(dir)
      .filter((e) => isTicketEntry(dir, e))
      .map((e) => e.name)
      .sort();
    const present = new Set(names);
    if (max !== undefined && names.length > max) {
      problems.push({
        path: relative(root, dir),
        line: 1,
        rule: "cap",
        message: `${names.length} ticket files in this folder, and the cap is ${max}`,
        fix: "this project set the cap with `--max`. Merge tickets, split the spec, or run with a higher `--max <n>`.",
      });
    }
    const byNumber = new Map();
    for (const name of names) {
      const m = name.match(/^(\d+)-/);
      if (!m) continue;
      const number = Number(m[1]);
      if (byNumber.has(number)) {
        problems.push({
          path: relative(root, join(dir, name)),
          line: 1,
          rule: "number",
          message: `\`${name}\` has the same number as \`${byNumber.get(number)}\``,
          fix: "give each ticket its own number, so that a bare number such as `03` names one file.",
        });
      } else byNumber.set(number, name);
    }
    const edges = new Map();
    const blockedByLine = new Map();
    for (const name of names) {
      const file = join(dir, name);
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch (e) {
        throw new TicketsLintError(`cannot read ${file}: ${e.message}`);
      }
      files++;
      const rel = relative(root, file);
      const r = checkTicket(name, text);
      for (const p of r.problems) problems.push({ path: rel, ...p });
      blockedByLine.set(name, r.blockedByLine);
      const out = new Set();
      for (const b of r.blockers) {
        if (present.has(b.target)) out.add(b.target);
        else {
          problems.push({
            path: rel,
            line: b.line,
            rule: "blocked-by",
            message: `\`Blocked by:\` names \`${b.target}\`, which is not a ticket file in ${relative(root, dir)}/`,
            fix: "write the file name of a ticket in the same folder, such as `01-login-form.md`, or `none`.",
          });
        }
      }
      edges.set(name, out);
    }
    for (const comp of components(names, edges)) {
      const self = comp.length === 1 && edges.get(comp[0])?.has(comp[0]);
      if (comp.length < 2 && !self) continue;
      const start = comp[0];
      const path = cyclePath(start, comp, edges);
      problems.push({
        path: relative(root, join(dir, start)),
        line: blockedByLine.get(start),
        rule: "cycle",
        message: self ? `\`${start}\` is blocked by itself` : `blocking cycle: ${path.join(" -> ")}`,
        fix: "remove one `Blocked by:` entry in the cycle, or merge those tickets into one.",
      });
    }
  }

  problems.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
  return { root, files, problems };
}

export function formatProblem(p) {
  return `${p.path}:${p.line}  ${p.rule}  ${p.message}  Fix: ${p.fix}`;
}

function main(argv) {
  let root;
  let max;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    }
    if (a === "--max") {
      const v = argv[++i];
      if (v === undefined || !/^[1-9]\d*$/.test(v)) {
        console.error(`tickets-lint: --max needs a whole number of 1 or more\n${USAGE}`);
        return 2;
      }
      max = Number(v);
      continue;
    }
    if (a.startsWith("-")) {
      console.error(`tickets-lint: unknown option ${a}\n${USAGE}`);
      return 2;
    }
    if (root !== undefined) {
      console.error(`tickets-lint: too many arguments\n${USAGE}`);
      return 2;
    }
    root = a;
  }
  let result;
  try {
    result = lint(root, { max });
  } catch (e) {
    console.error(`tickets-lint: ${e.message}${e instanceof TicketsLintError ? `\n${USAGE}` : ""}`);
    return 2;
  }
  for (const p of result.problems) console.log(formatProblem(p));
  console.log(`${result.files} ticket file(s) checked, ${result.problems.length} problem(s).`);
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
  process.exitCode = main(process.argv.slice(2));
}
