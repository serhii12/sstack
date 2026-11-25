import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTicket, parseBlockedBy, parseStatus, EXIT } from "../../skills/build/scripts/ticket-ready.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "build", "scripts", "ticket-ready.mjs");
const FIX = join(HERE, "fixtures", "ticket-ready");
const T = join(FIX, "feature", "tickets");

function run(args, { script = SCRIPT, cwd, bin = process.execPath } = {}) {
  const r = spawnSync(bin, [script, ...args], { encoding: "utf8", cwd });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Every message has the form "<what failed>. Fix: <what to do>." */
function assertMessageForm(text) {
  for (const line of text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("Usage:"))) {
    assert.match(line, /\. Fix: .+\.$/, `message does not follow "<what failed>. Fix: <what to do>.": ${line}`);
  }
}

test("exit 0: no blocker (Blocked by: none)", () => {
  const r = run([join(T, "14-none.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /no blocker/);
  assert.equal(r.err, "");
});

test("exit 0: one closed blocker", () => {
  const r = run([join(T, "10-ready-one.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /1 blocker\(s\) closed/);
});

test("exit 0: two closed blockers, a link entry and a code-quoted entry", () => {
  assert.equal(run([join(T, "11-ready-two.md")]).code, 0);
  assert.equal(run([join(T, "24-markdown-link.md")]).code, 0);
});

test("exit 0: Status value is read without regard to case", () => {
  assert.equal(run([join(T, "21-capital-status.md")]).code, 0);
});

test("exit 1: a blocker is open, and the message names it", () => {
  const r = run([join(T, "12-open-blocker.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Blocker 02-open\.md is still open/);
  assert.doesNotMatch(r.err, /01-closed\.md/);
  assertMessageForm(r.err);
});

test("exit 1: a blocker with no Status line is open", () => {
  const r = run([join(T, "20-no-status-blocker.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /no `Status:` line/);
  assertMessageForm(r.err);
});

test("exit 1: a Status line inside a code block does not count", () => {
  const r = run([join(T, "22-fenced-status.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /says `open`/);
});

test("exit 3: a blocker file is missing", () => {
  const r = run([join(T, "13-missing-blocker.md")]);
  assert.equal(r.code, 3);
  assert.match(r.err, /Blocker 99-gone\.md cannot be read/);
  assertMessageForm(r.err);
});

test("exit 3 wins over exit 1 when both problems exist, and both are printed", () => {
  const r = run([join(T, "23-both-problems.md")]);
  assert.equal(r.code, 3);
  assert.match(r.err, /99-gone\.md cannot be read/);
  assert.match(r.err, /02-open\.md is still open/);
});

test("exit 3: a blocker that is a folder cannot be read", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-"));
  try {
    mkdirSync(join(dir, "01-folder.md"));
    writeFileSync(join(dir, "02-a.md"), "# 02\n\nBlocked by: 01-folder.md\nStatus: open\n");
    const r = run([join(dir, "02-a.md")]);
    assert.equal(r.code, 3);
    assertMessageForm(r.err);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exit 4: the ticket file does not exist", () => {
  const r = run([join(T, "no-such-ticket.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /Cannot read the ticket/);
  assertMessageForm(r.err);
});

test("exit 4: the ticket path is a folder", () => {
  const r = run([T]);
  assert.equal(r.code, 4);
  assertMessageForm(r.err);
});

test("exit 4: an empty Blocked by line", () => {
  const r = run([join(T, "16-empty.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /is empty/);
  assertMessageForm(r.err);
});

test("exit 4: none mixed with a ticket name", () => {
  const r = run([join(T, "17-mixed.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /mixes/);
});

test("exit 4: two Blocked by lines", () => {
  const r = run([join(T, "25-two-lines.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /2 `Blocked by:` lines/);
});

test("exit 5: no Blocked by line, so no check ran", () => {
  const r = run([join(T, "15-no-line.md")]);
  assert.equal(r.code, 5);
  assert.match(r.err, /no blocker check ran/);
  assertMessageForm(r.err);
});

test("a Blocked by line inside a code block is ignored", () => {
  const r = run([join(T, "26-fenced-line.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /no blocker/);
});

test("exit 2: usage errors", () => {
  for (const args of [[], ["a.md", "b.md"], ["--bogus"], [""]]) {
    const r = run(args);
    assert.equal(r.code, 2, `args ${JSON.stringify(args)}`);
    assert.match(r.err, /Usage error/);
    assert.match(r.err, /Fix: /);
  }
});

test("--help exits 0 and prints the usage", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Usage: node \.claude\/skills\/build\/scripts\/ticket-ready\.mjs <ticket file>/);
});

test("a blocker in another folder: closed gives 0, open gives 1", () => {
  assert.equal(run([join(T, "18-other-folder.md")]).code, 0);
  const r = run([join(T, "19-other-folder-open.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /02-pending\.md is still open/);
});

test("a relative ticket path works from another working folder", () => {
  const r = run(["feature/tickets/10-ready-one.md"], { cwd: FIX });
  assert.equal(r.code, 0);
  const open = run(["feature/tickets/12-open-blocker.md"], { cwd: FIX });
  assert.equal(open.code, 1);
});

test("the script runs through a symlinked path", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-link-"));
  try {
    const link = join(dir, "link-to-ticket-ready.mjs");
    symlinkSync(SCRIPT, link);
    // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
    // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
    const ok = run([join(T, "10-ready-one.md")], { script: link, bin: "node" });
    assert.equal(ok.code, 0);
    assert.match(ok.out, /Ready\./);
    const open = run([join(T, "12-open-blocker.md")], { script: link, bin: "node" });
    assert.equal(open.code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a copy of the fixtures in a new folder works the same (no path is built in)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-copy-"));
  try {
    cpSync(FIX, dir, { recursive: true });
    assert.equal(run([join(dir, "feature", "tickets", "18-other-folder.md")]).code, 0);
    // Make the blocker in the other folder open, and the same ticket must now stop.
    writeFileSync(join(dir, "other", "tickets", "01-done.md"), "# 01\n\nBlocked by: none\nStatus: open\n");
    assert.equal(run([join(dir, "feature", "tickets", "18-other-folder.md")]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exports: the parsers and the exit table", () => {
  assert.deepEqual(EXIT, { READY: 0, OPEN: 1, USAGE: 2, BLOCKER_UNREADABLE: 3, TICKET_UNREADABLE: 4, NO_LINE: 5 });
  assert.equal(parseBlockedBy("Blocked by: none (can start now)\n").kind, "none");
  assert.deepEqual(parseBlockedBy("**Blocked by:** `01-a.md`, [b](02-b.md)\n").blockers, ["01-a.md", "02-b.md"]);
  assert.equal(parseBlockedBy("# t\n").kind, "missing");
  assert.equal(parseStatus("Status:   closed  \n"), "closed");
  assert.equal(parseStatus("```\nStatus: closed\n```\n"), null);
  assert.equal(checkTicket(join(T, "14-none.md")).code, 0);
});
