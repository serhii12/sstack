import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeCell, safeText, altText, encodeSegment, main, mediaUrl, parseRemoteUrl, validTask } from "../../skills/land/scripts/land-evidence.mjs";

// Keep the user's git config out of the tests. Each repo sets its own identity.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "land", "scripts", "land-evidence.mjs");

// A valid 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(40, 7)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(20, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([20, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(12, 1)]);
const sha = (b) => createHash("sha256").update(b).digest("hex");

const tmps = [];
after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});

function g(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * A work repo with one commit, a bare origin, and the evidence of one task.
 * `files` maps a path under evidence/ to its bytes. Every file is named in the index with its sha256,
 * unless `index` is given. `unindexed` lists files that exist but that the index does not name.
 */
function fixture({ task = "t1", files = { "screenshots/a.png": PNG }, unindexed = {}, index, originUrl, hashes = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "land-evidence-")));
  tmps.push(base);
  const origin = join(base, "origin.git");
  const root = join(base, "work");
  mkdirSync(root);
  g(base, "init", "--bare", "-b", "main", origin);
  g(root, "init", "-b", "main");
  g(root, "config", "user.name", "Test");
  g(root, "config", "user.email", "test@example.test");
  g(root, "config", "commit.gpgsign", "false");
  writeFileSync(join(root, "README.md"), "hello\n");
  g(root, "add", "README.md");
  g(root, "commit", "-m", "first");
  g(root, "remote", "add", "origin", origin);
  g(root, "push", "-u", "origin", "main");
  if (originUrl) {
    // Transport goes to the bare repo. The configured URL is what the script shows.
    g(root, "config", "remote.origin.url", originUrl);
    g(root, "config", `url.${origin}.insteadOf`, originUrl);
  }
  const ev = join(root, ".artifacts", task, "evidence");
  const put = (rel, buf) => {
    mkdirSync(dirname(join(ev, rel)), { recursive: true });
    writeFileSync(join(ev, rel), buf);
  };
  mkdirSync(ev, { recursive: true });
  for (const [p, b] of Object.entries(files)) put(p, b);
  for (const [p, b] of Object.entries(unindexed)) put(p, b);
  const doc = index ?? {
    schema: 1,
    task,
    checks: [{ check: "c1", status: "pass", evidence: Object.entries(files).map(([path, b]) => (hashes ? { path, sha256: sha(b) } : { path })) }],
  };
  writeFileSync(join(ev, "index.json"), typeof doc === "string" ? doc : JSON.stringify(doc));
  return { base, origin, root, ev, task, put };
}

function run(args, opts = {}) {
  const out = [];
  const err = [];
  const code = main(args, { out: (s) => out.push(s), err: (s) => err.push(s), ...opts });
  return { code, out, err };
}

