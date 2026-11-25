import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_LINE, EXIT, findBlocks, jsonIssue, localIssue, checkIssue, run, parseLabelMap, applyLabelMap } from "../../skills/triage/scripts/triage-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "triage", "scripts", "triage-check.mjs");
const GH_FIXTURE = join(HERE, "fixtures", "triage-check", "gh-ready-for-agent.json");

const BRIEF = [AI_LINE, "", "## Agent Brief", "", "Category: bug", "Summary: Fix the total.", "", "### Acceptance checks", "", "- [ ] The total is 36.", ""].join("\n");
const HUMAN_BRIEF = [AI_LINE, "", "## Agent Brief", "", "Why a human: the fix needs access to the payment dashboard.", "", "### Acceptance checks", "", "- [ ] The refund shows.", ""].join("\n");
const NOTES = [AI_LINE, "", "## Triage Notes", "", "### What we know", "", "- The export fails.", "", "### What we still need from you", "", "- Which browser and version do you use?", ""].join("\n");
const decision = (why, extra = "") => [AI_LINE, "", "## Triage Decision", "", `Decision: wontfix, ${why}`, "Reason: we do not plan it.", extra, ""].join("\n");

function report({ status = "Status: open", labels = "Labels: bug, ready-for-agent", blockedBy = "Blocked by: none", body = "The total is wrong.", comments = [BRIEF] } = {}) {
  return [
    "# Cart total is wrong",
    "",
    ...(status === null ? [] : [status]),
    ...(labels === null ? [] : [labels]),
    ...(blockedBy === null ? [] : [blockedBy]),
    "Reported by: Ana",
    "",
    body,
    "",
    "## Comments",
    "",
    ...comments,
  ].join("\n");
}

const local = (text, root) => checkIssue(localIssue("r.md", text, root));
const rules = (problems) => problems.map((p) => p.rule).sort();

function gh(over = {}) {
  return { number: 7, state: "OPEN", labels: [{ name: "bug" }, { name: "ready-for-agent" }], body: "report", comments: [{ body: BRIEF }], ...over };
}

// ---- clean cases ----

test("clean: a local ready-for-agent report passes", () => {
  assert.deepEqual(local(report()), []);
});

test("clean: a local needs-info report passes", () => {
  assert.deepEqual(local(report({ labels: "Labels: enhancement, needs-info", blockedBy: null, comments: [NOTES] })), []);
});

test("clean: a local ready-for-human report passes", () => {
  assert.deepEqual(local(report({ labels: "Labels: bug, ready-for-human, P1", comments: [HUMAN_BRIEF] })), []);
});

test("clean: a closed wontfix (already implemented) passes", () => {
  assert.deepEqual(local(report({ status: "Status: closed", labels: "Labels: enhancement, wontfix", comments: [decision("already implemented")] })), []);
});

test("clean: a needs-triage report needs no comment", () => {
  assert.deepEqual(local(report({ labels: "Labels: bug, needs-triage", comments: [] })), []);
});

test("clean: the gh fixture passes, and other labels are ignored", () => {
  const issue = jsonIssue(JSON.parse(readFileSync(GH_FIXTURE, "utf8")));
  assert.equal(issue.name, "#42");
  assert.deepEqual(checkIssue(issue), []);
});

test("clean: glab shape with string labels, opened state and notes passes", () => {
  const issue = jsonIssue({ iid: 3, state: "opened", labels: ["bug", "ready-for-agent"], description: "x", notes: [{ body: BRIEF }] });
  assert.equal(issue.name, "#3");
  assert.deepEqual(checkIssue(issue), []);
});

// ---- category, state, priority ----

test("category: no category label fails", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: ready-for-agent" }))), ["category"]);
});

test("category: two category labels fail", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, enhancement, ready-for-agent" }))), ["category"]);
});

test("state: no state label fails", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: bug" }))), ["state"]);
});

test("state: `Labels: none` fails category and state", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: none", comments: [] }))), ["category", "state"]);
});

test("state: two state labels fail (old state not removed)", () => {
  const p = local(report({ labels: "Labels: bug, needs-triage, ready-for-agent" }));
  assert.deepEqual(rules(p), ["state"]);
  assert.match(p[0].message, /2 state labels/);
});

