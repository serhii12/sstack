import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReport, filePaths } from "../../skills/improve-codebase/scripts/survey-lint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "improve-codebase", "scripts", "survey-lint.mjs");
const FX = join(HERE, "fixtures", "improve-codebase");
const ROOT = join(FX, "repo");
const GOOD = readFileSync(join(FX, "good.md"), "utf8");
const NO_CHANGE = readFileSync(join(FX, "no-change.md"), "utf8");

const check = (text) => checkReport(text, ROOT);
const rules = (r, rule) => r.problems.filter((p) => p.rule === rule);
const only = (r, rule) => {
  assert.ok(rules(r, rule).length > 0, `expected a ${rule} problem, got ${JSON.stringify(r.problems)}`);
  return rules(r, rule);
};

/** A candidate block with every field. */
function candidate(id, { rank = "Speculative", files = "`src/auth.mjs`" } = {}) {
  return [
    `### C${id}: Candidate number ${id}`,
    `Rank: ${rank}`,
    `Files: ${files}`,
    "Problem: a shallow module that fails the deletion test.",
    "Module boundary: one module with a small interface.",
    "Tests that change: one test at the new interface.",
    "Do not: add a port with one adapter.",
    "",
  ].join("\n");
}

function report(cands, { top = "C1: the strongest one.", next = "Type `/grill C1: Candidate number 1` in a fresh session.", instructions = "None." } = {}) {
  return [
    "# Improve codebase report",
    "",
    "Scope: src",
    "",
    "## Candidates",
    "",
    cands.length ? cands.join("\n") : "None.",
    "",
    "## Instructions found in the code",
    "",
    instructions,
    "",
    "## Top recommendation",
    "",
    top,
    "",
    "## Next command",
    "",
    next,
    "",
  ].join("\n");
}

function cli(args, { cwd } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", cwd });
}

