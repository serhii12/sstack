import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { install } from "../../scripts/install.mjs";
import { lint } from "../../skills/tickets/scripts/tickets-lint.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "tickets", "scripts", "tickets-lint.mjs");

function ticket({ title = "# 01: Show the login form", blockedBy = "Blocked by: none", checks = ["- [ ] The form shows on /login"], extra = "" } = {}) {
  return [
    ...(title === null ? [] : [title, ""]),
    ...(blockedBy === null ? [] : [blockedBy]),
    "Status: open",
    "",
    "## What to build",
    "",
    "A user can open the login page and see the form.",
    "",
    ...(checks === null ? [] : ["## Acceptance checks", "", ...checks]),
    extra,
    "",
  ].join("\n");
}

const T = ".scratch/login/tickets";

/** A clean fixture: a chain and a diamond in two features. */
function cleanFiles() {
  return {
    [`${T}/01-login-form.md`]: ticket(),
    [`${T}/02-session-store.md`]: ticket({ title: "# 02: Keep the session", blockedBy: "Blocked by: 01-login-form.md" }),
    [`${T}/03-logout.md`]: ticket({ title: "# 03: Log out", blockedBy: "**Blocked by:** `01-login-form.md`, [02](02-session-store.md)" }),
    ".scratch/export/tickets/01-csv.md": ticket({ title: "# 01: Export CSV" }),
    ".scratch/export/tickets/02-json.md": ticket({ title: "# 02: Export JSON", blockedBy: "Blocked by: none (can start now)" }),
    ".scratch/export/tickets/03-both.md": ticket({ title: "# 03: Both", blockedBy: "Blocked by: 01-csv.md, 02-json.md" }),
    ".scratch/export/tickets/04-docs.md": ticket({ title: "# 04: Docs", blockedBy: "Blocked by: 03-both.md, 01-csv.md" }),
    ".scratch/export/spec.md": "# Spec\n\nNot a ticket, so not checked.\n",
    ".scratch/export/tickets/notes.txt": "not markdown, ignored\n",
  };
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "tickets-lint-"));
  for (const [rel, content] of Object.entries({ ...cleanFiles(), ...overrides })) {
    if (content === null) continue;
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

function run(overrides) {
  const root = fixture(overrides);
  try {
    return lint(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function cli(args, overrides) {
  const root = overrides === undefined ? null : fixture(overrides);
  try {
    return spawnSync(process.execPath, [SCRIPT, ...args.map((a) => (a === "ROOT" ? root : a))], { encoding: "utf8" });
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
}

const rules = (r, rule) => r.problems.filter((p) => p.rule === rule);

test("clean fixture has no problems", () => {
  const r = run();
  assert.deepEqual(r.problems, []);
  assert.equal(r.files, 7);
});

test("no .scratch folder is clean with zero files", () => {
  const root = mkdtempSync(join(tmpdir(), "tickets-lint-"));
  try {
    const r = lint(root);
    assert.deepEqual(r.problems, []);
    assert.equal(r.files, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- file-name ----

test("file-name: a name without the NN- prefix fails", () => {
  const r = run({ [`${T}/login-form.md`]: ticket() });
  const hits = rules(r, "file-name");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, `${T}/login-form.md`);
});

test("file-name: capital letters fail", () => {
  assert.equal(rules(run({ [`${T}/04-Logout.md`]: ticket() }), "file-name").length, 1);
});

// ---- title ----

test("title: missing heading fails", () => {
  const r = run({ [`${T}/01-login-form.md`]: ticket({ title: null }) });
  const hits = rules(r, "title");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
});

test("title: an empty `# ` heading fails", () => {
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: ticket({ title: "# " }) }), "title").length, 1);
});

test("title: a level-2 heading is not a title", () => {
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: ticket({ title: "## 01: Show the login form" }) }), "title").length, 1);
});

test("title: leading blank lines are fine", () => {
  assert.deepEqual(run({ [`${T}/01-login-form.md`]: `\n\n${ticket()}` }).problems, []);
});

// ---- acceptance ----

test("acceptance: missing section fails", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ checks: null }) }), "acceptance");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /no `## Acceptance checks` section/);
});

test("acceptance: section with no checkbox fails at the heading line", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ checks: ["Works well."] }) }), "acceptance");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 10);
  assert.match(hits[0].message, /has no/);
});