const go = (fx, extra = [], opts = {}) => run([fx.task, "--repo", fx.root, ...extra], opts);
const remoteTip = (fx, task = fx.task) => {
  const r = spawnSync("git", ["-C", fx.origin, "rev-parse", "--verify", "--quiet", `refs/heads/evidence/${task}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const treeNames = (fx, commit) => g(fx.origin, "ls-tree", "-r", "--name-only", "-z", commit).split("\0").filter(Boolean).sort();
const looseCount = (root) => /^count: (\d+)$/m.exec(g(root, "count-objects", "-v"))[1];
const stateOf = (root) => ({
  head: g(root, "rev-parse", "HEAD"),
  headRef: g(root, "symbolic-ref", "HEAD"),
  refs: g(root, "for-each-ref"),
  branches: g(root, "branch", "--list", "-a"),
  status: g(root, "status", "--porcelain", "-uall"),
  staged: g(root, "ls-files", "-s"),
});

/** Every error line has the house form. */
function assertFailForm(r, code) {
  assert.equal(r.code, code, r.err.join("\n"));
  assert.ok(r.err.length >= 1);
  for (const l of r.err) assert.match(l, /^land-evidence: FAIL \d+: [^\n]*\. Fix: [^\n]*\.$/, l);
  assert.ok(r.err.some((l) => l.startsWith(`land-evidence: FAIL ${code}: `)));
  assert.deepEqual(r.out, []);
}

/** A refusal pushes nothing and writes no object. */
function assertRefused(fx, code, fn = () => go(fx)) {
  const before = looseCount(fx.root);
  const r = fn();
  assertFailForm(r, code);
  assert.equal(remoteTip(fx), null, "nothing pushed");
  assert.equal(looseCount(fx.root), before, "no object written");
  return r;
}

// ---------- pure functions ----------

test("validTask accepts plain names and refuses ref-unsafe ones", { timeout: 120000 }, () => {
  for (const t of ["t1", "a.b-c_d", "A", "contact-form", "a".repeat(100)]) assert.equal(validTask(t), true, t);
  for (const t of ["", "..", "a..b", "a.", "a.lock", "-x", ".x", "a/b", "a b", "a\nb", "a".repeat(101), undefined, 5]) assert.equal(validTask(t), false, String(t));
});

test("parseRemoteUrl reads the known forms and never keeps credentials", { timeout: 120000 }, () => {
  const want = { host: "github.com", owner: "o", repo: "r" };
  for (const u of ["https://github.com/o/r.git", "https://github.com/o/r", "https://github.com/o/r/", "git@github.com:o/r.git", "git@github.com:o/r", "ssh://git@github.com/o/r.git", "ssh://git@github.com:2222/o/r.git", "https://user:secret@github.com/o/r.git", "https://tok@github.com/o/r"]) {
    assert.deepEqual(parseRemoteUrl(u), want, u);
  }
  assert.deepEqual(parseRemoteUrl("https://ghe.example.test:8443/o/r.git"), { host: "ghe.example.test:8443", owner: "o", repo: "r" });
  for (const u of ["/tmp/x/origin.git", "../origin.git", "file:///tmp/x.git", "C:\\x\\y", "https://github.com/o", "https://github.com/a/b/c.git", "https://github.com/o/r s.git", "", null]) assert.equal(parseRemoteUrl(u), null, String(u));
});

test("safeText cuts credentials out of git messages and keeps one line", { timeout: 120000 }, () => {
  const t = safeText("fatal: unable to access 'https://user:s3cretpw@host.example/o/r.git/': no\nsecond line");
  assert.ok(!t.includes("s3cretpw") && !t.includes("user:"), t);
  assert.ok(t.includes("https://***@host.example"), t);
  assert.ok(!t.includes("\n"));
});

test("mediaUrl pins the sha and encodes each path part", { timeout: 120000 }, () => {
  assert.equal(mediaUrl({ host: "github.com", owner: "o", repo: "r", sha: "abc", path: "screenshots/a b.png" }), "https://github.com/o/r/blob/abc/screenshots/a%20b.png?raw=true");
  assert.equal(encodeSegment("a!b'c(d)e*f"), "a%21b%27c%28d%29e%2Af");
  assert.equal(encodeSegment("x](https://evil.example)"), "x%5D%28https%3A%2F%2Fevil.example%29");
});

test("altText keeps only [A-Za-z0-9._/ -] and stops at 120 characters", { timeout: 120000 }, () => {
  assert.equal(altText("a/b c-d_e.png"), "a/b c-d_e.png");
  assert.equal(altText("a](b)![c\"\n\u00fc\u{1F600}.png"), "a__b___c____.png");
  assert.equal(altText("x".repeat(500)).length, 120);
});

// ---------- the happy path ----------

test("happy path: the branch lands on origin with every named file, and the local repo does not change", { timeout: 120000 }, () => {
  const files = { "screenshots/after-form-375x812-light.png": PNG, "video/demo.mp4": MP4, "output/test.txt": Buffer.from("ok\n") };
  const fx = fixture({
    files,
    unindexed: { "screenshots/stray.png": PNG, "reviews/r.md": Buffer.from("x") },
    index: {
      checks: [
        { check: "The form shows", status: "pass", evidence: Object.entries(files).map(([path, b]) => ({ path, sha256: sha(b) })), review: { verdict: "matches", reply: { path: "reviews/r.md", sha256: sha(Buffer.from("x")) } } },
        { check: "Works in Safari", status: "untested", reason: "No Safari here." },
      ],
    },
  });
  const before = stateOf(fx.root);
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  assert.deepEqual(r.err, []);
  const tip = remoteTip(fx);
  assert.match(tip, /^[0-9a-f]{40}$/);
  assert.deepEqual(treeNames(fx, tip), ["output/test.txt", "screenshots/after-form-375x812-light.png", "video/demo.mp4"]);
  assert.equal(g(fx.origin, "log", "-1", "--format=%s", tip), `Evidence for t1 on ${g(fx.root, "rev-parse", "--short", "HEAD")}`);
  assert.equal(g(fx.origin, "rev-list", "--count", tip), "1");
  assert.deepEqual(stateOf(fx.root), before);
  assert.match(before.status, /\?\? \.artifacts\//);
  // origin is a local path here, so the lines carry no URL.
  const img = "screenshots/after-form-375x812-light.png";
  assert.deepEqual(r.out, [
    `Evidence branch: evidence/t1 at ${tip} (3 file(s)).`,
    "",
    "| Acceptance check | Result | Evidence |",
    "| --- | --- | --- |",
    `| The form shows | pass | ${img} (commit ${tip}), video/demo.mp4 (commit ${tip}), output/test.txt (commit ${tip}) |`,
    "| Works in Safari | untested | No Safari here. |",
    "",
    "screenshots/after-form-375x812-light.png. Check: The form shows",
    `- ${img}: ${img} (commit ${tip} on branch evidence/t1)`,
    "video/demo.mp4. Check: The form shows",
    `- video/demo.mp4: video/demo.mp4 (commit ${tip} on branch evidence/t1)`,
  ]);
});

test("output for a GitHub origin: table, then images, then other media, each with a caption, pinned to the commit", { timeout: 120000 }, () => {
  const body = { "video/demo.mp4": MP4, "screenshots/b.png": PNG, "screenshots/a.png": PNG, "screenshots/c.svg": Buffer.from("<svg/>"), "output/grep.txt": Buffer.from("hit\n") };
  const ev = (...ps) => ps.map((path) => ({ path, sha256: sha(body[path]) }));
  const fx = fixture({
    files: body,
    originUrl: "https://github.com/o/r.git",
    index: { checks: [
      { check: "First", status: "pass", evidence: ev("screenshots/b.png", "output/grep.txt") },
      { check: "Second", status: "fail", reason: "r", evidence: ev("screenshots/a.png", "screenshots/b.png", "screenshots/c.svg", "video/demo.mp4") },
      { check: "Third", status: "untested", reason: "No Safari | here" },
      { check: "Fourth", status: "untested" },
    ] },
  });
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  const tip = remoteTip(fx);
  const u = (p) => `https://github.com/o/r/blob/${tip}/${p}?raw=true`;
  assert.deepEqual(r.out, [
    `Evidence branch: evidence/t1 at ${tip} (5 file(s)).`,
    "",
    "| Acceptance check | Result | Evidence |",
    "| --- | --- | --- |",
    `| First | pass | [screenshots/b.png](${u("screenshots/b.png")}), [output/grep.txt](${u("output/grep.txt")}) |`,
    `| Second | fail | [screenshots/a.png](${u("screenshots/a.png")}), [screenshots/b.png](${u("screenshots/b.png")}), [screenshots/c.svg](${u("screenshots/c.svg")}), [video/demo.mp4](${u("video/demo.mp4")}) |`,
    "| Third | untested | No Safari \\| here |",
    "| Fourth | untested | none |",
    "",
    "screenshots/a.png. Check: Second",
    `![screenshots/a.png](${u("screenshots/a.png")})`,
    "screenshots/b.png. Check: First",
    `![screenshots/b.png](${u("screenshots/b.png")})`,
    "screenshots/c.svg. Check: Second",
    `[screenshots/c.svg](${u("screenshots/c.svg")})`,
    "video/demo.mp4. Check: Second",
    `[video/demo.mp4](${u("video/demo.mp4")})`,
  ]);
  assert.deepEqual(treeNames(fx, tip), ["output/grep.txt", "screenshots/a.png", "screenshots/b.png", "screenshots/c.svg", "video/demo.mp4"]);
});

test("--json prints one object with the checks and the files", { timeout: 120000 }, () => {
  const files = { "a.png": PNG, "v.mp4": MP4, "o.txt": Buffer.from("t") };
  const fx = fixture({
    files,
    originUrl: "git@github.com:o/r.git",
    index: { checks: [
      { check: "Raw | check [text]", status: "pass", evidence: [{ path: "a.png" }, { path: "o.txt" }] },
      { check: "Other", status: "untested", reason: "why" },
      { check: "Again", status: "pass", evidence: [{ path: "a.png" }, { path: "v.mp4" }] },
    ] },
  });
  const r = go(fx, ["--json"]);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out.join("\n"));
  const tip = remoteTip(fx);
  assert.equal(j.task, "t1");
  assert.equal(j.branch, "evidence/t1");
  assert.equal(j.commit, tip);
  assert.equal(j.pushed, true);
  assert.deepEqual(j.checks, [
    { check: "Raw | check [text]", status: "pass", reason: null, files: ["a.png", "o.txt"] },
    { check: "Other", status: "untested", reason: "why", files: [] },
    { check: "Again", status: "pass", reason: null, files: ["a.png", "v.mp4"] },
  ]);
  assert.deepEqual(j.files.map((f) => [f.path, f.kind, f.bytes, f.check]), [["a.png", "image", PNG.length, "Raw | check [text]"], ["o.txt", "text", 1, "Raw | check [text]"], ["v.mp4", "media", MP4.length, "Again"]]);
  assert.equal(j.files[0].url, `https://github.com/o/r/blob/${tip}/a.png?raw=true`);
  assert.equal(j.files[0].markdown, `![a.png](${j.files[0].url})`);
  assert.equal(j.files[1].markdown, `[o.txt](${j.files[1].url})`);
  assert.equal(j.files[2].markdown, `[v.mp4](${j.files[2].url})`);
});

