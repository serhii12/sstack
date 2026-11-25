import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { install } from "../../scripts/install.mjs";
import { checkSpec, lint } from "../../skills/spec/scripts/spec-lint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "spec", "scripts", "spec-lint.mjs");
const FIX = join(HERE, "fixtures", "spec-lint");

const fx = (name) => join(FIX, name);
const text = (name) => readFileSync(fx(name), "utf8");
const rules = (name) => checkSpec(text(name)).map((p) => p.rule);
const hits = (name, rule) => checkSpec(text(name)).filter((p) => p.rule === rule);
const cli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

// ---- valid files ----

test("valid spec has no problems", () => {
  assert.deepEqual(checkSpec(text("valid.md")), []);
});

test("valid spec with essentials that were not agreed has no problems", () => {
  assert.deepEqual(checkSpec(text("valid-not-agreed.md")), []);
});

// ---- empty ----

test("empty: a zero-byte file fails with one problem", () => {
  assert.deepEqual(rules("invalid-empty.md"), ["empty"]);
});

test("empty: a file of blank lines fails with one problem", () => {
  assert.deepEqual(rules("invalid-blank.md"), ["empty"]);
});

// ---- title ----

test("title: a spec without the `# Spec:` line fails", () => {
  const h = hits("invalid-no-title.md", "title");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /first line/);
});

// ---- status ----

test("status: a missing status line fails", () => {
  const h = hits("invalid-no-status.md", "status");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /no `Status: draft` line/);
});

test("status: `Status: ready` fails on its line", () => {
  const h = hits("invalid-status-ready.md", "status");
  assert.equal(h.length, 1);
  assert.equal(h[0].line, 3);
  assert.match(h[0].message, /must be `draft`/);
});

test("status: a second status line fails, even when it also says draft", () => {
  const h = hits("invalid-status-twice.md", "status");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /more than one/);
});

test("status: a status line inside a code fence does not count", () => {
  const h = hits("invalid-fenced-only.md", "status");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /no `Status: draft` line/);
});

test("status: `Status: Draft` with a capital fails", () => {
  const t = text("valid.md").replace("Status: draft", "Status: Draft");
  assert.equal(checkSpec(t).filter((p) => p.rule === "status").length, 1);
});

// ---- ready-marker ----

test("ready-marker: a `Labels: ready-for-agent` line fails", () => {
  const h = hits("invalid-ready-marker.md", "ready-marker");
  assert.equal(h.length, 1);
  assert.equal(h[0].line, 4);
  assert.match(h[0].message, /ready-for-agent/);
});

test("ready-marker: a label line without the marker still fails", () => {
  const t = text("valid.md").replace("Status: draft\n", "Status: draft\nLabel: urgent\n");
  const h = checkSpec(t).filter((p) => p.rule === "ready-marker");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /label line/);
});

test("ready-marker: the marker in prose fails", () => {
  assert.equal(hits("invalid-ready-marker-prose.md", "ready-marker").length, 1);
});

test("ready-marker: the word `ready` in plain prose is fine", () => {
  const t = text("valid.md").replace("- The export uses the same query as the report page.", "- The report is ready when the query ends.");
  assert.deepEqual(checkSpec(t), []);
});

// ---- section ----

