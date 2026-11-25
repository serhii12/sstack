#!/usr/bin/env node
// ticket-ready: checks that every blocker of one LOCAL ticket is closed.
//
// The ticket format is in skills/tickets/TICKET-FORMAT.md. The `Blocked by:` line says
// `none` or names ticket files, separated by commas. The line parser is the one in
// skills/tickets/scripts/tickets-lint.mjs. The checks are new code.
//
// Tracker tickets (GitHub, GitLab) are not read here. The `build` skill checks those by hand.
//
// The skill folder ships to projects. So this file runs from the project root as
//   node .claude/skills/build/scripts/ticket-ready.mjs <ticket file>
// In the stack repo, the path is skills/build/scripts/ticket-ready.mjs.
//
// A blocker name is a path that starts in the folder of the ticket file. A bare file name
// names a ticket in the same folder. A name with a folder part, such as `../other/01-a.md`,
// names a ticket in another folder.
//
// Exit codes:
//   0  ready: the ticket has no blocker, or every blocker has `Status: closed`
//   1  a blocker is open (its `Status:` line is missing or is not `closed`)
//   2  usage error
//   3  a blocker file is missing or cannot be read
//   4  the ticket file cannot be read, or its `Blocked by:` line is empty, mixed or repeated
//   5  the ticket has no `Blocked by:` line, so no check ran

import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/build/scripts/ticket-ready.mjs <ticket file>";
// The next three patterns match the forms that skills/tickets/scripts/tickets-lint.mjs accepts.
// A line can start with a list marker and can bold the key. The key is not case sensitive.
const BLOCKED_BY = /^\s*(?:[-*]\s+)?(?:\*\*)?Blocked by:(?:\*\*)?\s*(.*?)\s*$/i;
const STATUS = /^\s*(?:[-*]\s+)?(?:\*\*)?Status:(?:\*\*)?\s*(.*?)\s*$/i;
const NONE = /^none(?:\s*\([^)]*\))?\.?$/i;

export const EXIT = { READY: 0, OPEN: 1, USAGE: 2, BLOCKER_UNREADABLE: 3, TICKET_UNREADABLE: 4, NO_LINE: 5 };

/** Lines outside fenced code blocks, with their line numbers. */
function proseLines(text) {
  const raw = text.split(/\r?\n/);
  let inFence = false;
  const out = [];
  raw.forEach((t, i) => {
    if (/^\s*(```|~~~)/.test(t)) {
      inFence = !inFence;
      return;
    }
    if (!inFence) out.push({ n: i + 1, t });
  });
  return out;
}

/** One entry of a `Blocked by:` list, reduced to a path. */
function entryTarget(entry) {
  let e = entry.trim().replace(/^`+|`+$/g, "").trim();
  const link = e.match(/^\[[^\]]*\]\(([^)\s]+)\)$/);
  if (link) e = link[1];
  return e.replace(/^\.\//, "");
}

/**
 * Read the `Blocked by:` line of a ticket text.
 * Returns { kind: "none" | "list" | "missing" | "bad", blockers, why }.
 */
export function parseBlockedBy(text) {
  const lines = proseLines(text).filter((l) => BLOCKED_BY.test(l.t));
  if (lines.length === 0) return { kind: "missing", blockers: [], why: "" };
  if (lines.length > 1) return { kind: "bad", blockers: [], why: `the ticket has ${lines.length} \`Blocked by:\` lines (lines ${lines.map((l) => l.n).join(", ")})` };
  const value = lines[0].t.match(BLOCKED_BY)[1].trim();
  if (value === "") return { kind: "bad", blockers: [], why: `\`Blocked by:\` on line ${lines[0].n} is empty` };
  if (NONE.test(value)) return { kind: "none", blockers: [], why: "" };
  const blockers = [];
  for (const entry of value.split(/\s*,\s*/)) {
    const target = entryTarget(entry);
    if (target === "" || NONE.test(target)) {
      return { kind: "bad", blockers: [], why: `\`Blocked by:\` on line ${lines[0].n} mixes \`none\` or an empty entry with ticket names` };
    }
    blockers.push(target);
  }
  return { kind: "list", blockers, why: "" };
}

/** The value of the first `Status:` line outside code blocks, or null. */
export function parseStatus(text) {
  const l = proseLines(text).find((x) => STATUS.test(x.t));
  return l ? l.t.match(STATUS)[1].trim() : null;
}

/**
 * Check one ticket file. Returns { code, messages, closed }.
 * `messages` are lines in the form "<what failed>. Fix: <what to do>."
 */
export function checkTicket(ticketArg) {
  const ticketPath = resolve(ticketArg);
  let text;
  try {
    text = readFileSync(ticketPath, "utf8");
  } catch (e) {
    return {
      code: EXIT.TICKET_UNREADABLE,
      messages: [`Cannot read the ticket ${ticketPath} (${e.code ?? e.message}). Fix: pass the path of an existing ticket file.`],
      closed: 0,
    };
  }
  const parsed = parseBlockedBy(text);
  if (parsed.kind === "missing") {
    return {
      code: EXIT.NO_LINE,
      messages: [`The ticket ${ticketPath} has no \`Blocked by:\` line, so no blocker check ran. Fix: add \`Blocked by: none\` or the blocker file names.`],
      closed: 0,
    };
  }
  if (parsed.kind === "bad") {
    return {
      code: EXIT.TICKET_UNREADABLE,
      messages: [`Cannot read the blockers of ${ticketPath}: ${parsed.why}. Fix: keep one \`Blocked by:\` line with \`none\` or a comma-separated list of ticket files.`],
      closed: 0,
    };
  }
  const dir = dirname(ticketPath);
  const missing = [];
  const open = [];
  let closed = 0;
  for (const name of parsed.blockers) {
    const file = resolve(dir, name);
    let btext;
    try {
      btext = readFileSync(file, "utf8");
    } catch (e) {
      missing.push(`Blocker ${name} cannot be read at ${file} (${e.code ?? e.message}). Fix: correct the name, or run \`node .claude/skills/tickets/scripts/tickets-lint.mjs\`.`);
      continue;
    }
    const status = parseStatus(btext);
    if (status !== null && status.toLowerCase() === "closed") {
      closed++;
      continue;
    }
    const seen = status === null ? "it has no `Status:` line" : `its \`Status:\` line says \`${status}\``;
    open.push(`Blocker ${name} is still open, because ${seen}. Fix: build or close ${name}, then run this check again.`);
  }
  if (missing.length > 0) return { code: EXIT.BLOCKER_UNREADABLE, messages: [...missing, ...open], closed };
  if (open.length > 0) return { code: EXIT.OPEN, messages: open, closed };
  return { code: EXIT.READY, messages: [], closed };
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
    console.log(USAGE);
    return EXIT.READY;
  }
  if (argv.length !== 1 || argv[0].startsWith("-") || argv[0] === "") {
    console.error(`Usage error: this script needs exactly one ticket file path. Fix: run it as shown below.\n${USAGE}`);
    return EXIT.USAGE;
  }
  const r = checkTicket(argv[0]);
  for (const m of r.messages) console.error(m);
  if (r.code === EXIT.READY) {
    console.log(r.closed === 0 ? "Ready. The ticket has no blocker." : `Ready. ${r.closed} blocker(s) closed.`);
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