test("a path named twice goes up once, and an upper-case extension counts as media", { timeout: 120000 }, () => {
  const fx = fixture({
    files: { "A.PNG": PNG },
    index: { checks: [{ evidence: [{ path: "A.PNG" }] }, { evidence: [{ path: "A.PNG" }] }] },
  });
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  assert.match(r.out[0], /\(1 file\(s\)\)\.$/);
  assert.deepEqual(treeNames(fx, remoteTip(fx)), ["A.PNG"]);
});

// ---------- only indexed media ----------

test("text files named by the index go up, a file that the index does not name and a reviewer reply never do", { timeout: 120000 }, () => {
  const fx = fixture({
    files: { "screenshots/a.png": PNG, "output/log.txt": Buffer.from("log\n") },
    unindexed: { "screenshots/stray.png": PNG, "video/stray.mp4": MP4, "output/stray.txt": Buffer.from("s"), "reviews/r.md": Buffer.from("r\n") },
    index: { checks: [{ check: "c", status: "pass", evidence: [{ path: "screenshots/a.png" }, { path: "output/log.txt" }], review: { reply: { path: "reviews/r.md" } } }] },
  });
  assert.equal(go(fx).code, 0);
  assert.deepEqual(treeNames(fx, remoteTip(fx)), ["output/log.txt", "screenshots/a.png"]);
});