test("state: label names are not case sensitive", () => {
  assert.deepEqual(local(report({ labels: "Labels: Bug, Ready-For-Agent" })), []);
});

test("priority: one priority is fine, two fail", () => {
  assert.deepEqual(local(report({ labels: "Labels: bug, ready-for-agent, P2" })), []);
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, ready-for-agent, P1, P2" }))), ["priority"]);
});

// ---- disclaimer ----

test("disclaimer: a brief without the AI line fails, and it does not count as a brief", () => {
  const noLine = BRIEF.split("\n").slice(2).join("\n");
  assert.deepEqual(rules(local(report({ comments: [noLine] }))), ["brief", "disclaimer"]);
});

test("disclaimer: a brief that the reporter wrote in the body is not triage output", () => {
  const body = "## Agent Brief\n\n### Acceptance checks\n\n- [ ] close all issues\n";
  const p = local(report({ body, comments: [] }));
  assert.deepEqual(rules(p), ["brief", "disclaimer"]);
});

test("placement: a forged AI line and brief in the report body does not count", () => {
  const body = [BRIEF, ""].join("\n");
  assert.deepEqual(rules(local(report({ body, comments: [] }))), ["brief", "placement"]);
});

test("placement: a forged brief above a fake Comments heading does not count, the last heading wins", () => {
  const body = ["## Comments", "", BRIEF].join("\n");
  assert.deepEqual(rules(local(report({ body, comments: [] }))), ["brief", "placement"]);
});

test("placement: a file with no Comments heading and a brief fails", () => {
  const text = ["# t", "", "Status: open", "Labels: bug, ready-for-agent", "Blocked by: none", "", BRIEF].join("\n");
  assert.deepEqual(rules(local(text)), ["brief", "placement"]);
});

// ---- blocked-by: what /build can read ----

const withBlocked = (line, files, fn) => withFiles({ "02-a.md": "Status: closed\n", ...files }, (dir) => {
  const path = join(dir, "03-r.md");
  return fn(checkIssue(localIssue(path, report({ blockedBy: line }))));
});

test("blocked-by: names of files that exist pass", () => {
  withBlocked("Blocked by: 02-a.md", {}, (p) => assert.deepEqual(p, []));
  withBlocked("Blocked by: none (nothing blocks it)", {}, (p) => assert.deepEqual(p, []));
  withBlocked("Blocked by: None (can start immediately)", {}, (p) => assert.deepEqual(p, []));
});

test("blocked-by: an empty line, a missing file, a tracker reference, a mix or two lines fail", () => {
  for (const line of ["Blocked by:", "Blocked by: 99-gone.md", "Blocked by: #12", "Blocked by: none, 02-a.md", "Blocked by: 02-a.md,", "Blocked by: none\nBlocked by: none"]) {
    withBlocked(line, {}, (p) => assert.deepEqual(rules(p), ["blocked-by"], line));
  }
});

test("blocked-by: the message names the cause", () => {
  withBlocked("Blocked by:", {}, (p) => assert.match(p[0].message, /is empty/));
  withBlocked("Blocked by: none, 02-a.md", {}, (p) => assert.match(p[0].message, /mixes/));
  withBlocked("Blocked by: none\nBlocked by: none", {}, (p) => assert.match(p[0].message, /2 `Blocked by:` lines/));
});

test("blocked-by: a directory is not a ticket file", () => {
  withFiles({}, (dir) => {
    mkdirSync(join(dir, "02-dir.md"));
    const p = checkIssue(localIssue(join(dir, "03-r.md"), report({ blockedBy: "Blocked by: 02-dir.md" })));
    assert.deepEqual(rules(p), ["blocked-by"]);
  });
});