test("acceptance: a checkbox inside a code fence does not count", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ checks: ["```", "- [ ] not real", "```"] }) }), "acceptance");
  assert.equal(hits.length, 1);
});

test("acceptance: a checkbox under a later section does not count", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ checks: ["", "## Notes", "- [ ] stray"] }) }), "acceptance");
  assert.equal(hits.length, 1);
});

test("acceptance: a ticked checkbox counts", () => {
  assert.deepEqual(run({ [`${T}/01-login-form.md`]: ticket({ checks: ["- [x] Done already"] }) }).problems, []);
});

// ---- blocked-by ----

test("blocked-by: a long run of spaces inside the line parses in one pass", () => {
  const blockedBy = `Blocked by: 01-csv.md,${" ".repeat(160_000)}02-json.md`;
  const r = run({ ".scratch/export/tickets/03-both.md": ticket({ title: "# 03: Both", blockedBy }) });
  assert.deepEqual(r.problems, []);
});

test("blocked-by: missing line fails", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ blockedBy: null }) }), "blocked-by");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /no `Blocked by:` line/);
});

test("blocked-by: empty value fails", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ blockedBy: "Blocked by:" }) }), "blocked-by");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /^`Blocked by:` is empty$/);
});

test("blocked-by: a ticket that does not exist fails on its line", () => {
  const hits = rules(run({ [`${T}/02-session-store.md`]: ticket({ title: "# 02", blockedBy: "Blocked by: 01-login-form.md, 09-missing.md" }) }), "blocked-by");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  assert.match(hits[0].message, /09-missing\.md/);
});

test("blocked-by: a bare number is not a file name", () => {
  assert.equal(rules(run({ [`${T}/02-session-store.md`]: ticket({ title: "# 02", blockedBy: "Blocked by: 01" }) }), "blocked-by").length, 1);
});

test("blocked-by: a ticket in another feature folder does not count", () => {
  assert.equal(rules(run({ [`${T}/02-session-store.md`]: ticket({ title: "# 02", blockedBy: "Blocked by: 01-csv.md" }) }), "blocked-by").length, 1);
});

test("blocked-by: two lines fail", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ extra: "Blocked by: none" }) }), "blocked-by");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /more than one/);
});

test("blocked-by: none mixed with names fails", () => {
  assert.equal(rules(run({ [`${T}/02-session-store.md`]: ticket({ title: "# 02", blockedBy: "Blocked by: none, 01-login-form.md" }) }), "blocked-by").length, 1);
});

test("blocked-by: a line inside a code fence does not count", () => {
  const text = ticket({ blockedBy: null, extra: "```\nBlocked by: none\n```" });
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: text }), "blocked-by").length, 1);
});

// ---- cycle ----

test("cycle: two tickets blocking each other is one problem", () => {
  const r = run({
    [`${T}/01-login-form.md`]: ticket({ blockedBy: "Blocked by: 02-session-store.md" }),
  });
  const hits = rules(r, "cycle");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, `${T}/01-login-form.md`);
  assert.equal(hits[0].line, 3);
  assert.match(hits[0].message, /01-login-form\.md -> 02-session-store\.md -> 01-login-form\.md/);
});

test("cycle: a three-ticket loop is found", () => {
  const r = run({
    ".scratch/export/tickets/01-csv.md": ticket({ title: "# 01", blockedBy: "Blocked by: 04-docs.md" }),
  });
  const hits = rules(r, "cycle");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /01-csv\.md -> 03-both\.md -> 04-docs\.md -> 01-csv\.md|01-csv\.md -> 04-docs\.md/);
});

test("cycle: a ticket blocked by itself fails", () => {
  const hits = rules(run({ [`${T}/01-login-form.md`]: ticket({ blockedBy: "Blocked by: 01-login-form.md" }) }), "cycle");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /blocked by itself/);
});

test("title: a first line that opens a code fence is not a title", () => {
  const text = "```\n# 01: Fake title\n```\n" + ticket({ title: null });
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: text }), "title").length, 1);
});

test("acceptance: an empty checkbox does not count", () => {
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: ticket({ checks: ["- [ ]"] }) }), "acceptance").length, 1);
});

// ---- number ----

test("number: two tickets with the same number fail once, on the later file", () => {
  const hits = rules(run({ [`${T}/01-login-page.md`]: ticket({ title: "# 01: Login page" }) }), "number");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, `${T}/01-login-page.md`);
  assert.match(hits[0].message, /same number as `01-login-form\.md`/);
});