test("no folder, no index, no named file: exit 0, one line, nothing pushed", { timeout: 120000 }, () => {
  const cases = {
    "no folder": (fx) => rmSync(join(fx.root, ".artifacts"), { recursive: true }),
    "no index": (fx) => rmSync(join(fx.ev, "index.json")),
    "no evidence list": (fx) => writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ check: "c", status: "untested" }] })),
    "empty checks": (fx) => writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [] })),
  };
  for (const [name, setup] of Object.entries(cases)) {
    const fx = fixture();
    setup(fx);
    const r = go(fx);
    assert.equal(r.code, 0, name);
    assert.deepEqual(r.out, ["No evidence files for t1."], name);
    assert.deepEqual(r.err, [], name);
    assert.equal(remoteTip(fx), null, name);
  }
});

// ---------- reruns and the branch history ----------

test("a second run with the same files pushes nothing and prints the same sha", { timeout: 120000 }, () => {
  const fx = fixture({ originUrl: "https://github.com/o/r.git" });
  const first = go(fx);
  const tip = remoteTip(fx);
  const before = stateOf(fx.root);
  const second = go(fx, ["--json"]);
  assert.equal(second.code, 0, second.err.join("\n"));
  const j = JSON.parse(second.out.join("\n"));
  assert.equal(j.commit, tip);
  assert.equal(j.pushed, false);
  assert.equal(remoteTip(fx), tip);
  assert.equal(g(fx.origin, "rev-list", "--count", tip), "1");
  assert.deepEqual(stateOf(fx.root), before);
  assert.equal(go(fx).out.join("\n"), first.out.join("\n"));
});

test("a second run with a new file adds a commit on top of the first, with no force", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png": PNG } });
  assert.equal(go(fx).code, 0);
  const first = remoteTip(fx);
  fx.put("b.png", PNG);
  writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "a.png" }, { path: "b.png" }] }] }));
  const before = stateOf(fx.root);
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  const second = remoteTip(fx);
  assert.notEqual(second, first);
  assert.equal(g(fx.origin, "rev-parse", `${second}^`), first);
  assert.equal(g(fx.origin, "rev-list", "--count", second), "2");
  assert.deepEqual(treeNames(fx, second), ["a.png", "b.png"]);
  assert.match(r.out[0], new RegExp(`at ${second} \\(2 file\\(s\\)\\)`));
  assert.deepEqual(stateOf(fx.root), before);
});

test("the remote branch moves before the push: a plain push is rejected, exit 46, the other commit stays", { timeout: 120000 }, () => {
  const fx = fixture();
  let other;
  const r = go(fx, [], {
    beforePush: ({ root }) => {
      const empty = spawnSync("git", ["-C", root, "hash-object", "-t", "tree", "-w", "--stdin"], { input: "", encoding: "utf8" }).stdout.trim();
      other = g(root, "commit-tree", empty, "-m", "someone else");
      g(root, "push", "origin", `${other}:refs/heads/evidence/t1`);
    },
  });
  assertFailForm(r, 46);
  assert.equal(remoteTip(fx), other, "the other commit is still the tip");
});

test("an origin that rejects the push gives exit 46 and the Fix text", { timeout: 120000 }, () => {
  const fx = fixture();
  writeFileSync(join(fx.origin, "hooks", "pre-receive"), "#!/bin/sh\necho no >&2\nexit 1\n", { mode: 0o755 });
  assertFailForm(go(fx), 46);
  assert.equal(remoteTip(fx), null);
});

test("an origin URL with a credential is never printed, on success or on failure", { timeout: 120000 }, () => {
  const url = "https://user:s3cretpw@github.com/o/r.git";
  const fx = fixture({ originUrl: url });
  const ok = go(fx, ["--json"]);
  assert.equal(ok.code, 0);
  const all = [...ok.out, ...ok.err, ...go(fx).out, ...go(fx, ["--dry-run"]).out].join("\n");
  assert.ok(!all.includes("s3cretpw") && !all.includes("user:"), "no credential in the output");
  assert.ok(all.includes("https://github.com/o/r/blob/"));

  const dead = fixture();
  g(dead.root, "remote", "set-url", "origin", "https://user:s3cretpw@127.0.0.1:1/o/r.git");
  const r = go(dead);
  assertFailForm(r, 46);
  assert.ok(!r.err.join("\n").includes("s3cretpw"));
});

// ---------- refusals ----------

test("a symlinked file is refused with 41, and nothing is pushed or written", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png": PNG } });
  mkdirSync(join(fx.base, "outside"));
  writeFileSync(join(fx.base, "outside", "o.png"), PNG);
  symlinkSync(join(fx.base, "outside", "o.png"), join(fx.ev, "link.png"));
  symlinkSync(join(fx.ev, "a.png"), join(fx.ev, "inner.png"));
  writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "link.png" }, { path: "inner.png" }] }] }));
  const r = assertRefused(fx, 41);
  assert.equal(r.err.length, 2);
  for (const l of r.err) assert.match(l, /symlink/);
});

test("a symlinked parent folder is refused with 41", { timeout: 120000 }, () => {
  for (const target of ["inside", "outside"]) {
    const fx = fixture({ files: { "real/a.png": PNG } });
    mkdirSync(join(fx.base, "outside"));
    writeFileSync(join(fx.base, "outside", "a.png"), PNG);
    symlinkSync(target === "inside" ? join(fx.ev, "real") : join(fx.base, "outside"), join(fx.ev, "shots"));
    writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "shots/a.png" }] }] }));
    const r = assertRefused(fx, 41);
    assert.match(r.err[0], /symlink/, target);
  }
});

