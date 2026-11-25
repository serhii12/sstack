#!/usr/bin/env node
// spec-lint: checks a spec file written in the format of skills/spec/SPEC-FORMAT.md.
//
// The checks are new code. They enforce only what skills/spec/SKILL.md and
// SPEC-FORMAT.md state.
//
// Rules:
//   empty          the file is not empty
//   title          the first non-empty line is `# Spec: <feature>`
//   status         exactly one `Status:` line, and it reads `Status: draft`
//   ready-marker   no `ready-for-...` marker and no `Label:` line
//   section        every required section exists
//   duplicate-section  every required section exists only once
//   empty-section  every required section has content ("None" counts)
//   not-agreed     a line in an essential that starts with "Not agreed" reads
//                  exactly "Not agreed. See Open questions.", and it is the only
//                  line of the section. In "Test boundaries" the "Prior art:"
//                  line of the template can stay.
//   open-question  each such essential has an open question
//                  "<essential>: not agreed yet" under "Open questions"
//
// A UTF-8 byte order mark at the start of the file is ignored. A fenced code
// block closes only on a fence of the same character that is at least as long.
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/spec/scripts/spec-lint.mjs <spec-file>...
// In the stack repo it is skills/spec/scripts/spec-lint.mjs.
// Exit 0 clean, 1 problems found, 2 usage or read error.

import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/spec/scripts/spec-lint.mjs <spec-file>...";
const NOT_AGREED = "Not agreed. See Open questions.";

// Required sections, in the order of SPEC-FORMAT.md. `essential` is the name that
// the table in SKILL.md and the open question use.
const SECTIONS = [
  { level: 2, name: "Problem", essential: "Problem" },
  { level: 2, name: "Who it is for", essential: "Who it is for" },
  { level: 2, name: "Scope", bodyless: true },
  { level: 3, name: "In", essential: "In scope" },
  { level: 3, name: "Out", essential: "Out of scope" },
  { level: 2, name: "User stories" },
  { level: 2, name: "User-visible behavior", essential: "User-visible behavior" },
  { level: 2, name: "Test boundaries", essential: "Test boundaries" },
  { level: 2, name: "Decisions" },
  { level: 2, name: "Assumed without asking" },
  { level: 2, name: "Open questions" },
  { level: 2, name: "Glossary terms and decision records" },
];

export class SpecLintError extends Error {}

/**
 * Lines with a flag for "inside a fenced code block". Fence lines themselves count as inside.
 * A fence opens with 3 or more backticks or tildes. It closes only on a line of the same
 * character, at least as long, with nothing after it. So a ``` line inside a ~~~ block stays code.
 */
