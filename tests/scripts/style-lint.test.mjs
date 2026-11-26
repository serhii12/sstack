import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASIS, RULES, checkText, countWords, houseScan, lintStyle, splitSentences } from "../../scripts/style-lint.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "style-lint.mjs");

const rulesOf = (text) => checkText(text).findings.map((f) => f.rule);
const has = (text, rule) => rulesOf(text).includes(rule);
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

/** One failing and one passing text for each rule. */
const CASES = [
  ["sentence-length", `This sentence has ${words(23)}.`, `This sentence has ${words(22)}.`],
  ["banned-modal", "The agent should read the file.", "The agent must read the file."],
  ["banned-modal", "The agent may read the file.", "The agent can read the file."],
  ["contraction", "The agent doesn't read the file.", "The agent does not read the file."],
  ["contraction", "It's a file.", "This is a file."],
  ["semicolon", "Read the file; then stop.", "Read the file. Then stop."],
  ["dash", "Read the file — then stop.", "Read the file. Then stop."],
  ["dash", "Read pages 1–5.", "Read pages 1 to 5."],
  ["not-x-but-y", "This is not a tool but a teammate.", "This is a teammate."],
  ["not-x-but-y", "The skill is not just a checklist.", "The skill is a checklist."],
  ["present-perfect", "The build has been green.", "The build is green."],
  ["present-perfect", "The user has changed the file.", "The user changes the file."],
  ["is-being", "The table is being rebuilt.", "The database rebuilds the table."],
  ["slop-word", "Leverage the cache.", "Use the cache."],
  ["slop-word", "The tool simply runs the test.", "The tool runs the test."],
  ["slop-phrase", "It is worth noting that the cache is cold, so it takes time.", "The cache is cold, so it takes time."],
  ["slop-phrase", "The cache serves as a buffer.", "The cache is a buffer."],
  ["bold-bullet", "- **Speed:** it is fast.", "- It is fast."],
  ["instruction-length", `1. ${words(22)}.`, `1. ${words(18)}.`],
  ["condition-last", "Read the log if the build fails.", "If the build fails, read the log."],
  ["passive", "The file is created by the build.", "The build creates the file."],
  ["word-choice", "Ensure the file exists.", "Make sure that the file exists."],
  ["synonyms", "Check the log.\n\nVerify the build.", "Check the log.\n\nCheck the build."],
  ["synonyms", "Read the config.\n\nChange the settings.", "Read the config.\n\nChange the config."],
  // House checks ported from slop_check.py.
  ["dash", "Read the file - then stop.", "Read the file. Then stop."],
  ["not-x-but-y", "This is not the cache.", "This is a buffer."],
  ["not-x-but-y", "Use the cache rather than the disk.", "Use the cache. Do not use the disk."],
  ["not-x-but-y", "Not a tool. Not a toy. A teammate.", "A teammate."],
  ["slop-word", "Find the test seam.", "Find the test boundary."],
  ["slop-word", "Check the navigation.", "Check the menu."],
  ["slop-word", "The harness runs the hook.", "The agent tool runs the hook."],
  ["slop-phrase", "It has all in one place.", "It has one place for all of it."],
  ["slop-phrase", "Fix this TODO first.", "Fix this item first."],
  ["slop-phrase", "Why? Because it fails.", "It fails, so stop."],
  ["stiff-transition", "Read the log. Thus the build fails.", "Read the log. As a result, the build fails."],
  ["stiff-transition", "Moreover, read the log.", "Also read the log."],
  ["punctuation", "Read the \u201cfile\u201d now.", 'Read the "file" now.'],
  ["punctuation", "Read the file \u2192 stop.", "Read the file, then stop."],
  ["punctuation", "It works!", "It works."],
  ["punctuation", "Then wait...", "Then wait."],
  ["mid-sentence-bold", "Read the **whole** file.", "**Important.** Read the whole file."],
  ["heading-case", "## How The Loop Works", "## How the loop works"],
  // STE 1.14: American spelling.
  ["spelling", "The behaviour changes.", "The behavior changes."],
  ["spelling", "Read the licence.", "Read the license."],
  ["spelling", "Summarise the log.", "Summarize the log."],
  ["spelling", "It is a judgement call.", "It is a judgment call."],
  ["spelling", "The data keeps travelling.", "The data keeps traveling."],
  ["spelling", "Change the colour.", "Change the color."],
];