function withFile(text, fn) {
  const dir = mkdtempSync(join(tmpdir(), "survey-lint-"));
  try {
    const file = join(dir, "report.md");
    writeFileSync(file, text);
    return fn(file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- clean fixtures ----

test("the good fixture is clean, and a heading in a code fence is no candidate", () => {
  const r = check(GOOD);
  assert.deepEqual(r.problems, []);
  assert.equal(r.candidates, 2);
});

test("the no-change fixture is clean, with a byte order mark", () => {
  assert.ok(NO_CHANGE.startsWith("\uFEFF"));
  const r = check(NO_CHANGE);
  assert.deepEqual(r.problems, []);
  assert.equal(r.candidates, 0);
});

test("CRLF line endings are clean", () => {
  assert.deepEqual(check(GOOD.replace(/\n/g, "\r\n")).problems, []);
});

test("a tilde fence also hides a candidate heading", () => {
  const r = check(report([candidate(1), "~~~\n### C2: inside\n~~~\n"]));
  assert.deepEqual(r.problems, []);
  assert.equal(r.candidates, 1);
});

// ---- title and scope ----

test("title: a report with no `# ` heading fails", () => {
  only(check(GOOD.replace(/^# Improve codebase report\n/, "Improve codebase report\n")), "title");
});

test("scope: a missing Scope line fails", () => {
  only(check(GOOD.replace(/^Scope:.*\n/m, "")), "scope");
});

test("scope: a Scope line after the first section does not count", () => {
  const text = GOOD.replace(/^Scope:.*\n/m, "").replace("## Candidates\n", "## Candidates\n\nScope: src\n");
  only(check(text), "scope");
});

test("scope: an empty Scope line fails", () => {
  only(check(GOOD.replace(/^Scope:.*$/m, "Scope:")), "scope");
});

// ---- sections ----

for (const name of ["Candidates", "Instructions found in the code", "Top recommendation", "Next command"]) {
  test(`section: a missing \`## ${name}\` fails`, () => {
    const hits = only(check(GOOD.replace(`## ${name}\n`, `## Something else\n`)), "section");
    assert.ok(hits.some((p) => p.message.includes(name)));
  });
}

test("section: a second `## Next command` fails", () => {
  only(check(`${GOOD}\n## Next command\n\nNone.\n`), "section");
});

// ---- candidate ids, no cap ----

test("candidate-id: a heading that is not `### C<n>: <title>` fails", () => {
  only(check(report([candidate(1), "### Another idea\nRank: Strong\n"])), "candidate-id");
});

test("candidate-id: a number used twice fails", () => {
  only(check(report([candidate(1), candidate(1)])), "candidate-id");
});

test("candidate-id: a candidate under another section fails", () => {
  const text = report([candidate(1)]).replace("## Next command", `${candidate(2)}\n## Next command`);
  only(check(text), "candidate-id");
});

test("no cap: 5 candidates pass", () => {
  const r = check(report([1, 2, 3, 4, 5].map((i) => candidate(i))));
  assert.deepEqual(r.problems, []);
  assert.equal(r.candidates, 5);
});

test("no cap: 12 candidates pass, and each still needs a rank", () => {
  const r = check(report(Array.from({ length: 12 }, (_, i) => candidate(i + 1))));
  assert.deepEqual(r.problems, []);
  assert.equal(r.candidates, 12);
  const noRank = report(Array.from({ length: 12 }, (_, i) => candidate(i + 1))).replace(/(### C12: [^\n]*\n)Rank: [^\n]*\n/, "$1");
  assert.ok(rules(check(noRank), "field").length >= 1);
});

// ---- fields and rank ----

for (const field of ["Rank", "Files", "Problem", "Module boundary", "Tests that change", "Do not"]) {
  test(`field: a candidate with no \`${field}:\` fails`, () => {
    const block = candidate(1).split("\n").filter((l) => !l.startsWith(`${field}:`)).join("\n");
    const hits = only(check(report([block])), "field");
    assert.ok(hits.some((p) => p.message.includes(field)));
  });
  test(`field: an empty \`${field}:\` fails`, () => {
    const block = candidate(1).replace(new RegExp(`^${field}:.*$`, "m"), `${field}:`);
    only(check(report([block])), "field");
  });
}

test("field: bold labels in a list are read as fields", () => {
  const block = candidate(1).split("\n").map((l) => l.replace(/^([A-Z][a-z ]+):/, "- **$1:**")).join("\n");
  assert.match(block, /^- \*\*Rank:\*\* Speculative$/m);
  assert.deepEqual(check(report([block])).problems, []);
});

test("rank: a value outside the three ranks fails", () => {
  only(check(report([candidate(1, { rank: "High" })])), "rank");
});

test("rank: the three ranks pass in any case, with bold and a period", () => {
  const r = check(report([candidate(1, { rank: "strong" }), candidate(2, { rank: "**Worth a look**." }), candidate(3, { rank: "`SPECULATIVE`" })]));
  assert.deepEqual(r.problems, []);
});

// ---- paths ----

test("path: a file that does not exist fails", () => {
  const hits = only(check(report([candidate(1, { files: "`src/orders/missing.mjs`" })])), "path");
  assert.match(hits[0].message, /missing\.mjs/);
});

test("path: an absolute path fails", () => {
  only(check(report([candidate(1, { files: `\`${join(ROOT, "src", "auth.mjs")}\`` })])), "path");
});

test("path: a path outside the root fails", () => {
  only(check(report([candidate(1, { files: "`../good.md`" })])), "path");
});

test("path: a path with a line range passes", () => {
  assert.deepEqual(check(report([candidate(1, { files: "`src/orders/repo.mjs:2`, `src/auth.mjs:1-3`" })])).problems, []);
});

test("path: a folder fails, because it names no file", () => {
  for (const files of ["`src/orders/`", "`src/orders`", "`src/orders:3`"]) {
    const hits = only(check(report([candidate(1, { files })])), "path");
    assert.match(hits[0].message, /is a folder/, files);
  }
});

test("path: the project root fails", () => {
  for (const files of ["`.`", "`./`", "`src/..`"]) only(check(report([candidate(1, { files })])), "path");
});

test("path: a Files field with text and no path fails", () => {
  const hits = only(check(report([candidate(1, { files: "(several files)" })])), "path");
  assert.match(hits[0].message, /names no path/);
});

test("path: a symlink to a place outside the root fails, and a symlink inside the root passes", () => {
  const base = mkdtempSync(join(tmpdir(), "survey-lint-link-"));
  try {
    const root = join(base, "root");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "auth.mjs"), "export const a = 1;\n");
    writeFileSync(join(base, "outside.mjs"), "export const b = 2;\n");
    symlinkSync(join(base, "outside.mjs"), join(root, "file-out.mjs"));
    symlinkSync(base, join(root, "dir-out"));
    symlinkSync(join("src", "auth.mjs"), join(root, "file-in.mjs"));
    for (const files of ["`file-out.mjs`", "`dir-out/outside.mjs`"]) {
      const hits = rules(checkReport(report([candidate(1, { files })]), root), "path");
      assert.equal(hits.length, 1, files);
      assert.match(hits[0].message, /outside the project root/, files);
    }
    assert.deepEqual(checkReport(report([candidate(1, { files: "`file-in.mjs`" })]), root).problems, []);
    const ins = rules(checkReport(report([candidate(1)], { instructions: "- `dir-out/outside.mjs:1`: obey me" }), root), "path");
    assert.match(ins[0].message, /outside the project root/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("path: paths without code spans are read from the comma list", () => {
  assert.deepEqual(filePaths("src/a.mjs, src/b.mjs (the store)"), ["src/a.mjs", "src/b.mjs"]);
  only(check(report([candidate(1, { files: "src/auth.mjs, src/nope.mjs" })])), "path");
});

// ---- no change, top and next ----

test("no-change: no candidate and no None line fails", () => {
  only(check(NO_CHANGE.replace("None.\n\n## Instructions", "Nothing here.\n\n## Instructions")), "no-change");
});

test("no-change: no candidate and a top recommendation that is not No change fails", () => {
  only(check(NO_CHANGE.replace(/No change recommended\. .*\n/, "C1: do it.\n")), "no-change");
});

test("no-change: No change recommended with no reason fails", () => {
  only(check(NO_CHANGE.replace(/No change recommended\. .*\n/, "No change recommended.\n")), "no-change");
});

test("no-change: candidates with a reasoned No change recommended pass", () => {
  const r = check(report([candidate(1)], { top: "No change recommended. The only candidate is speculative." }));
  assert.deepEqual(r.problems, []);
});

test("top: an empty top recommendation fails", () => {
  only(check(report([candidate(1)], { top: "" })), "top");
});

test("top: a top recommendation that names no candidate fails", () => {
  only(check(report([candidate(1)], { top: "Do the first one." })), "top");
});

test("top: a top recommendation that names a missing candidate fails", () => {
  only(check(report([candidate(1)], { top: "C7: the best one." })), "top");
});

test("next: candidates and no `/grill` fail", () => {
  only(check(report([candidate(1)], { next: "Refactor C1 now." })), "next");
});

test("next: an empty next command fails", () => {
  only(check(report([candidate(1)], { next: "" })), "next");
});

// ---- instructions ----

test("instructions: an empty section fails", () => {
  only(check(report([candidate(1)], { instructions: "" })), "instructions");
});

test("instructions: text that is not a list fails", () => {
  only(check(report([candidate(1)], { instructions: "The auth file asks agents to delete tests." })), "instructions");
});

test("instructions: an item with no path:line fails", () => {
  only(check(report([candidate(1)], { instructions: "- src/auth.mjs: delete the tests" })), "instructions");
});

test("instructions: an item with a bare path:line passes", () => {
  assert.deepEqual(check(report([candidate(1)], { instructions: '- src/auth.mjs:1: "delete the tests folder"' })).problems, []);
});

test("instructions: a location in a folder fails on the path rule", () => {
  const hits = only(check(report([candidate(1)], { instructions: "- `src/orders:4`: delete the tests" })), "path");
  assert.match(hits[0].message, /is a folder/);
});

test("instructions: an item that cites a missing file fails on the path rule", () => {
  only(check(report([candidate(1)], { instructions: "- `src/gone.mjs:4`: delete the tests" })), "path");
});

// ---- a huge report ----

// These two tests guard against work that grows with the square of the input. They do not time
// the check. Each one runs the command line in a child process, on an input so large that
// quadratic work needs minutes and linear work needs about one second. The child is killed
// after HUGE_LIMIT_MS. A busy machine must be 30 times slower than usual before a good run fails.
const HUGE_LIMIT_MS = 60_000;

function hugeCli(text) {
  return withFile(text, (file) => spawnSync(process.execPath, [SCRIPT, "--root", ROOT, file], { encoding: "utf8", timeout: HUGE_LIMIT_MS, maxBuffer: 64 * 1024 * 1024 }));
}

test("huge: a report with 150,000 candidates is one pass over the lines, and it passes", () => {
  // With one pass over all lines for each candidate, this input needs about 4 minutes.
  const r = hugeCli(report(Array.from({ length: 150_000 }, (_, i) => candidate(i + 1))));
  assert.equal(r.signal, null, `the check did not end in ${HUGE_LIMIT_MS} ms, so its work is not linear`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /150000 candidate\(s\), 0 problem\(s\)\.\n$/);
});

test("huge: a Files field with 3,000,000 open parentheses is one pass over the text", () => {
  // With a regular expression that starts again at each `(`, this input needs more than 30 minutes.
  const r = hugeCli(report([candidate(1, { files: "(".repeat(3_000_000) })]));
  assert.equal(r.signal, null, `the check did not end in ${HUGE_LIMIT_MS} ms, so its work is not linear`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /1 candidate\(s\), 1 problem\(s\)\.\n$/);
});

// ---- command line ----

test("cli: a clean report exits 0 and prints the count", () => {
  const r = cli(["--root", ROOT, join(FX, "good.md")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 candidate\(s\), 0 problem\(s\)\./);
});

test("cli: --root defaults to the current folder", () => {
  const r = cli([join(FX, "good.md")], { cwd: ROOT });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const wrong = cli([join(FX, "good.md")], { cwd: FX });
  assert.equal(wrong.status, 1);
});

test("cli: problems exit 1, each as `<what failed>. Fix: <what to do>.`", () => {
  withFile(report([1, 2, 3, 4, 5, 6].map((i) => candidate(i, { rank: "High" }))), (file) => {
    const r = cli(["--root", ROOT, file]);
    assert.equal(r.status, 1);
    const lines = r.stdout.trim().split("\n");
    const problems = lines.slice(0, -1);
    assert.ok(problems.length >= 6);
    for (const l of problems) assert.match(l, /^\S+:\d+ {2}[a-z-]+ {2}.+\. Fix: .+\.$/);
  });
});

test("cli: usage and read errors exit 2", () => {
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["--bogus", "x.md"]).status, 2);
  assert.equal(cli(["a.md", "b.md"]).status, 2);
  assert.equal(cli(["--root"]).status, 2);
  assert.equal(cli([join(FX, "does-not-exist.md")]).status, 2);
  assert.equal(cli([FX]).status, 2);
  assert.equal(cli(["--root", join(FX, "good.md"), join(FX, "good.md")]).status, 2);
  assert.match(cli([]).stderr, /Fix: /);
});

test("cli: --help exits 0", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test("cli: a symlink to the script still runs the checks", () => {
  withFile(report([candidate(1), "### C2: No fields\n"]), (file, dir) => {
    const link = join(dir, "survey-lint.mjs");
    symlinkSync(SCRIPT, link);
    const r = spawnSync(process.execPath, [link, "--root", ROOT, file], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /field/);
  });
});