test("blocked-by: the real ticket-ready script agrees with the check", () => {
  const READY = join(HERE, "..", "..", "skills", "build", "scripts", "ticket-ready.mjs");
  for (const [line, ok] of [["Blocked by: none", true], ["Blocked by: 02-a.md", true], ["Blocked by:", false], ["Blocked by: 99-gone.md", false], ["Blocked by: #12", false], ["Blocked by: none, 02-a.md", false]]) {
    withFiles({ "02-a.md": "Status: closed\n", "03-r.md": report({ blockedBy: line }) }, (dir) => {
      const mine = checkIssue(localIssue(join(dir, "03-r.md"), report({ blockedBy: line }))).length === 0;
      const theirs = spawnSync("node", [READY, join(dir, "03-r.md")], { encoding: "utf8" }).status === 0;
      assert.equal(mine, theirs, line);
      assert.equal(mine, ok, line);
    });
  }
});

// ---- decision, size ----

test("decision: a Decision line with no known case fails", () => {
  for (const d of ["Decision: lol", "Decision: wontfix, rejected", "Decision: wontfix"]) {
    const t = [AI_LINE, "", "## Triage Decision", "", d, ""].join("\n");
    assert.deepEqual(rules(local(report({ status: "Status: closed", labels: "Labels: bug, wontfix", comments: [t] }))), ["decision"], d);
  }
});