for (const [rule, bad, good] of CASES) {
  test(`${rule}: fails on bad text (${bad.slice(0, 30).replace(/\n/g, " ")})`, () => {
    assert.ok(has(bad, rule), `expected ${rule} in: ${JSON.stringify(rulesOf(bad))}`);
  });
  test(`${rule}: passes on good text (${good.slice(0, 30).replace(/\n/g, " ")})`, () => {
    assert.ok(!has(good, rule), `unexpected ${rule}`);
  });
}

test("every rule has a failing case", () => {
  const covered = new Set(CASES.map((c) => c[0]));
  for (const r of Object.keys(RULES)) assert.ok(covered.has(r), r);
});

test("every rule is labeled STE or house rule, and each message says which", () => {
  for (const r of Object.keys(RULES)) assert.match(BASIS[r], /^(?:STE |house rule$)/, r);
  for (const [rule, bad] of CASES) {
    for (const f of checkText(bad).findings.filter((x) => x.rule === rule)) assert.match(f.message, /\[(?:STE [^\]]+|house rule)\]$/, f.message);
  }
  assert.equal(BASIS.dash, "house rule");
  assert.equal(BASIS["stiff-transition"], "house rule");
  assert.equal(BASIS.semicolon, "STE 8.1");
  assert.equal(BASIS.spelling, "STE 1.14");
});

test("the lint-only not-X-but-Y check skips double-quoted text, so a file can name the rule", () => {
  assert.ok(!has('Do not write "not X but Y".', "not-x-but-y"));
  assert.ok(has("It is not a tool but a toy.", "not-x-but-y"));
});

test("check as a verb is a declared exception", () => {
  assert.deepEqual(rulesOf("Check the log. Then check the build."), []);
});

test("spelling: the fix gives the American form", () => {
  const fixOf = (t) => checkText(t).findings.find((f) => f.rule === "spelling").fix;
  assert.match(fixOf("The behaviours change."), /`behaviors`/);
  assert.match(fixOf("Organise the files."), /`Organize`/);
  assert.match(fixOf("The centred text."), /`centered`/);
  assert.match(fixOf("It is catalogued."), /`cataloged`/);
});

test("spelling: American words and look-alikes pass", () => {
  for (const t of ["Write a precise summary.", "Use the exercise.", "The cancellation is final.", "Read the analyses.", "The emphasis is on tests.", "Use an expert, and revise it.", "The parameter is set.", "Read the hour and the tour.", "The realism is fine."]) {
    assert.ok(!has(t, "spelling"), t);
  }
});

test("spelling also runs in the Provenance section, but skips code and quoted text", () => {
  assert.ok(has("## Provenance\n\nMIT licence.\n", "spelling"));
  assert.ok(!has("## Provenance\n\nFrom `test-behaviour/SKILL.md`. It says \"keep the behaviour\".\n", "spelling"));
});

test("house checks skip inline code and fences like slop_check.py, and read everything else", () => {
  assert.deepEqual(houseScan("Use `seam` and `a; b`.\n```\nseam; harness\n```\n"), []);
  assert.deepEqual(houseScan("~~~\nseam\n~~~\n"), []);
  const hits = houseScan('Print "a; b".\n\n## Provenance\n\nThe source calls it a seam.\n<!-- harness -->\n');
  assert.deepEqual(hits.map((h) => [h.line, h.rule]).sort(), [[1, "semicolon"], [5, "slop-word"], [6, "slop-word"]]);
});

test("house checks: a pattern can match across a line break, as in slop_check.py", () => {
  assert.deepEqual(houseScan("Read it. It is not\njust a file.\n").map((h) => [h.line, h.name]).sort(), [[1, "isn't about / isn't just"], [1, "not just / not only"]]);
});

test("a sentence of 26 words in an instruction is an error, 21 to 25 is a warning", () => {
  const f25 = checkText(`1. ${words(25)}.`).findings;
  assert.deepEqual(f25.map((f) => [f.rule, f.level]), [["instruction-length", "warning"]]);
  const f26 = checkText(`1. ${words(26)}.`).findings;
  assert.deepEqual(f26.map((f) => [f.rule, f.level]), [["sentence-length", "error"]]);
});

test("a description sentence of 21 to 25 words is not a warning", () => {
  assert.deepEqual(rulesOf(`A paragraph that describes the tool. It has ${words(20)}.`), []);
});

const router = (purpose) => `<!-- skills:begin -->\nstart | typed | Sort a task\ngrill | agent | ${purpose}\n<!-- skills:end -->`;

