import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT, check, parseRecord, run } from "../../skills/prototype/scripts/prototype-check.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "prototype", "scripts", "prototype-check.mjs");

// Isolate git from the global and system config of the machine (hooks, signing, templates).
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};
for (const k of Object.keys(ENV)) if (k.startsWith("GIT_") && !k.startsWith("GIT_CONFIG") && !k.startsWith("GIT_AUTHOR") && !k.startsWith("GIT_COMMITTER")) delete ENV[k];
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

const RECORD = (over = {}) =>
  [
    "# Prototype: refund-states",
    "",
    `Question: ${over.question ?? "Can a refund follow a partial shipment?"}`,
    `Base: ${over.base ?? "main"}`,
    `Shape: ${over.shape ?? "logic"}`,
    `Host files: ${over.host ?? "none"}`,
    `Verdict: ${over.verdict ?? "open"}`,
    "",
  ].join("\n");

/** A repo on `main` with product code, then a prototype branch with a record and a demo. */
function repo({ commitPrototype = true, record = RECORD() } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prototype-check-"));
  sh(root, "init", "-q", "-b", "main");
  write(root, "src/orders.js", "export const states = ['new', 'paid'];\n");
  write(root, "src/page.html", "<main></main>\n");
  sh(root, "add", "-A");
  sh(root, "commit", "-q", "-m", "setup");
  sh(root, "switch", "-q", "-c", "prototype/refund-states");
  write(root, "prototypes/refund-states/PROTOTYPE.md", record);
  write(root, "prototypes/refund-states/index.html", "<p>demo</p>\n");
  if (commitPrototype) {
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "prototype");
  }
  return root;
}

function inRepo(opts, fn) {
  const root = repo(opts);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rules = (r) => r.problems.map((p) => p.rule).sort();

// ---- clean cases ----

test("clean: committed prototype, checked from the prototype branch", () => {
  inRepo({}, (root) => assert.deepEqual(check("refund-states", { cwd: root }).problems, []));
});

test("clean: files not committed yet on the prototype branch", () => {
  inRepo({ commitPrototype: false }, (root) => assert.deepEqual(check("refund-states", { cwd: root }).problems, []));
});

test("clean: checked from main after a switch back", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(r.problems, []);
    assert.equal(r.base, "main");
  });
});

test("clean: a host file on the `Host files:` line can change", () => {
  inRepo({ record: RECORD({ host: "src/page.html", shape: "UI" }) }, (root) => {
    write(root, "src/page.html", "<main>variant</main>\n");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("clean: runs from a subfolder of the repo", () => {
  inRepo({}, (root) => assert.deepEqual(check("refund-states", { cwd: join(root, "src") }).problems, []));
});

// ---- branch and record ----

test("branch: a missing prototype branch fails", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    assert.deepEqual(rules(check("other-thing", { cwd: root })), ["branch"]);
  });
});

test("record: a missing PROTOTYPE.md fails", () => {
  inRepo({}, (root) => {
    sh(root, "rm", "-q", "prototypes/refund-states/PROTOTYPE.md");
    sh(root, "commit", "-q", "-m", "drop record");
    sh(root, "switch", "-q", "main");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["record"]);
  });
});

test("record: an empty Question line fails", () => {
  inRepo({ record: RECORD({ question: "" }) }, (root) => {
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["record"]);
    assert.match(r.problems[0].message, /Question:/);
  });
});

test("record: a missing Verdict line fails", () => {
  inRepo({ record: RECORD().replace(/^Verdict:.*$/m, "") }, (root) => {
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["record"]);
  });
});

test("parseRecord: reads host files and `none`", () => {
  assert.deepEqual(parseRecord(RECORD({ host: "`src/a.tsx`, ./src/b.tsx" })).host, ["src/a.tsx", "src/b.tsx"]);
  assert.deepEqual(parseRecord(RECORD({ host: "none" })).host, []);
  assert.deepEqual(parseRecord("Question: q\n").missing, ["base", "shape", "host", "verdict"]);
});

// ---- scope ----

