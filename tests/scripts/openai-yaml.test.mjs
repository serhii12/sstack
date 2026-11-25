import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER, openaiYaml, SHORT_MAX, shortDescription } from "../../scripts/openai-yaml.mjs";
import { parseFrontmatter } from "../../scripts/skill-lint.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "openai-yaml.mjs");

const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

function tempRoot(skills) {
  const root = mkdtempSync(join(tmpdir(), "openai-yaml-"));
  for (const [name, text] of Object.entries(skills)) {
    mkdirSync(join(root, "skills", name), { recursive: true });
    writeFileSync(join(root, "skills", name, "SKILL.md"), text);
  }
  return root;
}

const skill = (name, description, typed = false) =>
  `---\nname: ${name}\ndescription: ${description}\n${typed ? "disable-model-invocation: true\n" : ""}---\n\n# ${name}\n`;

// ---- short description ----

test("a description that fits is kept, without its final period", () => {
  assert.equal(shortDescription("Compares the options for a decision that has real trade-offs."), "Compares the options for a decision that has real trade-offs");
});

test("full sentences that fit are kept", () => {
  assert.equal(shortDescription("Short. Then a second short sentence here. And a third one that is longer."), "Short. Then a second short sentence here");
});

// Expected values: worked out by hand from each description. Each one ended mid-phrase with a plain word cut.
const MID_PHRASE = [
  ["Gives the shared terms and rules for the shape of code: module, interface, depth, module boundary, adapter and locality. Use when.", "Gives the shared terms and rules for the shape of code"],
  ["Interviews the user about a plan, design, decision or idea until the open decisions are settled. Use when.", "Interviews the user about a plan, design, decision or idea"],
  ["Builds throwaway code on a prototype branch to answer one design question that talk cannot settle. Use when.", "Builds throwaway code on a prototype branch"],
  ["Gathers proof that a change works and marks each acceptance check pass, fail or untested. Work.", "Gathers proof that a change works"],
  ["Find the issue tracker this repo uses (GitHub, GitLab, local files or another), set up the triage labels, confirm with you, and write the files in docs/agents/.", "Find the issue tracker this repo uses, set up the triage labels"],
  ["Sorts a task by type, records its evidence level in a handoff note, and names the next command to type.", "Sorts a task by type, records its evidence level"],
  ["Turn this conversation, usually a confirmed /grill summary, into one draft spec in the tracker. Asks nothing new.", "Turn this conversation into one draft spec in the tracker"],
  ["Push a finished ticket branch, open its pull request, wait for the checks, and merge it when the merge check passes.", "Push a finished ticket branch, open its pull request"],
  // A cut before the "and" of a list would keep half of the list.
  ["Reviews the plan with the team, then lists risks, costs, owners and dates for each open item.", "Reviews the plan with the team"],
];

for (const [description, want] of MID_PHRASE) {
  test(`cut at a full clause: ${want}`, () => {
    assert.equal(shortDescription(description), want);
  });
}

test("with no place to cut, the cut falls on a word boundary", () => {
  const words = "Aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp.";
  assert.equal(shortDescription(words), "Aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm");
});

test("every skill in this repo gets a short description that fits and ends on a whole word", () => {
  const dangling = /\s(?:a|an|the|and|or|of|to|its|each|for|in|on|by|with|as|from|into)$/i;
  for (const name of readdirSync(join(REPO, "skills")).filter((n) => existsSync(join(REPO, "skills", n, "SKILL.md")))) {
    const { data } = parseFrontmatter(readFileSync(join(REPO, "skills", name, "SKILL.md"), "utf8"));
    const s = shortDescription(data.description);
    assert.ok(s.length > 0 && s.length <= SHORT_MAX, `${name}: ${s.length} characters`);
    const words = data.description.split(/\s+/);
    let at = 0;
    for (const w of s.split(/\s+/)) {
      while (at < words.length && !words[at].startsWith(w.replace(/,$/, ""))) at++;
      assert.ok(at < words.length, `${name}: "${w}" does not come from the description, in order`);
      at++;
    }
    assert.doesNotMatch(s, dangling, `${name}: "${s}" ends mid-phrase`);
    assert.doesNotMatch(s, /[,:;(]$/, `${name}: "${s}" ends with punctuation`);
  }
});

// ---- file text ----

test("a typed skill gets the policy line", () => {
  assert.equal(
    openaiYaml({ name: "deliver", description: "Ship it.", "disable-model-invocation": "true" }),
    `${HEADER}\ninterface:\n  display_name: "deliver"\n  short_description: "Ship it"\npolicy:\n  allow_implicit_invocation: false\n`,
  );
});

test("an agent skill gets no policy line", () => {
  assert.equal(openaiYaml({ name: "helper", description: "Helps." }), `${HEADER}\ninterface:\n  display_name: "helper"\n  short_description: "Helps"\n`);
  assert.doesNotMatch(openaiYaml({ name: "helper", description: "Helps.", "disable-model-invocation": "false" }), /policy/);
});

test("quotes and backslashes are escaped", () => {
  assert.match(openaiYaml({ name: "x", description: 'Says "hi" with a back\\slash.' }), /short_description: "Says \\"hi\\" with a back\\\\slash"\n/);
});

// ---- CLI ----

test("--check reports missing files, exits 1 and writes nothing", () => {
  const root = tempRoot({ helper: skill("helper", "Helps."), deliver: skill("deliver", "Ships.", true) });
  try {
    const r = cli("--check", root);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /skills\/deliver\/agents\/openai\.yaml is missing/);
    assert.match(r.stdout, /2 file\(s\) missing or different/);
    assert.equal(existsSync(join(root, "skills", "helper", "agents")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a write run creates each file, then --check exits 0", () => {
  const root = tempRoot({ helper: skill("helper", "Helps."), deliver: skill("deliver", "Ships.", true) });
  try {
    const w = cli(root);
    assert.equal(w.status, 0, w.stderr);
    assert.match(w.stdout, /write {2}skills\/deliver\/agents\/openai\.yaml/);
    assert.match(readFileSync(join(root, "skills", "deliver", "agents", "openai.yaml"), "utf8"), /allow_implicit_invocation: false/);
    const c = cli("--check", root);
    assert.equal(c.status, 0, c.stdout);
    assert.match(c.stdout, /0 file\(s\) missing or different/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--check finds a file that differs", () => {
  const root = tempRoot({ helper: skill("helper", "Helps.") });
  try {
    cli(root);
    writeFileSync(join(root, "skills", "helper", "agents", "openai.yaml"), "interface:\n  display_name: \"helper\"\n");
    const r = cli("--check", root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /different from the frontmatter/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bad frontmatter, a missing skills folder and an unknown option exit 2", () => {
  const root = tempRoot({ broken: "no frontmatter\n" });
  try {
    const r = cli("--check", root);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /cannot read the frontmatter.*Fix:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const empty = mkdtempSync(join(tmpdir(), "openai-yaml-empty-"));
  try {
    assert.equal(cli("--check", empty).status, 2);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
  assert.equal(cli("--nope").status, 2);
});

test("the files in this repo are up to date", () => {
  const r = cli("--check", REPO);
  assert.equal(r.status, 0, r.stdout);
});