test("each router line is checked as its own line", () => {
  assert.ok(!has(router("Interview the user."), "sentence-length"));
  const many = `${router(`Interview ${words(10)}.`)}`.replace("<!-- skills:end -->", `more | agent | Interview ${words(10)}.\n<!-- skills:end -->`);
  assert.ok(!has(many, "sentence-length"), "two short lines must not join into one long sentence");
});

test("a router purpose over 25 words is an error on its own line", () => {
  const f = checkText(router(`Interview ${words(25)}.`)).findings.filter((x) => x.rule === "sentence-length");
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 3);
});

test("a router purpose of 25 words passes", () => {
  assert.ok(!has(router(`Interview ${words(24)}.`), "sentence-length"));
});

test("lines outside the router markers still join as one paragraph", () => {
  assert.ok(has(`Interview ${words(14)}\nand ${words(14)}.`, "sentence-length"));
});

test("ticket and issue are two concepts, not synonyms", () => {
  assert.ok(!has("Split the spec into tickets.\n\nFile the issue in the tracker.", "synonyms"));
});

test("a bullet that starts with a verb is an instruction", () => {
  assert.ok(has(`- Read ${words(21)}.`, "instruction-length"));
  assert.ok(!has(`- The tool reads ${words(21)}.`, "instruction-length"));
});

test("condition after the command is not flagged for a reported question", () => {
  assert.ok(!has("Ask the user if the plan is right.", "condition-last"));
  assert.ok(!has("Say when to read it.", "condition-last"));
});

test("findings report the line number of the text", () => {
  const f = checkText("Fine line.\n\nRead the file; stop.\n").findings;
  assert.equal(f[0].line, 3);
  assert.equal(f[0].path, "file.md");
});

// ---------- skip rules ----------

test("skip: fenced code block", () => {
  assert.deepEqual(rulesOf("Text.\n\n```\nThe user should read it; don't — stop\n```\n"), []);
  assert.deepEqual(rulesOf("~~~js\nconst a = 1; // should\n~~~\n"), []);
});

test("skip: inline code", () => {
  assert.deepEqual(rulesOf("Use `should` and `a; b` and `don't` here."), []);
});

test("skip: frontmatter keys, but the description is checked", () => {
  const ok = "---\nname: some-skill\ndisable-model-invocation: true\ndescription: Does a thing.\n---\n\nBody.\n";
  assert.deepEqual(rulesOf(ok), []);
  const bad = "---\nname: some-skill\ndescription: The agent should do a thing.\n---\n\nBody.\n";
  assert.ok(has(bad, "banned-modal"));
  const quoted = `---\nname: x\ndescription: "Do a thing. ${words(30)}."\n---\n`;
  assert.ok(has(quoted, "sentence-length"));
});

test("skip: table separator rows, and cells are checked one by one", () => {
  assert.deepEqual(rulesOf("| A | B |\n|---|:--:|\n| One | Two |\n"), []);
  assert.ok(has("| A | B |\n|---|---|\n| The agent should stop | Two |\n", "banned-modal"));
  // Cells are separate sentences, so a long table row is fine.
  assert.ok(!has(`| ${words(20)} | ${words(20)} |\n`, "sentence-length"));
});

test("skip: URLs for the STE rules", () => {
  assert.deepEqual(rulesOf("See https://example.com/should-read?x=1&y=2 and [the docs](https://x.dev/dont) now."), []);
});

test("skip: Provenance section skips the STE rules until the next heading, and the house rules still run", () => {
  const text = "## Provenance\n\nCopied from the repo. It doesn't matter, so it should stay. Leverage it.\n\n## Next\n\nThe agent should stop.\n";
  const f = checkText(text).findings;
  assert.deepEqual(f.map((x) => [x.line, x.rule]), [[3, "slop-word"], [7, "banned-modal"]]);
});

test("skip: HTML comments for the STE rules, single line and multi-line", () => {
  assert.deepEqual(rulesOf("Text <!-- should, don't --> more text.\n"), []);
  assert.deepEqual(rulesOf("<!--\nThe agent should stop, don't\n-->\nDone.\n"), []);
  assert.ok(has("Text <!-- a; b --> more text.\n", "semicolon"), "house rules read comments, as slop_check.py does");
  assert.ok(has("<!-- open\nhidden -->\nThe agent should stop.\n", "banned-modal"));
});