test("a symlinked .artifacts, task folder, evidence folder or index is refused with 41", { timeout: 120000 }, () => {
  for (const which of ["artifacts", "task", "evidence", "index"]) {
    const fx = fixture();
    const real = join(fx.base, "elsewhere");
    const art = join(fx.root, ".artifacts");
    if (which === "artifacts") {
      mkdirSync(real);
      spawnSync("mv", [art, join(real, ".artifacts")]);
      symlinkSync(join(real, ".artifacts"), art);
    } else if (which === "task") {
      spawnSync("mv", [join(art, fx.task), real]);
      symlinkSync(real, join(art, fx.task));
    } else if (which === "evidence") {
      spawnSync("mv", [fx.ev, real]);
      symlinkSync(real, fx.ev);
    } else {
      spawnSync("mv", [join(fx.ev, "index.json"), real]);
      symlinkSync(real, join(fx.ev, "index.json"));
    }
    const r = assertRefused(fx, 41);
    assert.match(r.err[0], /symlink/, which);
  }
});

test("a path with `..`, an absolute path, a backslash, a control character or an empty part is refused with 41", { timeout: 120000 }, () => {
  const paths = ["../x.png", "a/../x.png", "/etc/x.png", "a\\b.png", "a\nb.png", "a\u0007b.png", "a//b.png", "./a.png", "C:\\x\\a.png"];
  for (const p of paths) {
    const fx = fixture({ files: { "ok.png": PNG } });
    writeFileSync(join(fx.base, "x.png"), PNG);
    writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: p }] }] }));
    const r = assertRefused(fx, 41);
    assert.match(r.err[0], /not a plain relative path/, JSON.stringify(p));
    assert.ok(!r.err.join("").includes("\n" + "b.png"), "a name never forges a line");
    assert.equal(r.err.length, 1, JSON.stringify(p));
  }
});

test("a missing, empty or non-regular file is refused with 41", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "ok.png": PNG, "empty.png": Buffer.alloc(0) } });
  mkdirSync(join(fx.ev, "dir.png"));
  writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "missing.png" }, { path: "empty.png" }, { path: "dir.png" }, { path: "ok.png/inner.png" }] }] }));
  const r = assertRefused(fx, 41);
  assert.equal(r.err.length, 4);
  assert.match(r.err[0], /dir\.png.* is not a regular file/);
  assert.match(r.err[1], /empty\.png.* is empty/);
  assert.match(r.err[2], /missing\.png.* does not exist/);
  assert.match(r.err[3], /goes through a file/);
});

test("a bad index gives 40: not JSON, not an object, no checks list, bad entry", { timeout: 120000 }, () => {
  const bad = ["{ nope", "[]", "null", "{}", JSON.stringify({ checks: {} }), JSON.stringify({ checks: [5] }), JSON.stringify({ checks: [{ evidence: {} }] }), JSON.stringify({ checks: [{ evidence: [{}] }] }), JSON.stringify({ checks: [{ evidence: [{ path: "a.png", sha256: 5 }] }] }), JSON.stringify({ checks: [{ evidence: [{ path: 7 }] }] })];
  for (const text of bad) {
    const fx = fixture({ index: text });
    assertRefused(fx, 40);
  }
  const dir = fixture();
  rmSync(join(dir.ev, "index.json"));
  mkdirSync(join(dir.ev, "index.json"));
  assertRefused(dir, 40);
});

test("a file that changed after it was indexed gives 42", { timeout: 120000 }, () => {
  const fx = fixture();
  writeFileSync(join(fx.ev, "screenshots", "a.png"), Buffer.concat([PNG, Buffer.from([0])]));
  const r = assertRefused(fx, 42);
  assert.match(r.err[0], /changed after it was indexed/);
  // An entry without a sha256 is not checked, and a matching upper-case hash passes.
  const ok = fixture({ hashes: false });
  assert.equal(go(ok).code, 0);
  const up = fixture({ index: { checks: [{ evidence: [{ path: "screenshots/a.png", sha256: sha(PNG).toUpperCase() }] }] } });
  assert.equal(go(up).code, 0);
});

test("the size limits give 43: one file over the per-file limit, and a set over the total", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png": PNG } });
  const r = assertRefused(fx, 43, () => go(fx, [], { maxFile: PNG.length - 1 }));
  assert.match(r.err[0], /over the limit/);
  // A file exactly at the limit is fine.
  assert.equal(go(fixture({ files: { "a.png": PNG } }), [], { maxFile: PNG.length }).code, 0);

  const two = fixture({ files: { "a.png": PNG, "b.png": PNG } });
  const t = assertRefused(two, 43, () => go(two, [], { maxFile: 1000, maxTotal: PNG.length * 2 - 1 }));
  assert.match(t.err[0], /in total/);
  assert.equal(go(fixture({ files: { "a.png": PNG, "b.png": PNG } }), [], { maxFile: 1000, maxTotal: PNG.length * 2 }).code, 0);
  // Text evidence counts against both limits too.
  const tx = fixture({ files: { "output/big.txt": Buffer.alloc(50, 97) } });
  assert.match(assertRefused(tx, 43, () => go(tx, [], { maxFile: 49 })).err[0], /big\.txt/);
  const tt = fixture({ files: { "output/a.txt": Buffer.alloc(30, 97), "output/b.txt": Buffer.alloc(30, 98) } });
  assertRefused(tt, 43, () => go(tt, [], { maxFile: 1000, maxTotal: 59 }));
});