test("scope: a product file changed on the prototype branch fails", () => {
  inRepo({}, (root) => {
    write(root, "src/orders.js", "export const states = ['new', 'paid', 'refunded'];\n");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["scope"]);
    assert.match(r.problems[0].message, /src\/orders\.js/);
  });
});

test("scope: a committed product change fails when checked from main", () => {
  inRepo({}, (root) => {
    write(root, "src/orders.js", "changed\n");
    sh(root, "commit", "-q", "-am", "touch product");
    sh(root, "switch", "-q", "main");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["scope"]);
  });
});

test("scope: a new file outside the prototype folder fails", () => {
  inRepo({}, (root) => {
    write(root, "src/refund.js", "new\n");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["scope"]);
  });
});

test("scope: a deleted product file fails", () => {
  inRepo({}, (root) => {
    sh(root, "rm", "-q", "src/page.html");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["scope"]);
  });
});

test("scope: a product file moved into the prototype folder still fails", () => {
  inRepo({}, (root) => {
    sh(root, "mv", "src/orders.js", "prototypes/refund-states/orders.js");
    sh(root, "commit", "-q", "-m", "move");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["scope"]);
    assert.match(r.problems[0].message, /src\/orders\.js/);
  });
});

test("scope: a gitignored file does not count", () => {
  inRepo({}, (root) => {
    write(root, ".gitignore", "node_modules/\n");
    sh(root, "add", ".gitignore");
    sh(root, "commit", "-q", "-m", "ignore");
    write(root, "node_modules/x/index.js", "x\n");
    // .gitignore itself is a change outside the folder.
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["scope"]);
  });
});

// ---- merged and base-clean ----

test("merged: a merge into main fails twice (merged and base-clean)", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    sh(root, "merge", "-q", "--no-ff", "-m", "merge prototype", "prototype/refund-states");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["base-clean", "merged"]);
  });
});

test("merged: a fast-forward merge fails", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    sh(root, "merge", "-q", "--ff-only", "prototype/refund-states");
    assert.ok(rules(check("refund-states", { cwd: root })).includes("merged"));
  });
});

test("base-clean: a squash merge (a copy of the folder) fails", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    sh(root, "merge", "-q", "--squash", "prototype/refund-states");
    sh(root, "commit", "-q", "-m", "squash");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["base-clean"]);
  });
});

test("base-clean: prototype files left in the main checkout fail", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    write(root, "prototypes/refund-states/stray.html", "stray\n");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["base-clean"]);
    assert.match(r.problems[0].message, /not committed/);
  });
});

test("merged: a new prototype branch with no commits is not merged", () => {
  inRepo({ commitPrototype: false }, (root) => {
    assert.ok(!rules(check("refund-states", { cwd: root })).includes("merged"));
  });
});

// ---- base ----

test("base: the Base line picks the base branch", () => {
  inRepo({ record: RECORD({ base: "develop" }) }, (root) => {
    sh(root, "branch", "develop", "main");
    assert.equal(check("refund-states", { cwd: root }).base, "develop");
  });
});

test("base: --base wins over the Base line", () => {
  inRepo({ record: RECORD({ base: "develop" }) }, (root) => {
    assert.equal(check("refund-states", { cwd: root, base: "main" }).base, "main");
  });
});

test("base: a prototype branch as base fails", () => {
  inRepo({}, (root) => {
    sh(root, "branch", "prototype/other", "main");
    assert.deepEqual(rules(check("refund-states", { cwd: root, base: "prototype/other" })), ["base"]);
  });
});

test("base: a base that does not exist throws a git error", () => {
  inRepo({ record: RECORD({ base: "develop" }) }, (root) => {
    assert.throws(() => check("refund-states", { cwd: root }), /develop.*does not exist/);
  });
});

// ---- CLI ----

const cli = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV });

test("cli: a clean prototype exits 0", () => {
  inRepo({}, (root) => {
    const r = cli(["refund-states"], root);
    assert.equal(r.status, EXIT.OK, r.stdout + r.stderr);
    assert.match(r.stdout, /checked against main, 0 problem/);
  });
});

