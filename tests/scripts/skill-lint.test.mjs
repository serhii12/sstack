import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, parseFrontmatter } from "../../scripts/skill-lint.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "skill-lint.mjs");

function skillText({ name, description = "Does a thing.", typed = false, body = "", provenance = true }) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    ...(typed ? ["disable-model-invocation: true"] : []),
    "---",
    "",
    `# ${name}`,
    "",
    body,
    ...(provenance ? ["", "## Provenance", "", "- Source file, repo, MIT, Someone. Changed: plain English."] : []),
    "",
  ].join("\n");
}

const ROUTER = (rows) => ["<!-- skills:begin -->", ...rows, "<!-- skills:end -->"].join("\n");

/** Build a clean fixture, apply overrides, return the root dir. Callers rm it via cleanup. */
function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-lint-"));
  const files = {
    "scripts/check.mjs": "// check\n",
    "hooks/guard.mjs": "// guard\n",
    "skills/start/SKILL.md": skillText({
      name: "start",
      typed: true,
      body: `A rule. Held by: scripts/check.mjs\n\n${ROUTER(["start | typed | Sort a task", "ship | typed | Ship it", "helper | agent | Help out"])}`,
    }),
    "skills/ship/SKILL.md": skillText({ name: "ship", typed: true, body: "Ship the change. No fence yet" }),
    "skills/helper/SKILL.md": skillText({ name: "helper", body: "Help. No fence yet" }),
    ...overrides,
  };
  for (const [rel, content] of Object.entries(files)) {
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

const rules = (result, rule) => result.problems.filter((p) => p.rule === rule);

test("clean fixture has no problems and counts No fence yet", () => {
  const r = run();
  assert.deepEqual(r.problems, []);
  assert.equal(r.skills, 3);
  assert.equal(r.noFenceYet, 2);
});

// ---- rule 1: frontmatter ----

test("frontmatter: missing description fails", () => {
  const r = run({ "skills/helper/SKILL.md": "---\nname: helper\n---\n# h\n\n## Provenance\n" });
  const hits = rules(r, "frontmatter");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /description/);
});

test("frontmatter: unparseable value fails clearly", () => {
  const r = run({ "skills/helper/SKILL.md": "---\nname: helper\ndescription: ok\ntags:\n  - a\n---\n# h\n\n## Provenance\n" });
  const hits = rules(r, "frontmatter");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /cannot parse/);
  assert.equal(hits[0].line, 5);
});

test("frontmatter: unquoted colon and quoted colon", () => {
  assert.match(parseFrontmatter("---\nname: a\ndescription: Do this: now\n---\n").error.message, /unquoted/);
  assert.equal(parseFrontmatter('---\nname: a\ndescription: "Do this: now"\n---\n').data.description, "Do this: now");
});

test("frontmatter: no frontmatter block fails", () => {
  const r = run({ "skills/helper/SKILL.md": "# no frontmatter\n\n## Provenance\n" });
  assert.equal(rules(r, "frontmatter").length, 1);
});

test("name must equal folder", () => {
  const r = run({ "skills/helper/SKILL.md": skillText({ name: "other-name", body: "x" }) });
  const hits = rules(r, "name-folder");
  assert.equal(hits.length, 1);
  assert.match(hits[0].fix, /name: helper/);
});

// ---- rule 2: pointers ----

test("pointers: existing links and paths pass, project files and placeholders are ignored", () => {
  const r = run({
    "skills/helper/REFERENCE.md": "ref\n",
    "skills/helper/SKILL.md": skillText({
      name: "helper",
      body: [
        "See [the reference](REFERENCE.md) and `REFERENCE.md` and `scripts/check.mjs` and `hooks/guard.mjs`.",
        "Read `AGENTS.md` and `GLOSSARY.md` and `docs/adr/0001-x.md` in the project.",
        "Template names like `skills/<name>/SKILL.md` and `tests/hooks/*.test.mjs` are patterns.",
        "[web](https://example.com/x.md) and [anchor](#top).",
        "```",
        "node scripts/check.mjs",
        "```",
      ].join("\n"),
    }),
  });
  assert.deepEqual(rules(r, "pointer"), []);
});

test("pointers: GLOSSARY-MAP.md is a project-root file and is not reported, a missing repo file still is", () => {
  const ok = run({
    "skills/helper/SKILL.md": skillText({ name: "helper", body: "If `GLOSSARY-MAP.md` exists at the root, read it." }),
  });
  assert.deepEqual(rules(ok, "pointer"), []);
  const bad = run({
    "skills/helper/SKILL.md": skillText({ name: "helper", body: "If `GLOSSARY-MAP.md` exists, read it. Also see `OTHER-MAP.md`." }),
  });
  assert.equal(rules(bad, "pointer").length, 1);
});

