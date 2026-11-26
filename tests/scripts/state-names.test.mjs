// state-names: the state names and exit codes in skill text must equal the lists that the scripts export.
//
// A state machine in this stack has its names in two places: a list that a script exports, and the
// Markdown that tells the agent or the user what each name means. This test reads the Markdown as text
// and compares the names only. It never checks a move that a person makes. Each failure names the
// Markdown file and the script, and the words that only one of them has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as evidence from "../../skills/prove/scripts/evidence-check.mjs";
import * as triage from "../../skills/triage/scripts/triage-check.mjs";
import * as ticketReady from "../../skills/build/scripts/ticket-ready.mjs";
import * as ticketsLint from "../../skills/tickets/scripts/tickets-lint.mjs";
import * as landCheck from "../../skills/land/scripts/land-check.mjs";
import * as landWait from "../../skills/land/scripts/land-wait.mjs";
import * as landLib from "../../skills/land/scripts/land-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// Markdown helpers. They read text only.
// ---------------------------------------------------------------------------

/** The lines of a text, each with a flag that says if it is inside a fenced code block. */
function scan(text) {
  let fence = null;
  return text.split("\n").map((t) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(t);
    if (m && (fence === null || m[1][0] === fence[0])) {
      fence = fence === null ? m[1] : null;
      return { t, fence: true };
    }
    return { t, fence: fence !== null };
  });
}