test("cli: a broken rule exits 1 with a `Fix:` message", () => {
  inRepo({}, (root) => {
    write(root, "src/orders.js", "changed\n");
    const r = cli(["refund-states"], root);
    assert.equal(r.status, EXIT.PROBLEMS);
    assert.match(r.stdout, /^scope {2}`src\/orders\.js` changed outside .*\. Fix: /m);
  });
});

test("cli: outside a git repo exits 3", () => {
  const dir = mkdtempSync(join(tmpdir(), "prototype-check-nogit-"));
  try {
    const r = cli(["refund-states"], dir);
    assert.equal(r.status, EXIT.GIT, r.stdout + r.stderr);
    assert.match(r.stderr, /Fix:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a missing base exits 3", () => {
  inRepo({}, (root) => assert.equal(cli(["refund-states", "--base", "nope"], root).status, EXIT.GIT));
});

test("cli: usage errors exit 2", () => {
  inRepo({}, (root) => {
    assert.equal(cli([], root).status, EXIT.USAGE);
    assert.equal(cli(["Refund_States"], root).status, EXIT.USAGE);
    assert.equal(cli(["a", "b"], root).status, EXIT.USAGE);
    assert.equal(cli(["a", "--base"], root).status, EXIT.USAGE);
    assert.equal(cli(["a", "--bogus"], root).status, EXIT.USAGE);
    assert.match(cli([], root).stderr, /Fix:/);
  });
});

test("cli: --help exits 0", () => {
  assert.equal(cli(["--help"]).status, EXIT.OK);
});

// Bun resolves a symlink in argv[1] by itself and Node does not, so this test runs Node.
const NODE = process.versions.bun ? "node" : process.execPath;

test("cli: a run through a symlink still checks", () => {
  inRepo({}, (root) => {
    write(root, "src/orders.js", "changed\n");
    const link = join(mkdtempSync(join(tmpdir(), "prototype-check-link-")), "link.mjs");
    symlinkSync(SCRIPT, link);
    const r = spawnSync(NODE, [link, "refund-states"], { cwd: root, encoding: "utf8", env: ENV });
    assert.equal(r.status, EXIT.PROBLEMS, r.stdout + r.stderr);
    rmSync(dirname(link), { recursive: true, force: true });
  });
});

// ---- red team: copies, other checkouts, the record shape ----

const DEMO = "export const demo = 'a unique line of prototype code';\n";

test("fold: a copy of a prototype file under another name on main is allowed", () => {
  inRepo({}, (root) => {
    write(root, "prototypes/refund-states/logic.mjs", DEMO);
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "more");
    sh(root, "switch", "-q", "main");
    write(root, "src/copied.mjs", DEMO);
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "copy");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("fold: a host file change that a cherry-pick put on main is allowed", () => {
  inRepo({ record: RECORD({ host: "src/page.html", shape: "UI" }) }, (root) => {
    write(root, "src/page.html", "<main>a long variant of the page</main>\n");
    sh(root, "commit", "-q", "-am", "host");
    sh(root, "switch", "-q", "main");
    sh(root, "checkout", "-q", "prototype/refund-states", "--", "src/page.html");
    sh(root, "commit", "-q", "-m", "page");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("fold: a file that is not new, or is tiny, is allowed on main", () => {
  inRepo({}, (root) => {
    write(root, "prototypes/refund-states/tiny.txt", "x\n");
    write(root, "prototypes/refund-states/same.js", "export const states = ['new', 'paid'];\n");
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "more");
    sh(root, "switch", "-q", "main");
    write(root, "src/tiny.txt", "x\n");
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "tiny");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("merged: a merge into the task branch that the user is on fails, although main is clean", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    sh(root, "switch", "-q", "-c", "agent/task");
    sh(root, "merge", "-q", "--no-ff", "-m", "merge", "prototype/refund-states");
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["base-clean", "merged"]);
    assert.match(r.problems.map((p) => p.message).join("\n"), /agent\/task/);
  });
});

test("fold: a copy of the logic module on a task branch is allowed", () => {
  inRepo({}, (root) => {
    write(root, "prototypes/refund-states/logic.mjs", DEMO);
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "more");
    sh(root, "switch", "-q", "main");
    sh(root, "switch", "-q", "-c", "agent/task");
    write(root, "src/logic.mjs", DEMO);
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "copy");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("base-clean: uncommitted prototype files on a detached HEAD fail", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "--detach", "main");
    write(root, "prototypes/refund-states/stray.js", "stray\n");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["base-clean"]);
  });
});

test("clean: a detached HEAD at the base with no prototype files passes", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "--detach", "main");
    assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
  });
});