test("with several problems each prints, and the first code in the order 40, 41, 42, 43 is the exit code", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png": PNG, "b.png": PNG, "c.png": PNG } });
  writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "missing.png" }, { path: "a.png", sha256: "0".repeat(64) }, { path: "b.png" }, { path: "c.png" }] }] }));
  const r = go(fx, [], { maxFile: 1000, maxTotal: PNG.length });
  assert.equal(r.code, 41);
  assert.deepEqual(r.err.map((l) => /FAIL (\d+)/.exec(l)[1]).sort(), ["41", "42", "43"]);
  for (const l of r.err) assert.match(l, /^land-evidence: FAIL \d+: [^\n]*\. Fix: [^\n]*\.$/);
  const fy = fixture({ files: { "a.png": PNG, "b.png": PNG, "c.png": PNG } });
  writeFileSync(join(fy.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "a.png", sha256: "0".repeat(64) }, { path: "b.png" }, { path: "c.png" }] }] }));
  const y = go(fy, [], { maxTotal: PNG.length });
  assert.equal(y.code, 42);
  assert.equal(y.err.length, 2);
});

test("no origin gives 44, also for a --remote name that does not exist", { timeout: 120000 }, () => {
  const fx = fixture();
  g(fx.root, "remote", "remove", "origin");
  const before = looseCount(fx.root);
  assertFailForm(go(fx), 44);
  assert.equal(looseCount(fx.root), before);
  const fy = fixture();
  assertFailForm(go(fy, ["--remote", "upstream"]), 44);
  assert.equal(remoteTip(fy), null);
});

// ---------- the output cannot be forged ----------

const ODD_NAMES = [
    "with space.png", "a)b.png", "a(b.png", "a]b.png", "a[b.png", 'q"uote.png', "h#sh.png", "q?mark.png", "pct%41.png", "\u00fc\u00f1\u00ed-\u00e9.png",
    "b!ang.png", "s'quote.png", "st*r.png", "back`tick.png", "a<b>.png", "amp&x=1.png",
    "a.png) [x](https:/evil.example/x.png", "x](https:/evil.example)![y.png", "x](https:/evil.example)/y.mp4", "emoji-\u{1F600}.webp", "-lead.png", "x\u202Ey.png",
];
for (const name of ODD_NAMES) {
  test(`odd file name ${JSON.stringify(name)}: one link per line, the origin host, and a URL that round-trips to the path`, { timeout: 120000 }, () => {
    const fx = fixture({ files: { [name]: name.endsWith(".webp") ? WEBP : PNG }, originUrl: "https://github.com/o/r.git" });
    const r = go(fx);
    assert.equal(r.code, 0, `${JSON.stringify(name)}: ${r.err.join("\n")}`);
    const tip = remoteTip(fx);
    const linked = r.out.filter((l) => l.includes("]("));
    assert.equal(linked.length, 2, `a table row and a media line: ${r.out.join("\n")}`);
    for (const line of linked) assert.equal(line.split("](").length - 1, 1, `one link: ${line}`);
    const [row, line] = linked;
    const rowM = /^\| c1 \| pass \| \[([A-Za-z0-9._/ -]*)\]\((https:\/\/[^()\s<>"`'\]\[]+)\) \|$/.exec(row);
    assert.ok(rowM, `row shape: ${row}`);
    const m = /^(!?)\[([A-Za-z0-9._/ -]*)\]\((https:\/\/[^()\s<>"`'\]\[]+)\)$/.exec(line);
    assert.ok(m, `shape: ${line}`);
    assert.equal(m[1], name.endsWith(".mp4") ? "" : "!");
    assert.equal(m[2], altText(name));
    assert.equal(rowM[2], m[3]);
    const u = new URL(m[3]);
    assert.equal(u.host, "github.com");
    assert.equal(u.search, "?raw=true");
    assert.equal(u.hash, "");
    const prefix = `/o/r/blob/${tip}/`;
    assert.ok(u.pathname.startsWith(prefix), u.pathname);
    assert.equal(u.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/"), name);
    assert.deepEqual(treeNames(fx, tip), [name]);
  });
}

test("odd names without a URL still print one safe line", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png) [x](https:/evil.example/x.png": PNG } });
  const r = go(fx);
  assert.equal(r.code, 0);
  assert.equal(r.out.length, 8);
  assert.ok(!r.out.some((l) => l.includes("](")), r.out.join("\n"));
  const line = r.out[7];
  assert.match(r.out[4], /^\| c1 \| pass \| a\.png_ _x__https_\/evil\.example\/x\.png \(commit [0-9a-f]{40}\) \|$/);
  assert.match(line, /^- [A-Za-z0-9._\/ -]+: [A-Za-z0-9._%\/-]+ \(commit/);
  assert.ok(line.includes("a.png%29%20%5Bx%5D%28https%3A/evil.example/x.png"), line);
  assert.match(line, /\(commit [0-9a-f]{40} on branch evidence\/t1\)$/);
});

test("a hostile path is quoted in error lines and never forges a line", { timeout: 120000 }, () => {
  const fx = fixture();
  const hostile = "x.png\nland-evidence: FAIL 0: all good. Fix: none.\n\u0000.png";
  writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: hostile }] }] }));
  const r = assertRefused(fx, 41);
  assert.equal(r.err.length, 1);
  assert.ok(!r.err[0].includes("\n"), "one line");
  assert.ok(!/MERGED|PASS:/.test(r.err.join("\n")));
  const ok = go(fixture());
  assert.ok(!/MERGED|PASS:/.test(ok.out.join("\n") + ok.err.join("\n")));
});