function scan(text) {
  const raw = text.split(/\r?\n/);
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

const MARKER_LINE = /^(?:[-*+]\s+)?[*_]*not agreed\b/i;

/** Check the text of one spec. Returns an array of { line, rule, message, fix }. */
export function checkSpec(input) {
  const problems = [];
  const add = (line, rule, message, fix) => problems.push({ line, rule, message, fix });
  const text = String(input).replace(/^\uFEFF/, "");

  if (text.trim() === "") {
    add(1, "empty", "the spec file is empty", "write the spec in the format of SPEC-FORMAT.md, starting with `# Spec: <feature>`.");
    return problems;
  }

  const lines = scan(text);
  const prose = lines.filter((l) => !l.fence);

  // title
  const first = lines.find((l) => l.t.trim() !== "");
  if (!first || !/^#\s+Spec:\s*\S/.test(first.t)) {
    add(first ? first.n : 1, "title", "the first line is not `# Spec: <feature>`", "make the first line `# Spec: <feature>`.");
  }

  // status
  const statusLines = prose.filter((l) => /^\s*(?:[-*]\s+)?(?:\*\*)?Status:/i.test(l.t));
  if (statusLines.length === 0) {
    add(1, "status", "no `Status: draft` line", "add the line `Status: draft` below the title.");
  } else {
    for (const l of statusLines) {
      if (!/^Status:\s*draft$/.test(l.t.trim())) {
        add(l.n, "status", `the status line reads \`${l.t.trim()}\`, and the status must be \`draft\``, "replace the line with `Status: draft`. Only the user marks a spec ready, by hand.");
      }
    }
    for (const extra of statusLines.slice(1)) {
      add(extra.n, "status", `more than one \`Status:\` line (the first is on line ${statusLines[0].n})`, "keep one `Status: draft` line and delete the others.");
    }
  }

  // ready markers
  for (const l of prose) {
    const marker = l.t.match(/\bready-for-[a-z0-9-]+/i);
    if (marker) {
      add(l.n, "ready-marker", `the spec has the marker \`${marker[0]}\``, "delete the marker. An agent must add no label. Only the user marks a spec ready.");
    } else if (/^\s*(?:[-*]\s+)?(?:\*\*)?Labels?:/i.test(l.t)) {
      add(l.n, "ready-marker", "the spec has a label line", "delete the label line. An agent must add no label.");
    }
  }

  // sections
  const headings = prose
    .map((l) => {
      const m = l.t.match(/^(#{2,3})\s+(.*?)\s*#*\s*$/);
      return m ? { n: l.n, level: m[1].length, name: m[2] } : null;
    })
    .filter(Boolean);
  const anyHeading = prose
    .map((l) => (/^#{1,6}\s/.test(l.t) ? l.n : null))
    .filter((n) => n !== null);

  const found = new Map();
  for (const s of SECTIONS) {
    const marks = "#".repeat(s.level);
    const all = headings.filter((x) => x.level === s.level && x.name.toLowerCase() === s.name.toLowerCase());
    const h = all[0];
    if (!h) {
      add(1, "section", `no \`${marks} ${s.name}\` section`, `add the section \`${marks} ${s.name}\` as SPEC-FORMAT.md shows.`);
      continue;
    }
    for (const extra of all.slice(1)) {
      add(extra.n, "duplicate-section", `a second \`${marks} ${s.name}\` section (the first is on line ${h.n})`, "keep one section with this name and move its content into it.");
    }
    const end = anyHeading.find((n) => n > h.n) ?? Infinity;
    const body = lines.filter((l) => l.n > h.n && l.n < end);
    const content = body.filter((l) => l.t.trim() !== "");
    found.set(s.name, { s, h, content });
    if (!s.bodyless && content.length === 0) {
      add(h.n, "empty-section", `the section \`${s.name}\` is empty`, "fill it from the agreed plan, or write `None` when the user said so. For an essential the plan did not settle, write `Not agreed. See Open questions.`");
    }
  }

  // open questions
  const oq = found.get("Open questions");
  const questions = oq ? oq.content.map((l) => l.t).join("\n").toLowerCase() : "";

  for (const { s, h, content } of found.values()) {
    if (!s.essential || content.length === 0) continue;
    const texts = content.map((l) => l.t.trim());
    const markers = texts.filter((t) => MARKER_LINE.test(t));
    if (markers.length === 0) continue;
    const rest = texts.filter((t) => !MARKER_LINE.test(t) && !(s.name === "Test boundaries" && /^Prior art:/i.test(t)));
    const exact = markers.length === 1 && markers[0] === NOT_AGREED && rest.length === 0;
    if (!exact) {
      const extra = s.name === "Test boundaries" ? " The `Prior art:` line can stay." : "";
      add(h.n, "not-agreed", `the section \`${s.name}\` says "not agreed" but does not read only \`${NOT_AGREED}\``, `make the whole section read exactly \`${NOT_AGREED}\`.${extra}`);
    }
    if (exact && oq && !questions.includes(`${s.essential.toLowerCase()}: not agreed yet`)) {
      add(h.n, "open-question", `the section \`${s.name}\` is not agreed, and \`Open questions\` has no question for it`, `add the open question \`${s.essential}: not agreed yet\` under \`## Open questions\`.`);
    }
  }

  problems.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return problems;
}

/** Check files. Returns { files, problems: [{ path, line, rule, message, fix }] }. */
export function lint(paths) {
  const problems = [];
  for (const p of paths) {
    let text;
    try {
      text = readFileSync(resolve(p), "utf8");
    } catch (e) {
      throw new SpecLintError(`cannot read ${p}: ${e.message}`);
    }
    for (const q of checkSpec(text)) problems.push({ path: p, ...q });
  }
  return { files: paths.length, problems };
}

export function formatProblem(p) {
  return `${p.path}:${p.line}  ${p.rule}  ${p.message}  Fix: ${p.fix}`;
}

function main(argv) {
  const paths = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      return 0;
    }
    if (a.startsWith("-")) {
      console.error(`spec-lint: unknown option ${a}\n${USAGE}`);
      return 2;
    }
    paths.push(a);
  }
  if (paths.length === 0) {
    console.error(`spec-lint: no spec file given\n${USAGE}`);
    return 2;
  }
  let result;
  try {
    result = lint(paths);
  } catch (e) {
    console.error(`spec-lint: ${e.message}${e instanceof SpecLintError ? `\n${USAGE}` : ""}`);
    return 2;
  }
  for (const p of result.problems) console.log(formatProblem(p));
  console.log(`${result.files} spec file(s) checked, ${result.problems.length} problem(s).`);
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