test("host: a logic prototype that names a host file fails", () => {
  inRepo({ record: RECORD({ host: "src/page.html", shape: "logic" }) }, (root) => {
    write(root, "src/page.html", "<main>variant</main>\n");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["host"]);
  });
});

test("record: a missing or unknown Shape fails", () => {
  inRepo({ record: RECORD({ shape: "banana" }) }, (root) => assert.deepEqual(rules(check("refund-states", { cwd: root })), ["record"]));
  inRepo({ record: RECORD().replace(/^Shape:.*\n/m, "") }, (root) => {
    const r = check("refund-states", { cwd: root });
    assert.deepEqual(rules(r), ["record"]);
    assert.match(r.problems[0].message, /Shape:/);
  });
});

test("scope: a symlink in place of the prototype folder fails", () => {
  inRepo({}, (root) => {
    sh(root, "rm", "-rq", "--cached", "prototypes/refund-states/index.html");
    write(root, "prototypes/refund-states/PROTOTYPE.md", RECORD());
    symlinkSync("../../src", join(root, "prototypes", "other"));
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "link");
    assert.deepEqual(rules(check("refund-states", { cwd: root })), ["scope"]);
  });
});

test("cli: odd names exit 2 and never reach git", () => {
  for (const name of ["a b", "-x", "..", "../x", "a/b", "A", "foo ", "foo--bar", "", "prototype/x", "a\nb", "a'b", 'a"b']) {
    const r = run([name], { cwd: tmpdir() });
    assert.equal(r.code, EXIT.USAGE, JSON.stringify(name));
  }
});

test("cli: --base with a leading dash or an option-like name exits 2 or 3, never runs git options", () => {
  inRepo({}, (root) => {
    assert.equal(run(["refund-states", "--base", "--output=/tmp/x"], { cwd: root }).code, EXIT.USAGE);
    assert.equal(run(["refund-states", "--base", "main; echo hi"], { cwd: root }).code, EXIT.GIT);
    assert.equal(run(["refund-states", "--base", "../main"], { cwd: root }).code, EXIT.GIT);
  });
});

test("cli: a run from a symlinked project folder checks the same repo", () => {
  inRepo({}, (root) => {
    sh(root, "switch", "-q", "main");
    write(root, "src/orders.js", "changed\n");
    const holder = mkdtempSync(join(tmpdir(), "prototype-check-proj-"));
    const link = join(holder, "proj");
    symlinkSync(root, link);
    const r = spawnSync(NODE, [SCRIPT, "refund-states"], { cwd: link, encoding: "utf8", env: ENV });
    assert.equal(r.status, EXIT.OK, r.stdout + r.stderr);
    rmSync(holder, { recursive: true, force: true });
  });
});

test("run: returns usage text with --help", () => {
  assert.equal(run(["--help"]).code, EXIT.OK);
});

test("push: a prototype branch that was pushed to a remote passes", () => {
  inRepo({}, (root) => {
    const bare = mkdtempSync(join(tmpdir(), "prototype-check-origin-"));
    try {
      sh(bare, "init", "-q", "--bare");
      sh(root, "remote", "add", "origin", bare);
      sh(root, "push", "-q", "-u", "origin", "prototype/refund-states");
      sh(root, "switch", "-q", "main");
      assert.deepEqual(check("refund-states", { cwd: root }).problems, []);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