test("section: a missing `## Test boundaries` fails once", () => {
  const h = hits("invalid-missing-section.md", "section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /## Test boundaries/);
});

test("section: a missing `### Out` fails once", () => {
  const h = hits("invalid-missing-scope-out.md", "section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /### Out/);
});

test("section: a heading inside a code fence does not count", () => {
  const t = text("valid.md").replace("## Decisions\n", "```\n## Decisions\n```\n");
  const h = checkSpec(t).filter((p) => p.rule === "section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /## Decisions/);
});

test("section: heading names ignore case", () => {
  const t = text("valid.md").replace("## Who it is for", "## WHO IT IS FOR");
  assert.deepEqual(checkSpec(t), []);
});

test("section: every required section is checked", () => {
  const names = ["Problem", "Who it is for", "Scope", "User stories", "User-visible behavior", "Test boundaries", "Decisions", "Assumed without asking", "Open questions", "Glossary terms and decision records"];
  for (const n of names) {
    const t = text("valid.md").replace(`## ${n}\n`, `## Renamed ${n}\n`);
    const h = checkSpec(t).filter((p) => p.rule === "section" && p.message.includes(`## ${n}\``));
    assert.equal(h.length, 1, `no problem for the missing section ${n}`);
  }
});

test("section: the old British heading `User-visible behaviour` does not count", () => {
  const t = text("valid.md").replace("## User-visible behavior\n", "## User-visible behaviour\n");
  const h = checkSpec(t).filter((p) => p.rule === "section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /## User-visible behavior`/);
});

// ---- empty-section ----

test("empty-section: a section with no content fails at its heading", () => {
  const h = hits("invalid-empty-section.md", "empty-section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /`Decisions`/);
});

test("empty-section: `None` counts as content", () => {
  assert.deepEqual(hits("valid.md", "empty-section"), []);
});

test("empty-section: the `## Scope` heading needs no text of its own", () => {
  assert.deepEqual(hits("valid.md", "empty-section"), []);
});

// ---- not-agreed and open-question ----

test("not-agreed: the exact sentence plus a matching question is valid", () => {
  assert.deepEqual(rules("valid-not-agreed.md"), []);
});

test("open-question: a not agreed essential with no question fails", () => {
  const h = hits("invalid-not-agreed-no-question.md", "open-question");
  assert.equal(h.length, 1);
  assert.match(h[0].fix, /Problem: not agreed yet/);
});

test("open-question: the question must name the essential", () => {
  const t = text("valid-not-agreed.md").replace("- Problem: not agreed yet.", "- Scope: not agreed yet.");
  const h = checkSpec(t).filter((p) => p.rule === "open-question");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /`Problem`/);
});

test("open-question: the question counts only under `## Open questions`", () => {
  const t = text("valid-not-agreed.md").replace("- Problem: not agreed yet. The user did not say what is wrong.\n", "").replace("## Decisions\n\n", "## Decisions\n\n- Problem: not agreed yet.\n");
  assert.equal(checkSpec(t).filter((p) => p.rule === "open-question").length, 1);
});

test("open-question: each essential section has its own name", () => {
  const cases = [
    ["Problem", "Problem"],
    ["Who it is for", "Who it is for"],
    ["In", "In scope"],
    ["Out", "Out of scope"],
    ["User-visible behavior", "User-visible behavior"],
    ["Test boundaries", "Test boundaries"],
  ];
  for (const [section, essential] of cases) {
    const v = text("valid.md");
    const re = new RegExp(`(#{2,3} ${section}\\n\\n)[\\s\\S]*?(\\n#{2,3} )`);
    const t = v.replace(re, `$1Not agreed. See Open questions.\n$2`);
    assert.notEqual(t, v, section);
    const probs = checkSpec(t);
    assert.deepEqual(probs.map((p) => p.rule), ["open-question"], `${section}: ${JSON.stringify(probs)}`);
    const fixed = t.replace("## Open questions\n\nNone", `## Open questions\n\n- ${essential}: not agreed yet.`);
    assert.deepEqual(checkSpec(fixed), [], section);
  }
});

test("not-agreed: a different sentence in an essential fails", () => {
  const h = hits("invalid-not-agreed-wrong-text.md", "not-agreed");
  assert.equal(h.length, 1);
  assert.match(h[0].fix, /Not agreed\. See Open questions\./);
});

test("not-agreed: the sentence plus extra text fails", () => {
  const t = text("valid-not-agreed.md").replace("Not agreed. See Open questions.", "Not agreed. See Open questions. Maybe a report.");
  assert.equal(checkSpec(t).filter((p) => p.rule === "not-agreed").length, 1);
});

// ---- problem shape ----

test("problems carry line, rule, message and fix", () => {
  for (const p of checkSpec(text("invalid-status-ready.md"))) {
    assert.equal(typeof p.line, "number");
    assert.ok(p.rule && p.message && p.fix);
  }
});

// ---- lint() ----

test("lint: counts files and attaches the path", () => {
  const r = lint([fx("valid.md"), fx("invalid-status-ready.md")]);
  assert.equal(r.files, 2);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].path, fx("invalid-status-ready.md"));
});

test("lint: a missing file throws", () => {
  assert.throws(() => lint([fx("does-not-exist.md")]), /cannot read/);
});

// ---- installed project ----

test("installed: the installer copies the lint, and it runs from the project root", () => {
  const target = mkdtempSync(join(tmpdir(), "spec-lint-installed-"));
  try {
    mkdirSync(join(target, ".git"));
    install({ target, log: () => {} });
    const installed = join(target, ".claude", "skills", "spec", "scripts", "spec-lint.mjs");
    assert.ok(existsSync(installed), "the installer did not copy spec-lint.mjs");
    mkdirSync(join(target, ".scratch", "report"), { recursive: true });
    writeFileSync(join(target, ".scratch", "report", "spec.md"), text("invalid-status-ready.md"));
    const r = spawnSync(process.execPath, [".claude/skills/spec/scripts/spec-lint.mjs", ".scratch/report/spec.md"], { cwd: target, encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^\.scratch\/report\/spec\.md:3 {2}status /m);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

// ---- CLI ----

test("cli: a valid spec exits 0 with a summary", () => {
  const r = cli([fx("valid.md")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^1 spec file\(s\) checked, 0 problem\(s\)\.$/m);
});

test("cli: problems exit 1 in `path:line  rule  message  Fix: ...` form", () => {
  const r = cli([fx("invalid-status-ready.md")]);
  assert.equal(r.status, 1);
  const line = r.stdout.split("\n").find((l) => l.includes("  status  "));
  assert.match(line, /invalid-status-ready\.md:3 {2}status {2}.+ {2}Fix: .+/);
});

test("cli: several files exit 1 when one has a problem", () => {
  const r = cli([fx("valid.md"), fx("invalid-no-status.md")]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2 spec file\(s\) checked/);
});

test("cli: run through a symlink still checks and exits 1 on problems", () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-lint-link-"));
  try {
    const link = join(dir, "link.mjs");
    symlinkSync(SCRIPT, link);
    // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
    // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
    const r = spawnSync("node", [link, fx("invalid-status-ready.md")], { encoding: "utf8" });
    assert.equal(r.status, 1, `exit ${r.status}, stdout: ${r.stdout}`);
    assert.match(r.stdout, /spec file\(s\) checked/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: unknown option exits 2", () => {
  const r = cli(["--bogus"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --bogus/);
});

test("cli: no file exits 2", () => {
  const r = cli([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no spec file given/);
});

test("cli: a file that does not exist exits 2", () => {
  const r = cli([join(tmpdir(), "spec-lint-does-not-exist-xyz.md")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

test("cli: --help exits 0", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

// ---- independent check: odd input shapes ----
// Each test below is one input that the first version of the script handled wrong,
// or that no earlier test covered.

const valid = () => text("valid.md");
const valid2 = () => text("valid-not-agreed.md");

test("odd: CRLF line ends on a valid spec give no problems", () => {
  assert.deepEqual(checkSpec(valid().replace(/\n/g, "\r\n")), []);
});

test("odd: CRLF line ends still find `Status: ready` on its line", () => {
  const h = checkSpec(text("invalid-status-ready.md").replace(/\n/g, "\r\n")).filter((p) => p.rule === "status");
  assert.equal(h.length, 1);
  assert.equal(h[0].line, 3);
});

test("odd: a UTF-8 byte order mark before the title is ignored", () => {
  assert.deepEqual(checkSpec("\uFEFF" + valid()), []);
});

test("odd: a file that holds only a byte order mark is empty", () => {
  assert.deepEqual(checkSpec("\uFEFF\n\n").map((p) => p.rule), ["empty"]);
});

test("odd: extra spaces in headings and in the status line are fine", () => {
  const t = valid()
    .replace("Status: draft", "Status:   draft  ")
    .replace("## Problem\n", "##   Problem   \n")
    .replace("## Test boundaries\n", "##  Test boundaries ##\n");
  assert.deepEqual(checkSpec(t), []);
});

test("odd: `STATUS: DRAFT` in capitals fails", () => {
  const h = checkSpec(valid().replace("Status: draft", "STATUS: DRAFT")).filter((p) => p.rule === "status");
  assert.equal(h.length, 1);
});

test("fence: a ``` line inside a ~~~ block does not close the block", () => {
  const block = "~~~markdown\n```js\nconst a = 1;\n```\n## Not a section\n~~~\n";
  const t = valid().replace("- The export uses the same query as the report page.\n", `- The export uses the same query as the report page.\n\n${block}`);
  assert.deepEqual(checkSpec(t), []);
});

test("fence: a four-backtick block can hold a ``` line and a heading", () => {
  const block = "````\n```\n## Problem\nStatus: ready\n```\n````\n";
  const t = valid().replace("- The export uses the same query as the report page.\n", `- The export uses the same query as the report page.\n\n${block}`);
  assert.deepEqual(checkSpec(t), []);
});

test("fence: a ready marker inside a code fence is not a marker", () => {
  const t = valid().replace("- The export uses the same query as the report page.\n", "- The export uses the same query as the report page.\n\n```\nLabels: ready-for-agent\n```\n");
  assert.deepEqual(checkSpec(t), []);
});

test("fence: an unclosed fence hides the sections after it", () => {
  const t = valid().replace("## Decisions\n", "```\n## Decisions\n");
  const missing = checkSpec(t).filter((p) => p.rule === "section").map((p) => p.message);
  assert.ok(missing.some((m) => m.includes("## Open questions")), JSON.stringify(missing));
});

test("duplicate-section: a second `## Open questions` fails on its line", () => {
  const t = valid() + "\n## Open questions\n\n- Date in the file name: which time zone.\n";
  const h = checkSpec(t).filter((p) => p.rule === "duplicate-section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /## Open questions/);
  assert.equal(h[0].line, t.split("\n").indexOf("## Open questions", t.split("\n").indexOf("## Open questions") + 1) + 1);
});

test("duplicate-section: a not agreed `## Test boundaries` plus a second one with a boundary fails", () => {
  const t = valid2().replace("## Decisions\n", "## Test boundaries\n\n- GET /report.csv: the body. new\n\n## Decisions\n");
  const h = checkSpec(t).filter((p) => p.rule === "duplicate-section");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /## Test boundaries/);
});

test("duplicate-section: a second `### In` fails", () => {
  const t = valid().replace("### Out\n", "### In\n\n- A second list.\n\n### Out\n");
  assert.equal(checkSpec(t).filter((p) => p.rule === "duplicate-section").length, 1);
});

test("not-agreed: prose that says `not agreed` in the middle of a line is fine", () => {
  const t = valid().replace("They copy the numbers by hand.", "The team has not agreed on a format, so they copy the numbers by hand.");
  assert.deepEqual(checkSpec(t), []);
});

test("not-agreed: the sentence plus the `Prior art:` line in Test boundaries is valid", () => {
  const t = valid2().replace("## Test boundaries\n\nNot agreed. See Open questions.\n", "## Test boundaries\n\nNot agreed. See Open questions.\n\nPrior art: None found\n");
  assert.deepEqual(checkSpec(t), []);
});

test("not-agreed: a `Prior art:` line in another essential is extra text", () => {
  const t = valid2().replace("## Problem\n\nNot agreed. See Open questions.\n", "## Problem\n\nNot agreed. See Open questions.\n\nPrior art: None found\n");
  assert.deepEqual(checkSpec(t).map((p) => p.rule), ["not-agreed"]);
});

test("not-agreed: the sentence plus a boundary bullet fails", () => {
  const t = valid2().replace("## Test boundaries\n\nNot agreed. See Open questions.\n", "## Test boundaries\n\nNot agreed. See Open questions.\n\n- GET /report.csv: the body. new\n");
  const h = checkSpec(t).filter((p) => p.rule === "not-agreed");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /`Test boundaries`/);
});

test("not-agreed: a bullet `- Not agreed yet` fails", () => {
  const t = valid2().replace("## Problem\n\nNot agreed. See Open questions.\n", "## Problem\n\n- Not agreed yet\n");
  assert.equal(checkSpec(t).filter((p) => p.rule === "not-agreed").length, 1);
});

test("not-agreed: the sentence in italics fails", () => {
  const t = valid2().replace("## Problem\n\nNot agreed. See Open questions.\n", "## Problem\n\n*Not agreed. See Open questions.*\n");
  assert.equal(checkSpec(t).filter((p) => p.rule === "not-agreed").length, 1);
});

test("cli: a folder path exits 2", () => {
  const r = cli([FIX]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

test("cli: an empty file exits 1 with the empty rule", () => {
  const r = cli([fx("invalid-empty.md")]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /invalid-empty\.md:1 {2}empty /);
});