test("pointers: missing link, missing backticked repo path, missing sibling fail", () => {
  const r = run({
    "skills/helper/SKILL.md": skillText({
      name: "helper",
      body: ["See [ref](MISSING.md).", "Run `scripts/nope.mjs`.", "Also `NOTES.md` here.", "```", "node hooks/gone.mjs", "```"].join("\n"),
    }),
  });
  const hits = rules(r, "pointer");
  assert.equal(hits.length, 4);
  assert.deepEqual(hits.map((h) => h.message.match(/`([^`]+)`/)[1]).sort(), ["MISSING.md", "NOTES.md", "hooks/gone.mjs", "scripts/nope.mjs"]);
});

test("pointers: source paths named in the Provenance section are not checked", () => {
  const r = run({
    "skills/helper/SKILL.md": skillText({ name: "helper", body: "x" }).replace("- Source file", "- `skills/engineering/other/SKILL.md` from another repo. Source file"),
  });
  assert.deepEqual(rules(r, "pointer"), []);
});

// ---- rule 3: Held by ----

test("held-by: existing path passes", () => {
  assert.deepEqual(rules(run(), "held-by"), []);
});

test("held-by: missing path fails", () => {
  const r = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "Rule. Held by: tests/hooks/none.test.mjs" }) });
  const hits = rules(r, "held-by");
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /does not exist/);
});

test("held-by: `planned:` target is an error, `No fence yet (planned: ...)` is allowed and counted", () => {
  const bad = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "Rule. Held by: planned: tests/x.test.mjs" }) });
  assert.equal(rules(bad, "held-by-planned").length, 1);
  const good = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "Rule. No fence yet (planned: tests/x.test.mjs)" }) });
  assert.deepEqual(rules(good, "held-by-planned"), []);
  assert.deepEqual(rules(good, "held-by"), []);
  assert.equal(good.noFenceYet, 2);
});

test("held-by: `Held by: No fence yet` passes and is counted", () => {
  const r = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "Rule. Held by: No fence yet" }) });
  assert.deepEqual(rules(r, "held-by"), []);
  assert.equal(r.noFenceYet, 2);
});

// ---- rule 4: typed chain ----

test("typed-chain: typed workflow that tells the agent to run another typed workflow fails", () => {
  const r = run({ "skills/start/SKILL.md": startWith("Then run /ship to finish.\nOr load the `ship` skill.") });
  const hits = rules(r, "typed-chain");
  assert.equal(hits.length, 2);
  assert.match(hits[0].fix, /\/ship/);
});

test("typed-chain: lines that tell the USER to type it are allowed", () => {
  const r = run({ "skills/start/SKILL.md": startWith("Tell the user: type `/ship` when ready.\nThe next command is /ship.") });
  assert.deepEqual(rules(r, "typed-chain"), []);
});

test("typed-chain: an agent skill may mention a typed skill, and paths are not references", () => {
  const helper = skillText({ name: "helper", body: "Suggest /ship at the end. No fence yet" });
  const start = startWith("See skills/ship/SKILL.md for details.");
  const r = run({ "skills/helper/SKILL.md": helper, "skills/start/SKILL.md": start });
  assert.deepEqual(rules(r, "typed-chain"), []);
});

function startWith(extra) {
  return skillText({
    name: "start",
    typed: true,
    body: `${extra}\n\n${ROUTER(["start | typed | Sort a task", "ship | typed | Ship it", "helper | agent | Help out"])}`,
  });
}

// ---- rule 5: router ----

test("router: wrong type, missing folder entry and unknown entry each fail", () => {
  const r = run({
    "skills/start/SKILL.md": skillText({
      name: "start",
      typed: true,
      body: ROUTER(["start | typed | Sort", "ship | agent | Ship it", "ghost | agent | Not there"]),
    }),
  });
  const msgs = rules(r, "router").map((p) => p.message);
  assert.equal(msgs.length, 3);
  assert.ok(msgs.some((m) => /ship.*agent.*typed/.test(m)));
  assert.ok(msgs.some((m) => /ghost/.test(m)));
  assert.ok(msgs.some((m) => /skills\/helper\/ is not in the router/.test(m)));
});

test("router: missing markers and malformed line fail", () => {
  const none = run({ "skills/start/SKILL.md": skillText({ name: "start", typed: true, body: "no block" }) });
  assert.equal(rules(none, "router").length, 1);
  const bad = run({
    "skills/start/SKILL.md": skillText({
      name: "start",
      typed: true,
      body: ROUTER(["start | typed | Sort", "ship | typed | Ship", "helper | agent | Help", "just a sentence"]),
    }),
  });
  assert.equal(rules(bad, "router").length, 1);
  assert.match(rules(bad, "router")[0].message, /name \| type \| purpose/);
});

test("router: missing start skill fails", () => {
  const r = run({ "skills/start/SKILL.md": null });
  assert.equal(rules(r, "router").length, 1);
});

// ---- rule 6: text rules ----

test("text: em dash and en dash fail", () => {
  const r = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "One — two.\nRange 1–5." }) });
  const hits = rules(r, "dash");
  assert.equal(hits.length, 2);
  assert.match(hits[0].message, /em/);
  assert.match(hits[1].message, /en/);
});

test("text: semicolon in prose fails, in inline code or code block passes", () => {
  const bad = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "First; second." }) });
  assert.equal(rules(bad, "semicolon").length, 1);
  const ok = run({
    "skills/helper/SKILL.md": skillText({ name: "helper", body: "Use `a; b` here.\n```js\nconst a = 1; const b = 2;\n```\nEntity &amp; fine." }),
  });
  assert.deepEqual(rules(ok, "semicolon"), []);
});

test("text: missing Provenance section fails", () => {
  const r = run({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "x", provenance: false }) });
  assert.equal(rules(r, "provenance").length, 1);
});

test("text: 150 lines pass, 151 fail", () => {
  const sized = (total) => {
    for (let n = 0; n < 400; n++) {
      const t = skillText({ name: "helper", body: Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") });
      if (t.replace(/\n$/, "").split("\n").length === total) return t;
    }
    throw new Error("cannot size fixture");
  };
  assert.deepEqual(rules(run({ "skills/helper/SKILL.md": sized(150) }), "max-lines"), []);
  assert.equal(rules(run({ "skills/helper/SKILL.md": sized(151) }), "max-lines").length, 1);
});

// ---- CLI ----

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("cli: exit 0 on a clean fixture, 1 with one formatted line per problem, --json is machine readable", () => {
  const clean = fixture();
  const dirty = fixture({ "skills/helper/SKILL.md": skillText({ name: "helper", body: "Bad — dash.", provenance: false }) });
  try {
    const ok = cli([clean]);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);

    const bad = cli([dirty]);
    assert.equal(bad.status, 1);
    const lines = bad.stdout.split("\n").filter((l) => /^skills\//.test(l));
    assert.equal(lines.length, 2);
    for (const l of lines) assert.match(l, /^skills\/helper\/SKILL\.md:\d+ {2}[a-z-]+ {2}.+ {2}Fix: .+/);

    const js = cli(["--json", dirty]);
    assert.equal(js.status, 1);
    const parsed = JSON.parse(js.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.problems.length, 2);
    assert.equal(typeof parsed.noFenceYet, "number");
    assert.deepEqual(Object.keys(parsed.problems[0]).sort(), ["fix", "line", "message", "path", "rule"]);

    const cleanJson = JSON.parse(cli(["--json", clean]).stdout);
    assert.equal(cleanJson.ok, true);
    assert.equal(cleanJson.noFenceYet, 2);
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  }
});

test("cli: exit 2 on a missing skills dir, unknown flag and extra arguments", () => {
  const empty = mkdtempSync(join(tmpdir(), "skill-lint-empty-"));
  try {
    assert.equal(cli([empty]).status, 2);
    assert.equal(cli(["--nope"]).status, 2);
    assert.equal(cli([empty, empty]).status, 2);
    assert.match(cli([empty]).stderr, /no skills\/ directory/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("pointers: a broken link in a file beside SKILL.md fails, links in code fences and URLs pass", () => {
  const bad = run({ "skills/helper/REFERENCE.md": "See [gone](GONE.md) and [web](https://example.com/a.md).\n" });
  const hits = rules(bad, "pointer");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "skills/helper/REFERENCE.md");
  assert.equal(hits[0].line, 1);
  const ok = run({
    "skills/helper/OTHER.md": "x\n",
    "skills/helper/REFERENCE.md": ["See [other](OTHER.md).", "```md", "- [example](./src/none/GLOSSARY.md)", "```", ""].join("\n"),
  });
  assert.deepEqual(rules(ok, "pointer"), []);
});