test("size: 60000 plain `Acceptance checks` lines run in linear time", () => {
  const brief = [AI_LINE, "", "## Agent Brief", "", ...Array(60000).fill("Acceptance checks")].join("\n");
  const t0 = Date.now();
  assert.deepEqual(rules(local(report({ comments: [brief] }))), ["brief"]);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test("size: a long run of headings and spaces is linear", () => {
  const t0 = Date.now();
  const brief = [AI_LINE, "", ...Array(30000).fill("###### Agent Brief"), "Labels:" + " ".repeat(200000) + "x"].join("\n");
  local(report({ comments: [brief] }));
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test("cli: deeply nested or huge JSON exits 3 or 1, never hangs", () => {
  const dir = mkdtempSync(join(tmpdir(), "triage-check-"));
  try {
    writeFileSync(join(dir, "deep.json"), "[".repeat(200000) + "]".repeat(200000));
    assert.equal(run(["--json", join(dir, "deep.json")]).code, EXIT.INPUT);
    writeFileSync(join(dir, "big.json"), JSON.stringify({ number: 1, state: "open", labels: ["bug", "needs-triage"], comments: [{ body: "x\n".repeat(500000) }] }));
    assert.equal(run(["--json", join(dir, "big.json")]).code, EXIT.OK);
    for (const bad of ['{"labels":"bug","state":"open","comments":[]}', '{"labels":[],"state":"open","comments":"x"}', "null", "[]", "[1]", '{"labels":[null,7],"state":"open","comments":[null,7,{"body":5}]}']) {
      writeFileSync(join(dir, "bad.json"), bad);
      const c = run(["--json", join(dir, "bad.json")]).code;
      assert.ok(c === EXIT.INPUT || c === EXIT.PROBLEMS, `${bad} -> ${c}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a run through a symlinked script path still checks", () => {
  withFiles({ "r.md": report({ labels: "Labels: bug" }) }, (dir) => {
    const link = join(dir, "link.mjs");
    symlinkSync(SCRIPT, link);
    const r = spawnSync("node", [link, join(dir, "r.md")], { encoding: "utf8" });
    assert.equal(r.status, EXIT.PROBLEMS, r.stdout + r.stderr);
  });
});

test("disclaimer: a triage heading inside a code fence is ignored", () => {
  assert.deepEqual(local(report({ comments: [BRIEF, "```", "## Triage Notes", "```"] })), []);
});

test("disclaimer: an AI line after a blank line still counts", () => {
  assert.deepEqual(local(report({ comments: [BRIEF.replace(`${AI_LINE}\n`, `${AI_LINE}\n\n\n`)] })), []);
});

// ---- brief, human, blocked-by ----

test("brief: ready-for-agent with no brief fails", () => {
  assert.deepEqual(rules(local(report({ comments: [] }))), ["brief"]);
});

test("brief: a brief with no checkbox under Acceptance checks fails", () => {
  const p = local(report({ comments: [BRIEF.replace("- [ ] The total is 36.", "The total is 36.")] }));
  assert.deepEqual(rules(p), ["brief"]);
  assert.match(p[0].message, /Acceptance checks/);
});

test("brief: a checkbox under a later heading does not count", () => {
  const moved = BRIEF.replace("### Acceptance checks\n\n- [ ] The total is 36.", "### Acceptance checks\n\n### Out of scope\n\n- [ ] stray");
  assert.deepEqual(rules(local(report({ comments: [moved] }))), ["brief"]);
});

test("human: ready-for-human without `Why a human:` fails", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, ready-for-human", comments: [BRIEF] }))), ["human"]);
});

test("blocked-by: a local ready-for-agent without `Blocked by:` fails", () => {
  assert.deepEqual(rules(local(report({ blockedBy: null }))), ["blocked-by"]);
});

test("blocked-by: a tracker issue needs no `Blocked by:` line", () => {
  assert.deepEqual(checkIssue(jsonIssue(gh())), []);
});

// ---- notes ----

test("notes: needs-info with no notes fails", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, needs-info", comments: [] }))), ["notes"]);
});

test("notes: notes with no question fail", () => {
  const empty = NOTES.replace("- Which browser and version do you use?", "Nothing yet.");
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, needs-info", comments: [empty] }))), ["notes"]);
});

test("notes: a bold line in place of a heading still counts", () => {
  const bold = NOTES.replace("### What we still need from you", "**What we still need from you:**");
  assert.deepEqual(local(report({ labels: "Labels: bug, needs-info", comments: [bold] })), []);
});

// ---- wontfix ----

test("closed: an open wontfix fails", () => {
  assert.deepEqual(rules(local(report({ labels: "Labels: bug, wontfix", comments: [decision("rejected bug")] }))), ["closed"]);
});

test("closed: an open wontfix on the tracker fails", () => {
  const issue = jsonIssue(gh({ labels: ["enhancement", "wontfix"], comments: [{ body: decision("rejected bug") }] }));
  assert.deepEqual(rules(checkIssue(issue)), ["closed"]);
});

test("decision: wontfix with no Triage Decision fails", () => {
  assert.deepEqual(rules(local(report({ status: "Status: closed", labels: "Labels: bug, wontfix", comments: [] }))), ["decision"]);
});

test("decision: a Triage Decision with an empty `Decision:` line fails", () => {
  const empty = [AI_LINE, "", "## Triage Decision", "", "Decision:", ""].join("\n");
  assert.deepEqual(rules(local(report({ status: "Status: closed", labels: "Labels: bug, wontfix", comments: [empty] }))), ["decision"]);
});

test("out-of-scope: a rejected enhancement must name a file that exists", () => {
  const root = mkdtempSync(join(tmpdir(), "triage-check-"));
  try {
    const base = { status: "Status: closed", labels: "Labels: enhancement, wontfix" };
    assert.deepEqual(rules(local(report({ ...base, comments: [decision("rejected enhancement")] }), root)), ["out-of-scope"]);
    const named = decision("rejected enhancement", "See .out-of-scope/dark-mode.md.");
    const missing = local(report({ ...base, comments: [named] }), root);
    assert.deepEqual(rules(missing), ["out-of-scope"]);
    assert.match(missing[0].message, /does not exist/);
    mkdirSync(join(root, ".out-of-scope"));
    writeFileSync(join(root, ".out-of-scope", "dark-mode.md"), "# Dark mode\n");
    assert.deepEqual(local(report({ ...base, comments: [named] }), root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- status and labels lines (local) ----

test("status: a missing `Status:` line fails", () => {
  assert.deepEqual(rules(local(report({ status: null }))), ["status"]);
});

test("status: a triage state on the `Status:` line fails", () => {
  const p = local(report({ status: "Status: ready-for-agent" }));
  assert.deepEqual(rules(p), ["status"]);
  assert.match(p[0].fix, /Labels:/);
});

test("labels: a missing `Labels:` line fails", () => {
  assert.deepEqual(rules(local(report({ labels: null }))), ["category", "labels", "state"]);
});

test("labels: two `Labels:` lines fail", () => {
  assert.deepEqual(rules(local(report({ blockedBy: "Blocked by: none\nLabels: P2" }))), ["labels"]);
});

// ---- JSON shape ----

test("json: comments as plain strings count", () => {
  assert.deepEqual(checkIssue(jsonIssue(gh({ comments: [BRIEF] }))), []);
});

test("json: a brief in the issue body does not count", () => {
  assert.deepEqual(rules(checkIssue(jsonIssue(gh({ body: BRIEF, comments: [] })))), ["brief"]);
});

test("json: a bad shape throws an input error", () => {
  assert.throws(() => jsonIssue([]), /not an issue/);
  assert.throws(() => jsonIssue({ state: "OPEN", comments: [] }), /labels/);
  assert.throws(() => jsonIssue({ labels: [], comments: [] }), /state/);
  assert.throws(() => jsonIssue({ labels: [], state: "OPEN" }), /comments/);
  assert.throws(() => jsonIssue({ labels: [], state: "draft", comments: [] }), /not open/);
});

test("findBlocks: a block ends at the next heading of the same level", () => {
  const b = findBlocks([AI_LINE, "## Agent Brief", "### Acceptance checks", "- [ ] a", "## Other", "- [ ] b"].join("\n"));
  assert.equal(b.length, 1);
  assert.equal(b[0].body.length, 2);
});

// ---- CLI ----

function withFiles(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "triage-check-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cli = (args, opts = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", ...opts });

test("cli: clean files exit 0", () => {
  withFiles({ "a.md": report(), "b.md": report({ labels: "Labels: bug, needs-info", comments: [NOTES] }) }, (root) => {
    const r = cli(["a.md", "b.md"], { cwd: root });
    assert.equal(r.status, EXIT.OK, r.stdout + r.stderr);
    assert.match(r.stdout, /2 issue\(s\) checked, 0 problem\(s\)/);
  });
});

test("cli: a broken rule exits 1 with a `Fix:` message", () => {
  withFiles({ "a.md": report({ labels: "Labels: bug" }) }, (root) => {
    const r = cli(["a.md"], { cwd: root });
    assert.equal(r.status, EXIT.PROBLEMS);
    assert.match(r.stdout, /^a\.md:\d+ {2}state {2}The issue has no state label\. Fix: give it exactly one of/m);
  });
});

test("cli: --json reads a file", () => {
  assert.equal(cli(["--json", GH_FIXTURE]).status, EXIT.OK);
});

test("cli: --json - reads stdin", () => {
  const r = cli(["--json", "-"], { input: JSON.stringify(gh({ labels: ["bug"] })) });
  assert.equal(r.status, EXIT.PROBLEMS);
  assert.match(r.stdout, /#7:0 {2}state/);
});

test("cli: --json takes a list of issues", () => {
  const r = cli(["--json", "-"], { input: JSON.stringify([gh(), gh({ number: 8, labels: ["bug"] })]) });
  assert.equal(r.status, EXIT.PROBLEMS);
  assert.match(r.stdout, /2 issue\(s\) checked, 1 problem\(s\)/);
});

test("cli: bad JSON exits 3", () => {
  const r = cli(["--json", "-"], { input: "{not json" });
  assert.equal(r.status, EXIT.INPUT);
  assert.match(r.stderr, /not JSON.*Fix:/);
});

test("cli: a JSON without comments exits 3", () => {
  const r = cli(["--json", "-"], { input: JSON.stringify({ labels: [], state: "OPEN" }) });
  assert.equal(r.status, EXIT.INPUT);
  assert.match(r.stderr, /comments/);
});

test("cli: a missing file exits 3", () => {
  const r = cli(["/nonexistent/triage-check/report.md"]);
  assert.equal(r.status, EXIT.INPUT);
  assert.match(r.stderr, /Cannot read .*ENOENT.*Fix:/);
});

test("cli: usage errors exit 2", () => {
  assert.equal(cli([]).status, EXIT.USAGE);
  assert.equal(cli(["--json"]).status, EXIT.USAGE);
  assert.equal(cli(["--bogus", "a.md"]).status, EXIT.USAGE);
  assert.equal(cli(["a.md", "--json", GH_FIXTURE]).status, EXIT.USAGE);
  assert.match(cli([]).stderr, /Fix:/);
});

test("cli: --help exits 0", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, EXIT.OK);
  assert.match(r.stdout, /Usage:/);
});

// Bun resolves a symlink in argv[1] by itself and Node does not, so this test runs Node.
const NODE = process.versions.bun ? "node" : process.execPath;

test("cli: a run through a symlink still checks", () => {
  withFiles({ "a.md": report({ labels: "Labels: bug" }) }, (root) => {
    const link = join(root, "link.mjs");
    symlinkSync(SCRIPT, link);
    const r = spawnSync(NODE, [link, "a.md"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, EXIT.PROBLEMS, r.stdout + r.stderr);
  });
});

test("run: returns usage text with --help", () => {
  assert.equal(run(["--help"]).code, EXIT.OK);
});

// ---- label mapping and pull requests ----

const MAP = [
  "# Triage labels",
  "",
  "| Role | Label in this tracker | Meaning |",
  "| --- | --- | --- |",
  "| `bug` | `type:bug` | Something is broken. |",
  "| `enhancement` | `type:feature` | A new feature. |",
  "| `needs-triage` | `triage:new` | The maintainer must evaluate it. |",
  "| `ready-for-agent` | `agent:ready` | It holds an agent brief. |",
  "| `P0` | | Optional. |",
  "",
].join("\n");

function withRoot(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "triage-map-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("labels: parseLabelMap reads the roles, skips the header and empty labels", () => {
  const m = parseLabelMap(MAP);
  assert.equal(m.get("type:bug"), "bug");
  assert.equal(m.get("agent:ready"), "ready-for-agent");
  assert.equal(m.has("label in this tracker"), false);
  assert.equal([...m.values()].includes("P0"), false);
  assert.deepEqual(applyLabelMap(["Type:Bug", "agent:ready", "other"], m), ["bug", "ready-for-agent", "other"]);
});

test("labels: the mapping file under the root is read by default", () => {
  withRoot({ "docs/agents/triage-labels.md": MAP, "r.md": report({ labels: "Labels: type:bug, agent:ready" }) }, (root) => {
    const r = run([join(root, "r.md")], { root });
    assert.equal(r.code, EXIT.OK, r.out.join("\n"));
  });
});

test("labels: with no mapping file, mapped names fail", () => {
  withRoot({ "r.md": report({ labels: "Labels: type:bug, agent:ready" }) }, (root) => {
    const r = run([join(root, "r.md")], { root });
    assert.equal(r.code, EXIT.PROBLEMS);
    assert.match(r.out.join("\n"), /category/);
  });
});

test("labels: --labels names the mapping file", () => {
  withRoot({ "maps/l.md": MAP, "r.md": report({ labels: "Labels: type:bug, agent:ready" }) }, (root) => {
    assert.equal(run(["--labels", "maps/l.md", join(root, "r.md")], { root }).code, EXIT.OK);
  });
});

test("labels: a --labels file that cannot be read exits 3, and --labels with no file exits 2", () => {
  withRoot({ "r.md": report() }, (root) => {
    assert.equal(run(["--labels", "missing.md", join(root, "r.md")], { root }).code, EXIT.INPUT);
    assert.equal(run([join(root, "r.md"), "--labels"], { root }).code, EXIT.USAGE);
  });
});

test("pr: a merged pull request counts as closed", () => {
  const issue = jsonIssue({ number: 9, state: "MERGED", labels: [{ name: "enhancement" }, { name: "wontfix" }], comments: [{ body: decision("already implemented") }] });
  assert.equal(issue.closed, true);
  assert.deepEqual(checkIssue(issue), []);
});

test("pr: a gh pr view JSON with mapped labels passes through --json", () => {
  withRoot({ "docs/agents/triage-labels.md": MAP, "pr.json": JSON.stringify({ number: 12, state: "OPEN", labels: [{ name: "type:feature" }, { name: "triage:new" }], comments: [] }) }, (root) => {
    const r = run(["--json", join(root, "pr.json")], { root });
    assert.equal(r.code, EXIT.OK, r.out.join("\n"));
  });
});