test("skip: double-quoted fixed string for the STE rules", () => {
  assert.deepEqual(rulesOf('Print "You should not do this, don\'t" first.'), []);
  assert.ok(has('Print "x" and it should stop.', "banned-modal"));
  assert.ok(has('Print "a; b" first.', "semicolon"), "house rules read quoted text, as slop_check.py does");
});

// ---------- escape ----------

test("style-ok switches one rule off for one line and is counted", () => {
  const text = "The agent should stop. <!-- style-ok: banned-modal -->\nThe agent should go.\n";
  const r = checkText(text);
  assert.equal(r.escapeComments, 1);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.line]), [["banned-modal", 2]]);
});

test("style-ok only switches off the named rule", () => {
  const r = checkText("The agent should stop; now. <!-- style-ok: banned-modal -->\n");
  assert.deepEqual(r.findings.map((f) => f.rule), ["semicolon"]);
});

test("style-ok takes several rules", () => {
  const r = checkText("The agent should stop; now. <!-- style-ok: banned-modal, semicolon -->\n");
  assert.deepEqual(r.findings, []);
  assert.equal(r.escapeComments, 1);
});

test("style-ok also covers a sentence-length finding in a wrapped paragraph", () => {
  const text = `First line ${words(15)}\nsecond line ${words(15)}. <!-- style-ok: sentence-length -->\n`;
  assert.deepEqual(checkText(text).findings, []);
});

// ---------- sentence splitter ----------

test("splitter: splits on full stops, question marks and exclamation marks", () => {
  assert.deepEqual(splitSentences("Read it. Is it ready? Yes. Stop"), ["Read it.", "Is it ready?", "Yes.", "Stop"]);
});

test("splitter: does not break on e.g., i.e., or etc. before a lowercase word", () => {
  assert.deepEqual(splitSentences("Use a tool, e.g. the linter, and so on. Then stop."), ["Use a tool, e.g. the linter, and so on.", "Then stop."]);
  assert.deepEqual(splitSentences("Add files (a.js, b.js etc. and more) now. Done."), ["Add files (a.js, b.js etc. and more) now.", "Done."]);
});

test("splitter: does not break on an abbreviation before a capital letter", () => {
  assert.deepEqual(splitSentences("Use a tool, e.g. Node or Deno. Then stop."), ["Use a tool, e.g. Node or Deno.", "Then stop."]);
  assert.deepEqual(splitSentences("Do it vs. Node now. Done."), ["Do it vs. Node now.", "Done."]);
});

test("splitter: does not break on version numbers or file names", () => {
  assert.deepEqual(splitSentences("Use Node 20.11.1 or later. Read CONVENTIONS.md first. Edit package.json now."), ["Use Node 20.11.1 or later.", "Read CONVENTIONS.md first.", "Edit package.json now."]);
});

test("splitter: does not break on list markers", () => {
  const f = checkText("1. Read the file.\n2. Run the test.\n").findings;
  assert.deepEqual(f, []);
  assert.deepEqual(splitSentences("1.5 is a number. Next."), ["1.5 is a number.", "Next."]);
});

test("splitter: does not break on initials", () => {
  assert.deepEqual(splitSentences("Ask J. Smith about it. Then go."), ["Ask J. Smith about it.", "Then go."]);
});

test("splitter: breaks after a file name at the end of a sentence", () => {
  assert.deepEqual(splitSentences("Open notes.md. Then read it."), ["Open notes.md.", "Then read it."]);
});

test("word count: a code span is one word", () => {
  const long = "`node scripts/style-lint.mjs --json --max-warn 5 some/long/path.md`";
  assert.deepEqual(rulesOf(`Run ${long} now.`), []);
  assert.equal(countWords("Run CODE now."), 3);
});

test("word count: parentheses count as one word, hyphenated words count as one", () => {
  assert.equal(countWords("Read the file (the one in the root of the repo) now."), 5);
  assert.equal(countWords("Use a read-only, well-known file."), 5);
});

test("word count: 25 words pass and 26 fail through checkText", () => {
  assert.ok(!has(`${words(25)}.`, "sentence-length"));
  assert.ok(has(`${words(26)}.`, "sentence-length"));
});

// ---------- CLI and file selection ----------

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "style-lint-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