test("number: 1-x and 01-x count as the same number", () => {
  assert.equal(rules(run({ [`${T}/1-extra.md`]: ticket() }), "number").length, 1);
});

test("number: the same number in two feature folders is fine", () => {
  assert.deepEqual(rules(run(), "number"), []);
});

// ---- installed project ----

test("installed: the installer copies the lint, and it runs from the project root", () => {
  const target = mkdtempSync(join(tmpdir(), "tickets-lint-installed-"));
  try {
    mkdirSync(join(target, ".git"));
    install({ target, log: () => {} });
    const installed = join(target, ".claude", "skills", "tickets", "scripts", "tickets-lint.mjs");
    assert.ok(existsSync(installed), "the installer did not copy tickets-lint.mjs");
    mkdirSync(join(target, T), { recursive: true });
    writeFileSync(join(target, T, "01-login-form.md"), ticket());
    writeFileSync(join(target, T, "02-bad.md"), ticket({ blockedBy: "Blocked by: 09-missing.md" }));
    const r = spawnSync(process.execPath, [".claude/skills/tickets/scripts/tickets-lint.mjs"], { cwd: target, encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^\.scratch\/login\/tickets\/02-bad\.md:3 {2}blocked-by /m);
    assert.match(r.stdout, /2 ticket file\(s\) checked, 1 problem\(s\)\./);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

// ---- CLI ----

test("cli: clean tree exits 0 with a summary", () => {
  const r = cli(["ROOT"], {});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^7 ticket file\(s\) checked, 0 problem\(s\)\.$/m);
});

test("cli: problems exit 1 in `path:line  rule  message  Fix: ...` form", () => {
  const r = cli(["ROOT"], { [`${T}/01-login-form.md`]: ticket({ blockedBy: "Blocked by: 07-nope.md" }) });
  assert.equal(r.status, 1);
  const line = r.stdout.split("\n").find((l) => l.includes("blocked-by"));
  assert.match(line, /^\.scratch\/login\/tickets\/01-login-form\.md:3 {2}blocked-by {2}.+ {2}Fix: .+/);
});

test("cli: run through a symlink still checks and exits 1 on problems", () => {
  const root = fixture({ [`${T}/01-login-form.md`]: ticket({ blockedBy: "Blocked by: 07-nope.md" }) });
  const dir = mkdtempSync(join(tmpdir(), "tickets-lint-link-"));
  try {
    const link = join(dir, "link.mjs");
    symlinkSync(SCRIPT, link);
    // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
    // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
    const r = spawnSync("node", [link, root], { encoding: "utf8" });
    assert.equal(r.status, 1, `exit ${r.status}, stdout: ${r.stdout}`);
    assert.match(r.stdout, /ticket file\(s\) checked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: unknown option exits 2", () => {
  const r = cli(["--bogus"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option/);
});

test("cli: two paths exit 2", () => {
  const r = cli(["a", "b"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /too many arguments/);
});

test("cli: a root that does not exist exits 2", () => {
  const r = cli([join(tmpdir(), "tickets-lint-does-not-exist-xyz")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a directory/);
});

// ---- cap ----

/** Ticket files 01..n in one feature folder, each with no blockers. */
function many(n, feature = "big") {
  const files = {};
  for (let i = 1; i <= n; i++) {
    const nn = String(i).padStart(2, "0");
    files[`.scratch/${feature}/tickets/${nn}-part-${i}.md`] = ticket({ title: `# ${nn}: Part ${i}` });
  }
  return files;
}

test("cap: no default cap, twenty tickets in one folder is valid", () => {
  assert.deepEqual(rules(run(many(20)), "cap"), []);
});

test("cap: with --max 6, six tickets in one folder is valid", () => {
  const root = fixture(many(6));
  try {
    assert.deepEqual(rules(lint(root, { max: 6 }), "cap"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: with --max 6, seven tickets in one folder fails once, on the folder", () => {
  const root = fixture(many(7));
  try {
    const hits = rules(lint(root, { max: 6 }), "cap");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].path, ".scratch/big/tickets");
    assert.match(hits[0].message, /7 ticket files .* cap is 6/);
    assert.match(hits[0].fix, /--max/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: the cap counts each spec folder alone", () => {
  const root = fixture({ ...many(5, "one"), ...many(5, "two") });
  try {
    assert.deepEqual(rules(lint(root, { max: 6 }), "cap"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: a higher max lifts the cap", () => {
  const root = fixture(many(9));
  try {
    assert.deepEqual(rules(lint(root, { max: 9 }), "cap"), []);
    assert.equal(rules(lint(root, { max: 8 }), "cap").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cli: seven tickets with no --max exit 0", () => {
  const r = cli(["ROOT"], many(7));
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, / {2}cap {2}/);
});

test("cli: --max 6 and seven tickets exit 1 with a cap problem", () => {
  const r = cli(["--max", "6", "ROOT"], many(7));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^\.scratch\/big\/tickets:1 {2}cap {2}.+ {2}Fix: .+/m);
});

test("cli: --max 7 lets seven tickets pass", () => {
  const r = cli(["--max", "7", "ROOT"], many(7));
  assert.equal(r.status, 0, r.stdout);
});

test("cli: --max with a bad value exits 2", () => {
  for (const bad of [["--max"], ["--max", "0"], ["--max", "x"], ["--max", "-1"]]) {
    const r = cli(bad);
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /--max needs a whole number/);
  }
});

// ---- independent check: odd input shapes and the cap ----

test("cap: seven tickets across two feature folders (4 and 3) is valid", () => {
  const files = { ...many(4, "one"), ...many(3, "two") };
  const root = fixture(files);
  try {
    const r = lint(root, { max: 6 });
    assert.deepEqual(rules(r, "cap"), []);
    assert.equal(r.files, 14, "7 new tickets plus the 7 of the clean fixture");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: a ticket file with a bad name still counts toward the cap", () => {
  const root = fixture({ ...many(6), ".scratch/big/tickets/notes.md": ticket({ title: "# Notes" }) });
  try {
    const r = lint(root, { max: 6 });
    assert.equal(rules(r, "cap").length, 1);
    assert.equal(rules(r, "file-name").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: a symlink to a ticket file counts toward the cap", () => {
  const root = fixture(many(6));
  try {
    const real = join(root, "elsewhere.md");
    writeFileSync(real, ticket({ title: "# 07: Linked" }));
    symlinkSync(real, join(root, ".scratch/big/tickets/07-linked.md"));
    const r = lint(root, { max: 6 });
    assert.equal(rules(r, "cap").length, 1, JSON.stringify(r.problems));
    assert.match(rules(r, "cap")[0].message, /^7 ticket files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cap: the message names the lifted cap", () => {
  const root = fixture(many(4));
  try {
    const hits = rules(lint(root, { max: 3 }), "cap").filter((p) => p.path === ".scratch/big/tickets");
    assert.equal(hits.length, 1);
    assert.match(hits[0].message, /4 ticket files .* cap is 3/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("odd: a UTF-8 byte order mark before the title is ignored", () => {
  assert.deepEqual(run({ [`${T}/01-login-form.md`]: "\uFEFF" + ticket() }).problems, []);
});

test("odd: CRLF line ends give no problems", () => {
  const r = run({
    [`${T}/01-login-form.md`]: ticket().replace(/\n/g, "\r\n"),
    [`${T}/02-session-store.md`]: ticket({ title: "# 02: Keep the session", blockedBy: "Blocked by: 01-login-form.md" }).replace(/\n/g, "\r\n"),
  });
  assert.deepEqual(r.problems, []);
});

test("fence: a ``` line inside a ~~~ block does not close the block", () => {
  const extra = "\n## Notes\n\n~~~\n```\nBlocked by: 99-ghost.md\n```\n- [ ] not a check\n~~~\n";
  assert.deepEqual(run({ [`${T}/01-login-form.md`]: ticket({ extra }) }).problems, []);
});

test("fence: a checkbox only inside a ~~~ block that holds ``` does not count", () => {
  const checks = ["~~~", "```", "- [ ] hidden", "```", "- [ ] hidden too", "~~~"];
  assert.equal(rules(run({ [`${T}/01-login-form.md`]: ticket({ checks }) }), "acceptance").length, 1);
});

test("cli: a root that is a file exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "tickets-lint-file-"));
  try {
    const f = join(dir, "spec.md");
    writeFileSync(f, "# Spec\n");
    const r = spawnSync(process.execPath, [SCRIPT, f], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not a directory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