// ---------- dry run, usage, the command line ----------

test("--dry-run writes no object, makes no remote branch, and prints DRY-RUN in place of the sha", { timeout: 120000 }, () => {
  const fx = fixture({ files: { "a.png": PNG, "v.mp4": MP4 }, originUrl: "https://github.com/o/r.git" });
  const objects = looseCount(fx.root);
  const before = stateOf(fx.root);
  const r = go(fx, ["--dry-run"]);
  assert.equal(r.code, 0, r.err.join("\n"));
  assert.equal(r.out[0], "Evidence branch: evidence/t1 at DRY-RUN (2 file(s)).");
  assert.ok(r.out.includes("![a.png](https://github.com/o/r/blob/DRY-RUN/a.png?raw=true)"), r.out.join("\n"));
  assert.ok(r.out.includes("| c1 | pass | [a.png](https://github.com/o/r/blob/DRY-RUN/a.png?raw=true), [v.mp4](https://github.com/o/r/blob/DRY-RUN/v.mp4?raw=true) |"));
  assert.equal(looseCount(fx.root), objects);
  assert.equal(remoteTip(fx), null);
  assert.deepEqual(stateOf(fx.root), before);
  const j = JSON.parse(go(fx, ["--dry-run", "--json"]).out.join("\n"));
  assert.equal(j.commit, "DRY-RUN");
  assert.equal(j.pushed, false);
  // A dry run still refuses what a real run refuses.
  const bad = fixture();
  g(bad.root, "remote", "remove", "origin");
  assert.equal(go(bad, ["--dry-run"]).code, 44);
  const sym = fixture();
  symlinkSync(join(sym.ev, "screenshots", "a.png"), join(sym.ev, "l.png"));
  writeFileSync(join(sym.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: "l.png" }] }] }));
  assert.equal(go(sym, ["--dry-run"]).code, 41);
});

test("usage errors give exit 2 with the FAIL form", { timeout: 120000 }, () => {
  const fx = fixture();
  const cases = [[], ["--json"], ["t1", "t2"], ["t1", "--bogus"], ["t1", "--repo"], ["t1", "--remote", "--json"], ["t1", "--remote", "-oProxyCommand=x"], ...["..", "a..b", "a.", "a.lock", "-x", "a/b", ""].map((t) => [t, "--repo", fx.root])];
  for (const args of cases) {
    const r = run(args);
    assertFailForm(r, 2);
    assert.equal(r.err.length, 1);
  }
  const notRepo = realpathSync(mkdtempSync(join(tmpdir(), "land-evidence-nogit-")));
  tmps.push(notRepo);
  assertFailForm(run(["t1", "--repo", notRepo]), 2);
  assertFailForm(run(["t1", "--repo", join(notRepo, "missing")]), 2);
  const help = run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.out[0], /^Usage: /);
});

test("the script runs through a symlinked script path under node", { timeout: 120000 }, () => {
  const fx = fixture({ originUrl: "https://github.com/o/r.git" });
  const link = join(fx.base, "linked-land-evidence.mjs");
  symlinkSync(SCRIPT, link);
  const r = spawnSync(process.execPath, [link, "t1", "--repo", fx.root], { encoding: "utf8", cwd: fx.base });
  assert.equal(r.status, 0, r.stderr);
  const tip = remoteTip(fx);
  assert.match(r.stdout.split("\n")[0], new RegExp(`^Evidence branch: evidence/t1 at ${tip} `));
  const bad = spawnSync(process.execPath, [link, "..", "--repo", fx.root], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /^land-evidence: FAIL 2: .*\. Fix: .*\.\n$/);
});

// ---------- check text, .git parts, image bytes, task HEAD ----------

test("safeCell makes one capped line and escapes the characters that start a link, an image or a tag", { timeout: 120000 }, () => {
  assert.equal(safeCell("a | b"), "a \\| b");
  assert.equal(safeCell("x](https://evil.example)"), "x\\](https\\://evil.example)");
  assert.equal(safeCell("![y](https://evil.example/z.png)"), "\\!\\[y\\](https\\://evil.example/z.png)");
  assert.equal(safeCell("<img src=x onerror=1>"), "\\<img src=x onerror=1\\>");
  assert.equal(safeCell("a\\b"), "a\\\\b");
  assert.equal(safeCell("one\r\ntwo\tthree\u2028four\u2029five"), "one two three four five");
  assert.equal(safeCell("a\u0000b\u200bc\u202ed\u0007\ufeffe"), "abcde");
  assert.equal(safeCell("go to www.evil.example now"), "go to www\\.evil.example now");
  assert.equal(safeCell("x".repeat(5000)).length, 300);
  assert.equal(safeCell(undefined), "");
});