test("lintStyle checks skills, templates, evals, docs, README, CONVENTIONS and AGENTS only", () => {
  const root = repo({
    "skills/a/SKILL.md": "The agent should stop.\n",
    "skills/a/deep/ref.md": "The agent should stop.\n",
    "templates/t.md": "The agent should stop.\n",
    "README.md": "The agent should stop.\n",
    "CONVENTIONS.md": "The agent should stop.\n",
    "AGENTS.md": "The agent should stop.\n",
    "evals/a/01.md": "The agent should stop.\n",
    "evals/README.md": "The agent should stop.\n",
    "evals/.hidden/01.md": "The agent should stop.\n",
    "evals/a/notes.txt": "The agent should stop.\n",
    "docs/other.md": "The agent should stop.\n",
    "HANDOFF.md": "The agent should stop.\n",
  });
  try {
    const r = lintStyle(root);
    assert.equal(r.files, 9);
    assert.deepEqual(Object.keys(r.perFile).sort(), ["AGENTS.md", "CONVENTIONS.md", "README.md", "docs/other.md", "evals/README.md", "evals/a/01.md", "skills/a/SKILL.md", "skills/a/deep/ref.md", "templates/t.md"]);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("lintStyle reads the root AGENTS.md once, also when CLAUDE.md links to it", () => {
  const root = repo({ "AGENTS.md": "The agent should stop.\n" });
  try {
    symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
    const r = lintStyle(root);
    assert.equal(r.files, 1);
    assert.deepEqual(r.perFile, { "AGENTS.md": 1 });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("CLI: clean repo exits 0 and prints the escape count", () => {
  const root = repo({ "README.md": "The agent can stop. <!-- style-ok: dash -->\n" });
  try {
    const r = run([root]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /1 file\(s\) checked, 0 error\(s\), 0 warning\(s\), 1 style-ok escape\(s\)/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("CLI: an error exits 1 and prints path:line  rule  message  Fix:", () => {
  const root = repo({ "README.md": "Fine.\n\nThe agent should stop.\n" });
  try {
    const r = run([root]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^README\.md:3  banned-modal  .*  Fix: /m);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("CLI: warnings exit 0, and --max-warn turns too many warnings into exit 1", () => {
  const root = repo({ "README.md": "Read the log if the build fails.\n\nRead the file if it exists.\n" });
  try {
    assert.equal(run([root]).status, 0);
    assert.equal(run([root, "--max-warn", "2"]).status, 0);
    const r = run([root, "--max-warn", "1"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /over the limit of 1/);
    assert.equal(run([root, "--max-warn=0"]).status, 1);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("CLI: --json gives totals per rule and per file", () => {
  const root = repo({ "README.md": "The agent should stop; now.\n" });
  try {
    const r = run([root, "--json"]);
    assert.equal(r.status, 1);
    const j = JSON.parse(r.stdout);
    assert.equal(j.ok, false);
    assert.equal(j.errors, 2);
    assert.deepEqual(j.perRule, { "banned-modal": 1, semicolon: 1 });
    assert.deepEqual(j.perFile, { "README.md": 2 });
    assert.equal(j.styleOk, 0);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("CLI: usage errors exit 2", () => {
  assert.equal(run(["--bogus"]).status, 2);
  assert.equal(run(["--max-warn"]).status, 2);
  assert.equal(run(["--max-warn", "x"]).status, 2);
  assert.equal(run(["a", "b"]).status, 2);
  assert.equal(run(["/no/such/dir/anywhere"]).status, 2);
});

// The two bold checks must flag what slop_check.py flags, and no more. Each expected result below
// is what `python3 slop_check.py` printed for the same text on 25 Nov 2026. The checker lets bold
// before a period and a bold step label without a colon pass, so the lint lets them pass too.
test("bold: the two bold checks give the same result as slop_check.py", () => {
  const cases = [
    ["Read the **whole** file.", ["mid-sentence-bold"]],
    ["It is a **typed workflow**. It runs.", []],
    ["1. **Gather.** Read the logs.", []],
    ["- **Gather.** Read the logs.", []],
    ["- **Speed:** it is fast.", ["bold-bullet"]],
    ["- **Speed**: it is fast.", ["bold-bullet"]],
    ["1. **Speed:** it is fast.", ["bold-bullet"]],
    ["Use the **a**, then b.", []],
    ["**Important.** Read the file.", []],
    ["Read `a **b** c` now.", []],
    ["Read the (**whole**) file.", []],
  ];
  for (const [text, want] of cases) {
    const got = houseScan(text).map((h) => h.rule).filter((r) => r.includes("bold"));
    assert.deepEqual(got, want, text);
  }
});