/** The text below the first heading that starts with `heading`, up to the next heading of the same level or higher. */
function section(text, heading, file) {
  const level = /^#+/.exec(heading)[0].length;
  const lines = scan(text);
  const start = lines.findIndex((l) => !l.fence && l.t.startsWith(heading));
  assert.ok(start >= 0, `${file} has no heading that starts with "${heading}"`);
  const out = [];
  for (const l of lines.slice(start + 1)) {
    const m = /^(#+)\s/.exec(l.t);
    if (!l.fence && m && m[1].length <= level) break;
    out.push(l.t);
  }
  return out.join("\n");
}

/** The body rows of the Markdown tables in a text, as arrays of trimmed cells. */
function tableRows(text) {
  const rows = [];
  let header = true;
  for (const l of scan(text)) {
    if (l.fence || !l.t.trim().startsWith("|")) {
      header = true;
      continue;
    }
    const cells = l.t.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (header) {
      header = false;
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

/** The first fenced code block of a text, without its fence lines. */
function firstFence(text, file) {
  const lines = scan(text);
  const start = lines.findIndex((l) => l.fence);
  assert.ok(start >= 0, `${file} has no fenced block where the test expects one`);
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (!l.fence || /^\s*(`{3,}|~{3,})/.test(l.t)) break;
    out.push(l.t);
  }
  return out.join("\n");
}

const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
/** The inline code spans of a text, line by line, outside fenced blocks. */
const proseTicks = (text) => scan(text).filter((l) => !l.fence).flatMap((l) => ticks(l.t));
const list = (xs) => (xs.length ? xs.map((x) => `"${x}"`).join(", ") : "nothing");

/** Fail with both names when the text and the script do not name the same set. */
function sameNames(actual, expected, where, owner) {
  const a = new Set(actual);
  const e = new Set(expected);
  const onlyText = [...a].filter((x) => !e.has(x));
  const onlyCode = [...e].filter((x) => !a.has(x));
  if (onlyText.length || onlyCode.length) {
    assert.fail(`${where} and ${owner} do not name the same values. Only in ${where}: ${list(onlyText)}. Only in ${owner}: ${list(onlyCode)}. Fix: change both in the same commit.`);
  }
}

/** The codes of an exit cell: "0", "2, 3" or "30 to 34". */
function codes(cell) {
  const range = /^(\d+) to (\d+)$/.exec(cell.trim());
  if (range) {
    const out = [];
    for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(n);
    return out;
  }
  return cell.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n));
}

/** The words of a cell that lists states: "pass, merged" gives both. Text in parentheses is a note. */
const stateWords = (cell) => cell.replace(/\([^)]*\)/g, "").split(",").map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Evidence levels and the evidence index (prove)
// ---------------------------------------------------------------------------

const EVIDENCE = "skills/prove/scripts/evidence-check.mjs";

test("T4: every text that lists the evidence levels names the LEVELS of evidence-check.mjs", () => {
  const start = read("skills/start/SKILL.md");
  const table = tableRows(section(start, "## Evidence levels", "skills/start/SKILL.md")).map((r) => ticks(r[0])[0]);
  sameNames(table, evidence.LEVELS, "skills/start/SKILL.md (## Evidence levels)", `LEVELS in ${EVIDENCE}`);
  const types = tableRows(section(start, "## Task types", "skills/start/SKILL.md")).map((r) => ticks(r[2])[0]);
  for (const level of types) assert.ok(evidence.LEVELS.includes(level), `skills/start/SKILL.md (## Task types) names the level "${level}", and LEVELS in ${EVIDENCE} does not have it`);
  const note = /^Evidence level: <(.+)>$/m.exec(section(start, "## Handoff note", "skills/start/SKILL.md"));
  assert.ok(note, "skills/start/SKILL.md has no `Evidence level: <...>` line in the note template");
  sameNames(note[1].split("|").map((x) => x.trim()), evidence.LEVELS, "skills/start/SKILL.md (note template)", `LEVELS in ${EVIDENCE}`);
  const prove = tableRows(section(read("skills/prove/SKILL.md"), "## 2.", "skills/prove/SKILL.md")).map((r) => ticks(r[0])[0]);
  sameNames(prove, evidence.LEVELS, "skills/prove/SKILL.md (step 2)", `LEVELS in ${EVIDENCE}`);
});

/** The backticked values of one field bullet of INDEX-FORMAT.md, such as "- `status`: `pass`, `fail` or `untested`." */
function fieldValues(field) {
  const line = read("skills/prove/INDEX-FORMAT.md").split("\n").find((l) => l.startsWith(`- \`${field}\`:`));
  assert.ok(line, `skills/prove/INDEX-FORMAT.md has no "- \`${field}\`:" line`);
  return ticks(line.slice(line.indexOf(":") + 1).split(/\.\s/)[0]);
}

test("T4, T5: the field lines of INDEX-FORMAT.md name the lists of evidence-check.mjs", () => {
  const where = (f) => `skills/prove/INDEX-FORMAT.md (\`${f}\`)`;
  sameNames(fieldValues("level"), evidence.LEVELS, where("level"), `LEVELS in ${EVIDENCE}`);
  sameNames(fieldValues("status"), evidence.STATUSES, where("status"), `STATUSES in ${EVIDENCE}`);
  sameNames(fieldValues("verdict"), evidence.VERDICTS, where("verdict"), `VERDICTS in ${EVIDENCE}`);
  sameNames(fieldValues("reviewer"), evidence.REVIEWERS, where("reviewer"), `REVIEWERS in ${EVIDENCE}`);
});

test("T6: start and the AGENTS.md template list the same task types, and each word of the note starts one type", () => {
  const start = read("skills/start/SKILL.md");
  const startTypes = tableRows(section(start, "## Task types", "skills/start/SKILL.md")).map((r) => r[0]);
  const agentTypes = tableRows(section(read("templates/AGENTS.md"), "## Task types", "templates/AGENTS.md")).map((r) => r[0]);
  sameNames(startTypes, agentTypes, "skills/start/SKILL.md (## Task types)", "templates/AGENTS.md (## Task types)");
  const note = /^Task type: <(.+)>$/m.exec(section(start, "## Handoff note", "skills/start/SKILL.md"));
  assert.ok(note, "skills/start/SKILL.md has no `Task type: <...>` line in the note template");
  const words = note[1].split("|").map((x) => x.trim().toLowerCase());
  assert.equal(words.length, startTypes.length, `skills/start/SKILL.md: the note names ${words.length} task types and the table names ${startTypes.length}`);
  for (const w of words) {
    const hits = startTypes.filter((t) => t.toLowerCase().startsWith(w));
    assert.equal(hits.length, 1, `skills/start/SKILL.md: the note word "${w}" must start exactly one type of the table. It starts ${list(hits)}`);
  }
});

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

const TRIAGE = "skills/triage/scripts/triage-check.mjs";
const priorityRange = (text) => {
  const m = /`P(\d)` to `P(\d)`/.exec(text);
  if (!m) return [];
  const out = [];
  for (let n = Number(m[1]); n <= Number(m[2]); n++) out.push(`P${n}`);
  return out;
};

test("T7: the label tables of triage and friction name the CATEGORIES, STATES and PRIORITIES of triage-check.mjs", () => {
  const skill = read("skills/triage/SKILL.md");
  const rows = tableRows(skill).filter((r) => ["category", "state", "priority"].includes(r[1]));
  const of = (role) => rows.filter((r) => r[1] === role).flatMap((r) => (role === "priority" ? priorityRange(r[0]) : ticks(r[0])));
  sameNames(of("category"), triage.CATEGORIES, "skills/triage/SKILL.md (label table)", `CATEGORIES in ${TRIAGE}`);
  sameNames(of("state"), triage.STATES, "skills/triage/SKILL.md (label table)", `STATES in ${TRIAGE}`);
  sameNames(of("priority"), triage.PRIORITIES, "skills/triage/SKILL.md (label table)", `PRIORITIES in ${TRIAGE}`);
  const category = /Category: <(.+)>/.exec(skill);
  assert.ok(category, "skills/triage/SKILL.md has no `Category: <...>` line");
  sameNames(category[1].split("|").map((x) => x.trim()), triage.CATEGORIES, "skills/triage/SKILL.md (Category line)", `CATEGORIES in ${TRIAGE}`);

  const roles = section(read("skills/triage/TRACKERS.md"), "## Labels on every tracker", "skills/triage/TRACKERS.md").split(/\.\s/)[0];
  sameNames(ticks(roles).filter((x) => !/^P\d$/.test(x)), [...triage.CATEGORIES, ...triage.STATES], "skills/triage/TRACKERS.md (Labels on every tracker)", `CATEGORIES and STATES in ${TRIAGE}`);
  sameNames(priorityRange(roles), triage.PRIORITIES, "skills/triage/TRACKERS.md (Labels on every tracker)", `PRIORITIES in ${TRIAGE}`);

  const friction = tableRows(read("skills/friction/SKILL.md")).map((r) => ticks(r[0])[0]).filter((x) => /^P\d$/.test(x ?? ""));
  sameNames(friction, triage.PRIORITIES, "skills/friction/SKILL.md (priority table)", `PRIORITIES in ${TRIAGE}`);
});

test("T8: the exit codes in TRACKERS.md are the EXIT values of triage-check.mjs", () => {
  const text = section(read("skills/triage/TRACKERS.md"), "## Exit codes of the check", "skills/triage/TRACKERS.md");
  const named = [...text.matchAll(/^- (\d+):/gm)].map((m) => Number(m[1]));
  sameNames(named, Object.values(triage.EXIT), "skills/triage/TRACKERS.md (Exit codes of the check)", `EXIT in ${TRIAGE}`);
});

// ---------------------------------------------------------------------------
// Tickets: the blocker line and the close contract
// ---------------------------------------------------------------------------

/** The local ticket template of TICKET-FORMAT.md, with its placeholders filled in. */
function ticketTemplate() {
  const text = firstFence(section(read("skills/tickets/TICKET-FORMAT.md"), "## Local file", "skills/tickets/TICKET-FORMAT.md"), "skills/tickets/TICKET-FORMAT.md");
  return text.replace("<Ticket title>", "Export the orders").replace(/<[^>]+>/g, "behavior");
}

test("T10: the blocker line of the ticket template reads as no blocker in every script that reads it", () => {
  const ticket = ticketTemplate();
  const line = ticket.split("\n").find((l) => l.startsWith("Blocked by:"));
  assert.ok(line, "skills/tickets/TICKET-FORMAT.md: the local template has no `Blocked by:` line");
  assert.equal(ticketReady.parseBlockedBy(ticket).kind, "none", `skills/build/scripts/ticket-ready.mjs does not read "${line}" of skills/tickets/TICKET-FORMAT.md as no blocker`);
  const lint = ticketsLint.checkTicket("01-export-the-orders.md", ticket).problems.filter((p) => p.rule === "blocked-by");
  assert.deepEqual(lint, [], `skills/tickets/scripts/tickets-lint.mjs refuses "${line}" of skills/tickets/TICKET-FORMAT.md`);
  const report = ["# Cart total is wrong", "", "Status: open", "Labels: bug, ready-for-agent", line, "", "The total is wrong.", "", "## Comments", "", triage.AI_LINE, "", "## Agent Brief", "", "Category: bug", "", "### Acceptance checks", "", "- [ ] The total is 36.", ""].join("\n");
  const problems = triage.checkIssue(triage.localIssue("r.md", report, ROOT)).filter((p) => p.rule === "blocked-by");
  assert.deepEqual(problems, [], `${TRIAGE} refuses "${line}" of skills/tickets/TICKET-FORMAT.md in a local report`);
});

test("T10: every text that tells the agent how to write no blocker in triage gives the form that tickets use", () => {
  const form = "None (can start immediately)";
  const bare = /\b(?:says|with|add|write)\s+`(?:Blocked by: )?none`/i;
  for (const file of ["skills/triage/TRACKERS.md", TRIAGE]) {
    const hit = read(file).split("\n").find((l) => bare.test(l));
    assert.equal(hit, undefined, `${file} tells the agent to write a bare \`none\`. Write \`${form}\`, the form of skills/tickets/TICKET-FORMAT.md: ${hit}`);
  }
  const line = read("skills/triage/TRACKERS.md").split("\n").find((l) => l.startsWith("- `ready-for-agent`:"));
  assert.ok(line?.includes(`\`${form}\``), `skills/triage/TRACKERS.md: the ready-for-agent line must name \`${form}\``);
});

test("T9: the Status words of local reports, tickets and the local tracker are the REPORT_STATUSES of triage-check.mjs", () => {
  const trackers = read("skills/triage/TRACKERS.md");
  const rule = trackers.split("\n").find((l) => l.startsWith("The `Status:` line says only"));
  assert.ok(rule, "skills/triage/TRACKERS.md has no line \"The `Status:` line says only ...\"");
  sameNames(ticks(rule.split(/\.\s/)[0]).filter((t) => t !== "Status:"), triage.REPORT_STATUSES, "skills/triage/TRACKERS.md (Status rule)", `REPORT_STATUSES in ${TRIAGE}`);
  const values = [
    ["skills/triage/TRACKERS.md (report template)", firstFence(section(trackers, "## Local files", "skills/triage/TRACKERS.md"), "skills/triage/TRACKERS.md")],
    ["skills/tickets/TICKET-FORMAT.md (local template)", ticketTemplate()],
  ].flatMap(([where, text]) => [...text.matchAll(/^Status: (\S+)$/gm)].map((m) => [where, m[1]]));
  for (const t of proseTicks(read("skills/setup/tracker/local.md")).filter((x) => /^Status: \S+$/.test(x))) values.push(["skills/setup/tracker/local.md", t.slice("Status: ".length)]);
  assert.ok(values.length >= 3, "the test found fewer than three Status lines to check");
  for (const [where, v] of values) assert.ok(triage.REPORT_STATUSES.includes(v), `${where} writes "Status: ${v}", and REPORT_STATUSES in ${TRIAGE} has no "${v}"`);
});

test("T11: the close line of build and the text of close-ticket read back as built, closed and merged", () => {
  const build = read("skills/build/SKILL.md");
  const close = proseTicks(build).find((t) => t.startsWith("Built on branch"));
  assert.ok(close, "skills/build/SKILL.md names no `Built on branch ...` close line");
  const filled = close.replace("<branch>", "agent/export-1a2").replace("<short sha>", "abc1234");
  assert.deepEqual(ticketReady.parseBuilt(`## Comments\n${filled}\n`), { branch: "agent/export-1a2", commit: "abc1234" }, `skills/build/scripts/ticket-ready.mjs cannot read the close line of skills/build/SKILL.md: "${close}"`);
  const merged = landCheck.closeTicketText(ticketTemplate(), { pr: 7, sha: "f".repeat(40) });
  assert.equal(ticketReady.parseStatus(merged), "closed", "the text of land-check.mjs close-ticket does not read as closed in ticket-ready.mjs");
  assert.equal(ticketReady.saysMerged(merged), true, "the text of land-check.mjs close-ticket has no `Merged` line that ticket-ready.mjs reads");
  const byHand = section(read("skills/land/REFERENCE.md"), "## Without gh", "skills/land/REFERENCE.md");
  const line = proseTicks(byHand).find((t) => /^Merged\b/.test(t));
  assert.ok(line, "skills/land/REFERENCE.md (Without gh) gives no `Merged ...` line for a local ticket");
  assert.equal(ticketReady.saysMerged(`## Comments\n${line}\n`), true, `skills/build/scripts/ticket-ready.mjs does not read "${line}" of skills/land/REFERENCE.md as merged`);
});

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const LAND_CHECK = "skills/land/scripts/land-check.mjs";
const PEER = "skills/peer-review/SKILL.md";

test("T12: the findings template of peer-review parses, and its status words are the FINDING_STATES of land-check.mjs", () => {
  const step = section(read(PEER), "## 5.", PEER);
  const template = firstFence(step, PEER).replace("<sha>", "1111111").replace("<head sha>", "2222222");
  const r = landCheck.parseReview(template);
  assert.equal(r.ranges.length, 1, `${LAND_CHECK} reads ${r.ranges.length} ranges in the template of ${PEER}`);
  assert.deepEqual(r.ranges[0], { start: "1111111", end: "2222222" }, `${LAND_CHECK} cannot read the Range line of the template of ${PEER}`);
  assert.equal(r.findings.length, 1, `${LAND_CHECK} reads ${r.findings.length} findings in the template of ${PEER}`);
  assert.equal(r.findings[0].open, true, `the template finding of ${PEER} must read as open`);
  const statuses = proseTicks(step).filter((t) => t.startsWith("Status: ")).map((t) => t.slice("Status: ".length));
  sameNames(statuses, Object.keys(landCheck.FINDING_STATES), `${PEER} (step 5)`, `FINDING_STATES in ${LAND_CHECK}`);
  for (const s of statuses.filter((x) => x !== "open")) {
    const closed = landCheck.parseReview(template.replace("Status: open", `Status: ${s.replace("<reason>", "the user agreed")}`));
    assert.equal(closed.findings[0].open, false, `${LAND_CHECK} does not read "Status: ${s}" of ${PEER} as closed`);
  }
});

test("T12: the severity words of peer-review are the SEVERITIES of land-check.mjs, and each one parses", () => {
  const step = section(read(PEER), "## 5.", PEER);
  const template = firstFence(step, PEER);
  const line = /^Severity: (.+)$/m.exec(template);
  assert.ok(line, `${PEER}: the findings template has no Severity line`);
  sameNames(line[1].split("|").map((x) => x.trim()), landCheck.SEVERITIES, `${PEER} (template Severity line)`, `SEVERITIES in ${LAND_CHECK}`);
  const rule = scan(step).find((l) => !l.fence && l.t.includes("`Severity:` value"));
  assert.ok(rule, `${PEER}: step 5 has no sentence that lists the \`Severity:\` values`);
  sameNames(ticks(rule.t).filter((t) => t !== "Severity:"), landCheck.SEVERITIES, `${PEER} (step 5 severity sentence)`, `SEVERITIES in ${LAND_CHECK}`);
  for (const s of landCheck.SEVERITIES) {
    const r = landCheck.parseReview(template.replace(/^Severity: .+$/m, `Severity: ${s}`));
    assert.equal(r.findings[0].severity, s, `${LAND_CHECK} does not read "Severity: ${s}" of ${PEER}`);
  }
});

test("T17: the land report uses the words of the scripts for checks, acceptance checks and the review", () => {
  const report = firstFence(section(read(LAND_SKILL), "## 9.", LAND_SKILL), LAND_SKILL);
  const words = (key) => {
    const m = new RegExp(`^${key}: <[^>]+>: (.+?)(?: \\(one per line\\))?$`, "m").exec(report);
    assert.ok(m, `${LAND_SKILL}: the report has no "${key}: <...>: ..." line`);
    return m[1].split("|").map((x) => x.trim());
  };
  sameNames(words("Checks"), landLib.CHECK_STATES.filter((x) => x !== "none"), `${LAND_SKILL} (report Checks line)`, "CHECK_STATES in skills/land/scripts/land-lib.mjs, without none");
  sameNames(words("Acceptance checks"), evidence.STATUSES, `${LAND_SKILL} (report Acceptance checks line)`, `STATUSES in ${EVIDENCE}`);
  const review = /^Review: ([^.]+)\./m.exec(report);
  assert.ok(review, `${LAND_SKILL}: the report has no Review line`);
  if (!review[1].includes("<")) sameNames(review[1].split("|").map((x) => x.trim()), REVIEW_STATE_NAMES, `${LAND_SKILL} (report Review line)`, `REVIEW_STATES in ${LAND_CHECK}`);
});

// ---------------------------------------------------------------------------
// The land gate, the watcher and the run
// ---------------------------------------------------------------------------

const LAND_REF = "skills/land/REFERENCE.md";
const LAND_SKILL = "skills/land/SKILL.md";
const LAND_WAIT = "skills/land/scripts/land-wait.mjs";
const REVIEW_STATE_NAMES = Object.keys(landCheck.REVIEW_STATES);

/** Every gate state that one exit code can give, over each merge result and each review state. */
function gateStatesOf(code) {
  const out = new Set();
  for (const merged of [false, true]) for (const rs of REVIEW_STATE_NAMES) out.add(landCheck.gateState(code, merged, rs));
  return [...out];
}

test("T13: the land-check exit table of REFERENCE.md has one row per EXIT value, with the state of gateState()", () => {
  const rows = tableRows(section(read(LAND_REF), "## Exit codes of land-check.mjs", LAND_REF));
  const seen = [];
  for (const [exit, , state] of rows) {
    for (const code of codes(exit)) {
      seen.push(code);
      sameNames(stateWords(state), gateStatesOf(code), `${LAND_REF} (exit ${code}, State column)`, `gateState() in ${LAND_CHECK}`);
    }
  }
  sameNames(seen.map(String), Object.values(landCheck.EXIT).map(String), `${LAND_REF} (Exit codes of land-check.mjs)`, `EXIT in ${LAND_CHECK}`);
  const step8 = section(read(LAND_SKILL), "## 8.", LAND_SKILL);
  for (const m of step8.matchAll(/^- Exit (\d+):/gm)) assert.ok(Object.values(landCheck.EXIT).includes(Number(m[1])), `${LAND_SKILL} (step 8) names exit ${m[1]}, and EXIT in ${LAND_CHECK} has no such code`);
});

test("T13: the gate state says who acts next: the user for open findings, and nobody in land for a failed acceptance check", () => {
  assert.equal(landCheck.gateState(landCheck.EXIT.reviewStale, false, "open-findings"), "needs-person");
  for (const rs of REVIEW_STATE_NAMES.filter((x) => x !== "open-findings" && x !== "fresh")) assert.equal(landCheck.gateState(landCheck.EXIT.reviewStale, false, rs), "fix", rs);
  assert.equal(landCheck.gateState(landCheck.EXIT.reviewStale), "fix");
  assert.equal(landCheck.gateState(landCheck.EXIT.acceptanceFailed), "stopped");
  assert.equal(landCheck.gateState(landCheck.EXIT.checkFailed), "fix");
});

test("T14: the watcher exit tables name the codes, names and kept flags of OUTCOMES in land-wait.mjs", () => {
  const rows = tableRows(section(read(LAND_REF), "## Exit codes of land-wait.mjs", LAND_REF));
  const seen = [];
  for (const [exit, name, , kept] of rows) {
    for (const code of codes(exit)) {
      seen.push(code);
      const o = landWait.OUTCOMES[code];
      if (!name) continue;
      assert.ok(o, `${LAND_REF} names the watcher exit ${code} "${name}", and OUTCOMES in ${LAND_WAIT} has no such code`);
      assert.equal(name, o.name, `${LAND_REF} names the watcher exit ${code} "${name}", and OUTCOMES in ${LAND_WAIT} names it "${o.name}"`);
      assert.equal(kept === "Yes", o.kept, `${LAND_REF} says that exit ${code} is kept "${kept}", and OUTCOMES in ${LAND_WAIT} says kept: ${o.kept}`);
    }
  }
  sameNames(seen.map(String), Object.values(landWait.EXIT).map(String), `${LAND_REF} (Exit codes of land-wait.mjs)`, `EXIT in ${LAND_WAIT}`);
  for (const code of Object.keys(landWait.OUTCOMES)) assert.ok(seen.includes(Number(code)), `OUTCOMES in ${LAND_WAIT} has exit ${code}, and ${LAND_REF} has no row for it`);
  const step6 = tableRows(section(read(LAND_SKILL), "## 6.", LAND_SKILL)).flatMap((r) => codes(r[0]));
  sameNames(step6.map(String), Object.values(landWait.EXIT).map(String), `${LAND_SKILL} (step 6 table)`, `EXIT in ${LAND_WAIT}`);
});

/** The gate state that each run state of REFERENCE.md stands for. */
const RUN_TO_GATE = { merged: "merged", reviewing: "fix", "needs-person": "needs-person", waiting: "wait", fixing: "fix", stopped: "stopped" };

/** The groups of a "Leaves to" cell: "fixing (gate 12, 17)" gives { to: "fixing", gate: true, codes: [12, 17], note }. */
function leaves(cell) {
  return [...cell.matchAll(/([a-z][a-z-]*)(?: \(([^)]*)\))?(?:,|$)/g)].map((m) => ({
    to: m[1], gate: /^gate\b/.test(m[2] ?? ""), codes: [...(m[2] ?? "").matchAll(/\d+/g)].map((x) => Number(x[0])), note: m[2] ?? "",
  }));
}

/** The run states of REFERENCE.md: [{ state, leaves }]. */
const runStates = () => tableRows(section(read(LAND_REF), "## States of a land run", LAND_REF)).map(([state, , to]) => ({ state, leaves: leaves(to) }));

test("T15: the moves of a land run agree with gateState() of land-check.mjs and the exits of land-wait.mjs", () => {
  const runs = runStates();
  const names = runs.map((r) => r.state);
  for (const r of runs) {
    for (const g of r.leaves) {
      if (g.to !== "end") assert.ok(names.includes(g.to), `${LAND_REF}: the run state "${r.state}" leaves to "${g.to}", and the table has no such state`);
      if (!g.gate) continue;
      for (const code of g.codes) {
        const want = RUN_TO_GATE[g.to];
        const got = landCheck.gateState(code, g.to === "merged", g.to === "needs-person" ? "open-findings" : "stale");
        assert.equal(got, want, `${LAND_REF}: "${r.state}" leaves to "${g.to}" on gate ${code}, so the gate state must be "${want}". gateState() in ${LAND_CHECK} gives "${got}"`);
      }
    }
  }
  const waiting = runs.find((r) => r.state === "waiting");
  assert.ok(waiting, `${LAND_REF} has no run state "waiting"`);
  const watched = waiting.leaves.filter((g) => !g.gate).flatMap((g) => g.codes);
  const stops = Object.values(landWait.EXIT).filter((c) => c !== landWait.EXIT.usage && c !== landWait.EXIT.data);
  sameNames(watched.map(String), stops.map(String), `${LAND_REF} (the moves of "waiting")`, `EXIT in ${LAND_WAIT}`);
});

test("T16: each table that REFERENCE.md names is an export of the script that it names", () => {
  const line = read(LAND_REF).split("\n").find((l) => l.startsWith("The scripts hold these tables:"));
  assert.ok(line, `${LAND_REF} has no line "The scripts hold these tables:"`);
  const modules = { "land-check.mjs": landCheck, "land-wait.mjs": landWait, "land-lib.mjs": landLib };
  let pending = [];
  for (const t of ticks(line.split(/\.\s/)[0])) {
    if (!t.endsWith(".mjs")) {
      pending.push(t);
      continue;
    }
    assert.ok(modules[t], `${LAND_REF} names the script ${t}, and this test does not import it`);
    for (const name of pending) assert.ok(name in modules[t], `${LAND_REF} says that ${t} holds ${name}, and skills/land/scripts/${t} does not export it`);
    pending = [];
  }
  assert.deepEqual(pending, [], `${LAND_REF} names ${list(pending)} with no script after them`);
});

// ---------------------------------------------------------------------------
// Grill and decision records
// ---------------------------------------------------------------------------

test("T18: spec reads the two status lines that grill writes", () => {
  const grill = read("skills/grill/SKILL.md");
  const spec = read("skills/spec/SKILL.md");
  for (const value of ["WAITING FOR YOUR CONFIRMATION", "CONFIRMED by the user"]) {
    assert.ok(grill.includes(`Status: ${value}`), `skills/grill/SKILL.md does not write "Status: ${value}"`);
    assert.ok(spec.includes(value), `skills/spec/SKILL.md does not read "${value}", the status that skills/grill/SKILL.md writes`);
  }
});

test("T20: a planned fence names a path that the installer can copy: inside the skill folder, or a test of this repo", () => {
  const skills = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  let seen = 0;
  for (const name of skills) {
    for (const e of readdirSync(join(ROOT, "skills", name), { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const file = join(e.parentPath, e.name).slice(ROOT.length + 1);
      for (const m of read(file).matchAll(/No fence yet \(planned: ([^)]+)\)/g)) {
        const target = m[1].trim();
        if (!/^[\w.-]+(?:\/[\w.-]+)+$/.test(target)) continue;
        seen++;
        assert.ok(target.startsWith(`skills/${name}/`) || target.startsWith("tests/"), `${file} plans the fence ${target}. The installer copies only skill folders, so plan it under skills/${name}/ or tests/`);
      }
    }
  }
  assert.ok(seen > 0, "the test found no planned fence with a path");
});

test("T19: the three files that list the forms of a decision record status agree", () => {
  const forms = (text) => [...text.matchAll(/\*\*Status:\*\* (proposed|accepted|superseded by NNNN)/g)].map((m) => m[1]);
  const table = forms(section(read("skills/domain-memory/ADR-FORMAT.md"), "## Status", "skills/domain-memory/ADR-FORMAT.md"));
  const rule = forms(read("skills/domain-memory/SKILL.md").split("\n").find((l) => l.includes("exactly one of these forms")) ?? "");
  const template = forms(read("templates/adr/0000-template.md"));
  assert.equal(table.length, 3, "skills/domain-memory/ADR-FORMAT.md (## Status) must list three status forms");
  sameNames(rule, table, "skills/domain-memory/SKILL.md (status rule)", "skills/domain-memory/ADR-FORMAT.md (## Status)");
  sameNames(template, table, "templates/adr/0000-template.md", "skills/domain-memory/ADR-FORMAT.md (## Status)");
});