test("hostile check texts and reasons give one table row per check and no link to another host", { timeout: 120000 }, () => {
  const hostile = [
    "a | b", "x](https://evil.example)", "![y](https://evil.example/z.png)", "<img src=x onerror=1>",
    "line one\n| pass | [l](https://evil.example) |", "see https://evil.example/x and www.evil.example", "y".repeat(5000),
  ];
  const checks = hostile.flatMap((h, i) => [
    { check: h, status: "pass", evidence: [{ path: "a.png" }] },
    { check: `r${i}`, status: "untested", reason: h },
  ]);
  const fx = fixture({ files: { "a.png": PNG }, originUrl: "https://github.com/o/r.git", index: { checks } });
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  const rows = r.out.filter((l) => l.startsWith("| ")).slice(2);
  assert.equal(rows.length, checks.length);
  const tip = remoteTip(fx);
  for (const row of rows) {
    // Count cell separators that are not escaped: exactly 4 for 3 cells.
    assert.equal(row.replace(/\\./g, "").split("|").length - 1, 4, row);
  }
  assert.ok(r.out.every((l) => !/\n/.test(l)));
  const text = r.out.join("\n");
  for (const m of text.matchAll(/\]\((https?:[^)]*)\)/g)) assert.equal(new URL(m[1]).host, "github.com", m[1]);
  // Every unescaped "](" must be one of ours, pinned to the commit.
  for (const m of text.replace(/\\./g, "").matchAll(/\]\(([^)]*)\)/g)) assert.ok(m[1].startsWith(`https://github.com/o/r/blob/${tip}/`), m[1]);
  assert.ok(!/\S\s*<img/.test(text.replace(/\\</g, "")) && !text.replace(/\\./g, "").includes("<img"));
  assert.equal(text.replace(/\\./g, "").split("![").length - 1, 1, "no image start but ours");
  assert.ok(rows.every((l) => l.length < 1500));
});

test("a path with a .git part in any letter case is refused with 41", { timeout: 120000 }, () => {
  for (const p of ["screenshots/.git/x.png", ".git/x.png", "a/.GIT/x.png", "a/.Git/b/x.png", "a/.git./x.png"]) {
    const fx = fixture({ files: { "ok.png": PNG } });
    mkdirSync(join(fx.ev, dirname(p)), { recursive: true });
    writeFileSync(join(fx.ev, p), PNG);
    writeFileSync(join(fx.ev, "index.json"), JSON.stringify({ checks: [{ evidence: [{ path: p }] }] }));
    const r = assertRefused(fx, 41);
    assert.match(r.err[0], /\.git part/, p);
  }
  const ok = fixture({ files: { "a/.gitkeep.png": PNG, "a/x.git.png": PNG } });
  assert.equal(go(ok).code, 0);
});

test("an image whose bytes do not match its extension is refused with 41, other extensions are not checked", { timeout: 120000 }, () => {
  const text = Buffer.from("secret text\n");
  for (const name of ["secret.png", "secret.jpg", "secret.jpeg", "secret.gif", "secret.webp", "SECRET.PNG"]) {
    const fx = fixture({ files: { [name]: text } });
    const r = assertRefused(fx, 41);
    assert.match(r.err[0], new RegExp(`is not a ${name.split(".").pop().toLowerCase()} image`), name);
  }
  // A RIFF file that is not WEBP, a PNG with a bad tail of the signature, and a JPEG signature in a png.
  assertRefused(fixture({ files: { "a.webp": Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]) } }), 41);
  assertRefused(fixture({ files: { "a.png": Buffer.concat([PNG.subarray(0, 7), Buffer.from([0x0b]), PNG.subarray(8)]) } }), 41);
  assertRefused(fixture({ files: { "a.png": JPG } }), 41);
  for (const [name, bytes] of [["a.png", PNG], ["a.jpg", JPG], ["a.jpeg", JPG], ["a.gif", GIF], ["b.gif", Buffer.concat([Buffer.from("GIF87a"), Buffer.alloc(9, 1)])], ["a.webp", WEBP], ["a.mp4", Buffer.from("not a video")], ["a.svg", Buffer.from("x")], ["a.txt", Buffer.from("x")]]) {
    const fx = fixture({ files: { [name]: bytes } });
    assert.equal(go(fx).code, 0, name);
  }
});

test("a task named HEAD gives the branch evidence/HEAD and harms nothing", { timeout: 120000 }, () => {
  const fx = fixture({ task: "HEAD" });
  const before = stateOf(fx.root);
  const r = go(fx);
  assert.equal(r.code, 0, r.err.join("\n"));
  assert.match(r.out[0], /^Evidence branch: evidence\/HEAD at [0-9a-f]{40} /);
  assert.equal(g(fx.origin, "for-each-ref", "--format=%(refname)", "refs/heads/evidence"), "refs/heads/evidence/HEAD");
  assert.equal(g(fx.origin, "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.deepEqual(stateOf(fx.root), before);
});
