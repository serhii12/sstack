import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const STACK = join(HERE, "..", "..");
// A mutation run can point the tests at a changed copy of the script.
const SCRIPT = process.env.EVIDENCE_CHECK_SCRIPT ?? join(STACK, "skills", "prove", "scripts", "evidence-check.mjs");

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

// ---------- real image bytes, no dependencies ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A valid PNG, w x h, grey. */
function png(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grey
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const SAMPLES = {
  png: () => png(4, 2),
  jpg: () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]),
  jpeg: () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]),
  webp: () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([20, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(12, 1)]),
  gif: () => Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(20, 1)]),
  mp4: () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(16, 0)]),
  webm: () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20, 1)]),
};

// ---------- fixture ----------

const C1 = "The Contact page shows the new form at 375 px and 1280 px";
const C2 = "slugify returns hello-world for Hello World";
const C3 = "The page works in Safari";
const TICKET = `# 01: Contact form

Blocked by: none
Status: open
Spec: ../spec.md

## What to build

A form.

## Acceptance checks

- [ ] ${C1}
- [ ] ${C2}
- [ ] ${C3}

## Comments
`;

const sha = (b) => createHash("sha256").update(b).digest("hex");

/** A project: git repo, ticket, evidence folder. All three checks pass. Returns helpers. */
function makeProject({ ticket = TICKET } = {}) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "evidence-check-")));
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, ".scratch/contact/tickets"), { recursive: true });
  writeFileSync(join(repo, ".scratch/contact/tickets/01-form.md"), ticket);
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  const commit = git(repo, "rev-parse", "HEAD");
  const task = "contact";
  const ev = join(repo, ".artifacts", task, "evidence");
  mkdirSync(ev, { recursive: true });
  const p = {
    repo, task, ev, commit,
    put(rel, buf) {
      const f = join(ev, rel);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, buf);
      return { path: rel, sha256: sha(buf) };
    },
    write(index) {
      writeFileSync(join(ev, "index.json"), typeof index === "string" ? index : JSON.stringify(index, null, 2));
    },
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
  p.index = buildIndex(p);
  p.write(p.index);
  return p;
}

function replyText(check, verdict, images) {
  return `Check: ${check}\nVerdict: ${verdict}\nSeen: ${images.join(", ")}\nDiffers: nothing\n`;
}

function buildIndex(p) {
  const m = { ...p.put("screenshots/contact-375.png", png(375, 4)), viewport: "375x812", scheme: "light" };
  const d = { ...p.put("screenshots/contact-1280.png", png(1280, 4)), viewport: "1280x800", scheme: "light" };
  const reply = p.put("reviews/c1.md", replyText(C1, "matches", ["screenshots/contact-375.png", "screenshots/contact-1280.png"]));
  const out = p.put("output/slugify.txt", "hello-world\n");
  const safari = p.put("output/safari.txt", "Safari run output\n");
  return {
    schema: 1,
    task: p.task,
    ticket: ".scratch/contact/tickets/01-form.md",
    level: "behavior",
    commit: p.commit,
    gathered_at: new Date().toISOString(),
    environment: "test, headless",
    checks: [
      {
        check: C1,
        status: "pass",
        evidence: [m, d],
        review: { verdict: "matches", reviewer: "fresh-subagent", images: [m.path, d.path], reply },
      },
      { check: C2, status: "pass", evidence: [out] },
      { check: C3, status: "pass", evidence: [safari] },
    ],
  };
}

function run(p, args = [], opts = {}) {
  const r = spawnSync("node", [opts.script ?? SCRIPT, ...(opts.noTask ? [] : [p.task]), ...args], {
    cwd: opts.cwd ?? p.repo,
    encoding: "utf8",
    env: GIT_ENV,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withProject(fn, opts) {
  const p = makeProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

/** Mutate the index, write it, run, and return the result. */
function mutate(p, fn, args = []) {
  const idx = structuredClone(p.index);
  fn(idx);
  p.write(idx);
  return run(p, args);
}

function assertProblem(r, rule, textPart) {
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}\n${r.err}`);
  const lines = r.err.split("\n").filter((l) => l.split("  ")[1] === rule);
  assert.ok(lines.length > 0, `expected a \`${rule}\` line in:\n${r.err}`);
  if (textPart) assert.ok(lines.some((l) => l.includes(textPart)), `no \`${rule}\` line holds "${textPart}" in:\n${r.err}`);
  for (const l of lines) assert.match(l, /^\S.*  \S+  .+  Fix: .+/, `line has the wrong shape: ${l}`);
}

// ---------- happy path and exit codes ----------

test("sound evidence with every check pass: exit 0", () => {
  withProject((p) => {
    const r = run(p);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /3 pass, 0 fail, 0 untested\. sound and complete\. Exit 0\./);
    assert.equal(r.err, "");
  });
});

test("sound evidence with an untested check: exit 3, and the reason is printed", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[2] = { check: C3, status: "untested", reason: "no Safari on this server" };
    });
    assert.equal(r.code, 3, r.err);
    assert.match(r.err, /not-proven.*is untested: no Safari on this server/);
    assert.match(r.out, /1 untested\. sound, but not every check is proven\. Exit 3\./);
  });
});

test("sound evidence with a fail check: exit 3", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[1] = { check: C2, status: "fail", reason: "returned hello world", evidence: [i.checks[1].evidence[0]] };
    });
    assert.equal(r.code, 3, r.err);
    assert.match(r.err, /is fail: returned hello world/);
  });
});

test("a problem run names exit 1 in its summary line", () => {
  withProject((p) => {
    const r = mutate(p, (i) => delete i.checks[1].evidence[0].sha256);
    assert.equal(r.code, 1);
    assert.match(r.out, /1 problem\(s\)\. Exit 1\./);
  });
});

test("a problem wins over fail: exit 1, not 3", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[2] = { check: C3, status: "untested" };
    });
    assertProblem(r, "reason");
  });
});

test("--json prints a machine-readable result", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[2] = { check: C3, status: "untested", reason: "no Safari" };
    }, ["--json"]);
    assert.equal(r.code, 3);
    const j = JSON.parse(r.out);
    assert.equal(j.exit, 3);
    assert.equal(j.ok, false);
    assert.deepEqual(j.summary, { pass: 2, fail: 0, untested: 1 });
    assert.equal(j.notProven[0].status, "untested");
  });
});

test("--json lists problems with path, rule, message and fix", () => {
  withProject((p) => {
    const r = mutate(p, (i) => i.checks.pop(), ["--json"]);
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.problems[0].rule, "check-missing");
    assert.ok(j.problems[0].fix);
    assert.ok(j.problems[0].path);
  });
});

// ---------- schema ----------

test("schema: wrong schema number, task, level, date, environment, ticket", () => {
  for (const [name, fn] of [
    ["schema", (i) => (i.schema = 2)],
    ["task", (i) => (i.task = "other")],
    ["level", (i) => (i.level = "behaviour")], // the old British spelling of the level is refused
    ["gathered_at", (i) => (i.gathered_at = "yesterday")],
    ["environment", (i) => delete i.environment],
    ["ticket", (i) => delete i.ticket],
  ]) {
    withProject((p) => {
      const r = mutate(p, fn);
      assertProblem(r, "schema", name === "task" ? "other" : name === "schema" ? "must be 1" : `\`${name}\``);
    });
  }
});

test("schema: checks is not a list, entry is not an object, entry has no check text", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks = {})), "schema", "`checks` must be a list"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0] = "x")), "schema", "not an object"));
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[1].check), "schema", "no `check` text"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence = "a.txt")), "schema", "`evidence` must be a list"));
});

// ---------- every acceptance check has exactly one entry ----------

test("check-missing: a ticket check without an entry", () => {
  withProject((p) => assertProblem(mutate(p, (i) => i.checks.splice(1, 1)), "check-missing", C2));
});

test("check-unknown: an entry that the ticket does not have", () => {
  withProject((p) =>
    assertProblem(mutate(p, (i) => i.checks.push({ check: "Made up check", status: "untested", reason: "x" })), "check-unknown", "Made up check"),
  );
});

test("check-duplicate: two entries for one check", () => {
  withProject((p) => assertProblem(mutate(p, (i) => i.checks.push(structuredClone(i.checks[1]))), "check-duplicate", C2));
});

test("check text is matched after white space is normalized", () => {
  withProject((p) => {
    const r = mutate(p, (i) => (i.checks[1].check = `  ${C2.replace(" ", "   ")}\n`));
    assert.equal(r.code, 0, r.err);
  });
});

test("a ticket check that wraps over two lines is one check", () => {
  const ticket = TICKET.replace(`- [ ] ${C2}`, `- [ ] slugify returns\n  hello-world for Hello World`);
  withProject((p) => assert.equal(run(p).code, 0, run(p).err), { ticket });
});

// ---------- the ticket file ----------

test("ticket: no Acceptance checks heading, an empty list, a missing file, duplicate checks", () => {
  withProject((p) => assertProblem(run(p), "ticket", "no `## Acceptance checks` heading"), { ticket: "# 01: x\n\nNothing\n" });
  withProject((p) => assertProblem(run(p), "ticket", "no `- [ ]` items"), { ticket: "# 01: x\n\n## Acceptance checks\n\nNone yet.\n" });
  withProject((p) => assertProblem(mutate(p, (i) => (i.ticket = "nope.md")), "ticket", "does not exist"));
  withProject((p) => assertProblem(run(p), "ticket", "same text"), { ticket: TICKET.replace(C3, C2) });
});

test("ticket: a path that leaves the project is refused", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.ticket = "../outside.md")), "ticket", "leaves the project"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.ticket = "/etc/passwd")), "ticket", "absolute"));
});

test("--ticket overrides the ticket named in the index", () => {
  withProject((p) => {
    writeFileSync(join(p.repo, "other.md"), "## Acceptance checks\n\n- [ ] Only this\n");
    const r = run(p, ["--ticket", "other.md"]);
    assert.equal(r.code, 1);
    assert.match(r.err, /check-unknown/);
    assert.match(r.err, /check-missing/);
  });
});

// ---------- status, evidence and reason ----------

test("status: a value outside pass, fail and untested", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].status = "passed")), "status", "passed"));
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[1].status), "status"));
});

test("evidence-required: pass and fail need a file, untested does not", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence = [])), "evidence-required", "status pass"));
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[1].evidence), "evidence-required"));
  withProject((p) => assertProblem(mutate(p, (i) => ((i.checks[1].status = "fail"), (i.checks[1].reason = "x"), (i.checks[1].evidence = []))), "evidence-required", "status fail"));
  withProject((p) => {
    const r = mutate(p, (i) => (i.checks[1] = { check: C2, status: "untested", reason: "x" }));
    assert.equal(r.code, 3, r.err);
  });
});

test("reason: untested and fail need one", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[2] = { check: C3, status: "untested" })), "reason", "untested"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[2] = { check: C3, status: "untested", reason: "   " })), "reason"));
  withProject((p) => assertProblem(mutate(p, (i) => ((i.checks[1].status = "fail"), delete i.checks[1].reason)), "reason", "fail"));
});

// ---------- files: path, existence, empty, hash ----------

test("path: .. and absolute and backslash paths are refused", () => {
  for (const bad of ["../index.json", "a/../../x.txt", "/etc/passwd", "C:/x.txt", "a\\b.txt", "."]) {
    withProject((p) => {
      const r = mutate(p, (i) => (i.checks[1].evidence[0].path = bad));
      assertProblem(r, "path");
    });
  }
});

test("path: a file outside the evidence folder is never read, even when its hash matches", () => {
  withProject((p) => {
    const outside = Buffer.from("secret outside\n");
    writeFileSync(join(p.repo, ".artifacts", p.task, "outside.txt"), outside);
    const r = mutate(p, (i) => (i.checks[1].evidence[0] = { path: "../outside.txt", sha256: sha(outside) }));
    assertProblem(r, "path", "leaves the evidence folder");
  });
});

test("path: a symlink inside the folder that leads outside is refused", () => {
  withProject((p) => {
    const outside = Buffer.from("outside data\n");
    const target = join(p.repo, "outside.txt");
    writeFileSync(target, outside);
    symlinkSync(target, join(p.ev, "link.txt"));
    const r = mutate(p, (i) => (i.checks[1].evidence[0] = { path: "link.txt", sha256: sha(outside) }));
    assertProblem(r, "path", "leads outside");
  });
});

test("path: a symlink that stays inside the folder is fine", () => {
  withProject((p) => {
    symlinkSync(join(p.ev, "output", "slugify.txt"), join(p.ev, "alias.txt"));
    const r = mutate(p, (i) => (i.checks[1].evidence[0] = { path: "alias.txt", sha256: i.checks[1].evidence[0].sha256 }));
    assert.equal(r.code, 0, r.err);
  });
});

test("path: a folder is not a file", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].path = "output")), "path", "not a regular file"));
});

test("path: the same file twice in one entry", () => {
  withProject((p) => assertProblem(mutate(p, (i) => i.checks[1].evidence.push(structuredClone(i.checks[1].evidence[0]))), "path", "listed twice"));
});

test("file-missing: a named file that is not there", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].path = "output/none.txt")), "file-missing", "none.txt"));
});

test("file-missing: a broken symlink", () => {
  withProject((p) => {
    symlinkSync(join(p.ev, "gone"), join(p.ev, "dangling.txt"));
    assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].path = "dangling.txt")), "file-missing", "broken");
  });
});

test("file-empty: a zero-byte file", () => {
  withProject((p) => {
    const f = p.put("output/empty.txt", Buffer.alloc(0));
    assertProblem(mutate(p, (i) => (i.checks[1].evidence[0] = f)), "file-empty");
  });
});

test("sha256: a file that changed after indexing", () => {
  withProject((p) => {
    writeFileSync(join(p.ev, "output/slugify.txt"), "hello-world EDITED\n");
    assertProblem(run(p), "sha256", "changed after it was indexed");
  });
});

test("sha256: a missing or malformed hash", () => {
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[1].evidence[0].sha256), "sha256", "no valid sha256"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].sha256 = "abc")), "sha256"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].sha256 = i.checks[1].evidence[0].sha256.toUpperCase())), "sha256"));
});

// ---------- media ----------

test("media-magic: every supported type passes with real bytes and fails with text", () => {
  for (const ext of Object.keys(SAMPLES)) {
    withProject((p) => {
      const good = p.put(`output/sample.${ext}`, SAMPLES[ext]());
      // Use `.txt`-safe checks: a non-visual entry would need review for images, so test on a `fail` entry.
      const r = mutate(p, (i) => {
        i.checks[1] = { check: C2, status: "fail", reason: "demo", evidence: [good] };
      });
      assert.equal(r.code, 3, `${ext} with real bytes should be sound:\n${r.err}`);
    });
    withProject((p) => {
      const bad = p.put(`output/fake.${ext}`, "this is just text, renamed\n");
      const r = mutate(p, (i) => {
        i.checks[1] = { check: C2, status: "fail", reason: "demo", evidence: [bad] };
      });
      assertProblem(r, "media-magic", `first bytes are not`);
    });
  }
});

test("media-magic: a text file renamed to .png is caught (the headline case)", () => {
  withProject((p) => {
    const fake = p.put("screenshots/contact-375.png", "not a png at all\n");
    const r = mutate(p, (i) => {
      i.checks[0].evidence[0] = { ...i.checks[0].evidence[0], ...fake };
    });
    assertProblem(r, "media-magic", "PNG");
  });
});

test("media-magic: a PNG saved as .jpg and a JPEG saved as .png are caught", () => {
  withProject((p) => {
    const f = p.put("output/a.jpg", png(4, 2));
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "media-magic", "JPEG");
  });
  withProject((p) => {
    const f = p.put("output/a.png", SAMPLES.jpg());
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "media-magic", "PNG");
  });
});

test("media-magic: extension case does not hide a fake", () => {
  withProject((p) => {
    const f = p.put("output/A.PNG", "text\n");
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "media-magic");
  });
});

test("png-ihdr: the 8 magic bytes alone are not an image", () => {
  withProject((p) => {
    const f = p.put("output/stub.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "png-ihdr");
  });
  withProject((p) => {
    const zero = png(4, 2);
    zero.writeUInt32BE(0, 16);
    const f = p.put("output/zero.png", zero);
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "png-ihdr");
  });
});

test("media-type: a .mov file is refused with the formats to use", () => {
  withProject((p) => {
    const f = p.put("output/clip.mov", Buffer.alloc(40, 1));
    assertProblem(mutate(p, (i) => (i.checks[1] = { check: C2, status: "fail", reason: "x", evidence: [f] })), "media-type", ".mp4");
  });
});

// ---------- review of visual checks ----------

test("review: a visual pass with no review block", () => {
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[0].review), "review", "no `review`"));
});

test("review: the verdict must be matches", () => {
  for (const v of ["does-not-match", "cannot-tell"]) {
    withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].review.verdict = v)), "review", v));
  }
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].review.verdict = "looks fine")), "review", "must be one of"));
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[0].review.verdict), "review"));
});

test("review: a fail with a does-not-match verdict needs no pass rules", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[0].status = "fail";
      i.checks[0].reason = "form is cut off at 375 px";
      delete i.checks[0].review;
    });
    assert.equal(r.code, 3, r.err);
  });
});

test("review: reviewer kind is required, same-context warns, and can be refused", () => {
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[0].review.reviewer), "review", "reviewer"));
  withProject((p) => {
    const r = mutate(p, (i) => (i.checks[0].review.reviewer = "same-context"));
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /same-context \(weaker\)/);
  });
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].review.reviewer = "same-context"), ["--require-fresh-reviewer"]), "review", "same context"));
});

test("review-images: the review must cover every image and name only images of the entry", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].review.images = [i.checks[0].evidence[0].path])), "review-images", "never reviewed"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].review.images = [])), "review-images", "empty"));
  withProject((p) => assertProblem(mutate(p, (i) => i.checks[0].review.images.push("screenshots/other.png")), "review-images", "not an image file of this entry"));
});

test("review-images: a video alone is not enough, key frames are needed", () => {
  withProject((p) => {
    const v = p.put("video/flow.mp4", SAMPLES.mp4());
    const r = mutate(p, (i) => {
      i.checks[1] = { check: C2, status: "pass", evidence: [v], review: i.checks[0].review };
    });
    assertProblem(r, "review-images", "at least one image");
  });
});

test("review-images: a video plus reviewed key frames is fine", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      const v = p.put("video/flow.mp4", SAMPLES.mp4());
      i.checks[0].evidence.push(v);
    });
    assert.equal(r.code, 0, r.err);
  });
});

test("review-reply: the saved reply must hold the same verdict as the index", () => {
  withProject((p) => {
    const reply = p.put("reviews/c1.md", replyText(C1, "does-not-match", ["contact-375.png", "contact-1280.png"]));
    assertProblem(mutate(p, (i) => (i.checks[0].review.reply = reply)), "review-reply", "says `does-not-match`");
  });
});

test("review-reply: the reply must name every reviewed image", () => {
  withProject((p) => {
    const reply = p.put("reviews/c1.md", replyText(C1, "matches", ["contact-375.png"]));
    assertProblem(mutate(p, (i) => (i.checks[0].review.reply = reply)), "review-reply", "contact-1280.png");
  });
});

test("review-reply: the reply needs a block for this check, in the Check:/Verdict: format", () => {
  withProject((p) => {
    const reply = p.put("reviews/c1.md", "Everything looks great to me.\n");
    assertProblem(mutate(p, (i) => (i.checks[0].review.reply = reply)), "review-reply", "no block");
  });
  withProject((p) => {
    const reply = p.put("reviews/c1.md", replyText("A different check", "matches", ["contact-375.png", "contact-1280.png"]));
    assertProblem(mutate(p, (i) => (i.checks[0].review.reply = reply)), "review-reply", "no block");
  });
});

test("review-reply: a reply for several checks in one file works, and 'does not match' with spaces is read", () => {
  withProject((p) => {
    const text = replyText(C2, "does not match", ["x.png"]) + "\n" + replyText(C1, "matches", ["contact-375.png", "contact-1280.png"]);
    const reply = p.put("reviews/all.md", text);
    const r = mutate(p, (i) => (i.checks[0].review.reply = reply));
    assert.equal(r.code, 0, r.err);
  });
});

test("review-reply: the reply is required, must be hashed, and must be text", () => {
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[0].review.reply), "schema", "review.reply"));
  withProject((p) => assertProblem(mutate(p, (i) => delete i.checks[0].review.reply.sha256), "sha256"));
  withProject((p) => {
    const reply = p.put("reviews/c1.png", png(4, 2));
    assertProblem(mutate(p, (i) => (i.checks[0].review.reply = reply)), "review-reply", ".md or .txt");
  });
});

// ---------- viewports ----------

test("viewport: a visual pass needs a phone width and a desktop width", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[0].evidence.pop();
      i.checks[0].review.images.pop();
      i.checks[0].review.reply = p.put("reviews/c1.md", replyText(C1, "matches", ["contact-375.png"]));
    });
    assertProblem(r, "viewport", "Found: 375");
  });
  withProject((p) => {
    const r = mutate(p, (i) => {
      for (const f of i.checks[0].evidence) delete f.viewport;
    });
    assertProblem(r, "viewport", "none declared");
  });
});

test("viewport: a written waiver lets a visual pass go with one size", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.checks[0].evidence.pop();
      i.checks[0].review.images.pop();
      i.checks[0].review.reply = p.put("reviews/c1.md", replyText(C1, "matches", ["contact-375.png"]));
      i.checks[0].viewport_waiver = "terminal output, no viewport";
    });
    assert.equal(r.code, 0, r.err);
  });
});

test("viewport: the declared viewport must fit the real PNG width", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].evidence[0].viewport = "320x568")), "viewport", "375 px wide"));
});

test("viewport: a 2x capture of a 375 viewport is fine, an element capture is not checked", () => {
  withProject((p) => {
    const m2 = { ...p.put("screenshots/m2.png", png(750, 4)), viewport: "375x812" };
    const r = mutate(p, (i) => {
      i.checks[0].evidence[0] = m2;
      i.checks[0].review.images[0] = m2.path;
      i.checks[0].review.reply = p.put("reviews/c1.md", replyText(C1, "matches", ["m2.png", "contact-1280.png"]));
    });
    assert.equal(r.code, 0, r.err);
  });
  withProject((p) => {
    const el = { ...p.put("screenshots/el.png", png(60, 4)), viewport: "375x812", element: ".card" };
    const r = mutate(p, (i) => {
      i.checks[0].evidence.push(el);
      i.checks[0].review.images.push(el.path);
      i.checks[0].review.reply = p.put("reviews/c1.md", replyText(C1, "matches", ["contact-375.png", "contact-1280.png", "el.png"]));
    });
    assert.equal(r.code, 0, r.err);
  });
});

// ---------- red-then-green ----------

test("phase: at level red-then-green a pass needs a before file and an after file", () => {
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.level = "red-then-green";
      i.checks[1].evidence[0].phase = "after";
    });
    assertProblem(r, "phase", "`before`");
  });
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.level = "red-then-green";
    });
    assertProblem(r, "phase", "`after`");
  });
  withProject((p) => {
    const r = mutate(p, (i) => {
      i.level = "red-then-green";
      i.checks[0].evidence[0].phase = "before";
      i.checks[0].evidence[1].phase = "after";
      for (const k of [1, 2]) {
        const b = p.put(`output/before-${k}.txt`, `fail ${k}\n`);
        i.checks[k].evidence = [{ ...b, phase: "before" }, { ...i.checks[k].evidence[0], phase: "after" }];
      }
    });
    assert.equal(r.code, 0, r.err);
  });
});

test("phase: other levels do not need before files, and a bad phase value is refused", () => {
  withProject((p) => assert.equal(run(p).code, 0));
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[1].evidence[0].phase = "during")), "schema", "phase"));
});

// ---------- commit ----------

test("commit: missing, malformed or unknown", () => {
  withProject((p) => assertProblem(mutate(p, (i) => delete i.commit), "commit", "7 to 40"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.commit = "--help")), "commit", "7 to 40"));
  withProject((p) => assertProblem(mutate(p, (i) => (i.commit = "deadbeefdeadbeef")), "commit", "does not exist"));
});

test("commit: a short sha of HEAD is fine", () => {
  withProject((p) => assert.equal(mutate(p, (i) => (i.commit = p.commit.slice(0, 9))).code, 0));
});

test("commit: an ancestor of HEAD passes, HEAD must match under --strict-head", () => {
  withProject((p) => {
    writeFileSync(join(p.repo, "app.txt"), "v2\n");
    git(p.repo, "commit", "-q", "-am", "second");
    assert.equal(run(p).code, 0, "an ancestor passes without --strict-head");
    assertProblem(run(p, ["--strict-head"]), "commit", "not HEAD");
  });
});

test("commit: HEAD passes under --strict-head", () => {
  withProject((p) => assert.equal(run(p, ["--strict-head"]).code, 0));
});

test("commit: a stale commit (a branch that HEAD does not contain) fails", () => {
  withProject((p) => {
    git(p.repo, "switch", "-q", "-c", "other");
    writeFileSync(join(p.repo, "app.txt"), "other\n");
    git(p.repo, "commit", "-q", "-am", "on other");
    const stale = git(p.repo, "rev-parse", "HEAD");
    git(p.repo, "switch", "-q", "main");
    writeFileSync(join(p.repo, "app.txt"), "main2\n");
    git(p.repo, "commit", "-q", "-am", "on main");
    assertProblem(mutate(p, (i) => (i.commit = stale)), "commit", "stale");
  });
});

test("dirty-tree: --strict-head refuses uncommitted changes outside .artifacts, and ignores .artifacts", () => {
  withProject((p) => {
    writeFileSync(join(p.ev, "extra.txt"), "x");
    assert.equal(run(p, ["--strict-head"]).code, 0, "files under .artifacts are ignored");
    writeFileSync(join(p.repo, "app.txt"), "edited after the evidence\n");
    assertProblem(run(p, ["--strict-head"]), "dirty-tree", "app.txt");
    assert.equal(run(p).code, 0, "without --strict-head the dirty tree is not checked");
  });
  withProject((p) => {
    writeFileSync(join(p.repo, "new-untracked.js"), "x");
    assertProblem(run(p, ["--strict-head"]), "dirty-tree", "new-untracked.js");
  });
});

// ---------- exit 2: usage and read errors ----------

test("exit 2: no index, bad JSON, bad task name, unknown option, no task, not a repo", () => {
  withProject((p) => {
    rmSync(join(p.ev, "index.json"));
    const r = run(p);
    assert.equal(r.code, 2);
    assert.match(r.err, /index\.json cannot be read|cannot read/);
  });
  withProject((p) => {
    p.write("{ not json");
    const r = run(p);
    assert.equal(r.code, 2);
    assert.match(r.err, /not valid JSON/);
  });
  withProject((p) => {
    p.write("[1,2]");
    assertProblem(run(p), "schema", "not a JSON object");
  });
  withProject((p) => {
    assert.equal(run({ ...p, task: "../etc" }).code, 2);
    assert.equal(run({ ...p, task: "nothere" }).code, 2);
    assert.equal(run(p, ["--bogus"]).code, 2);
    assert.equal(run(p, ["--repo"]).code, 2);
    assert.equal(run(p, [], { noTask: true }).code, 2);
    assert.equal(run(p, ["a", "b"]).code, 2);
  });
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "evidence-nogit-")));
  try {
    const r = spawnSync("node", [SCRIPT, "t"], { cwd: dir, encoding: "utf8", env: { ...GIT_ENV, GIT_CEILING_DIRECTORIES: dirname(dir) } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not a git repository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a task name that climbs out of .artifacts is refused, even when the folder exists", () => {
  withProject((p) => {
    mkdirSync(join(p.repo, "x", "evidence"), { recursive: true });
    writeFileSync(join(p.repo, "x", "evidence", "index.json"), JSON.stringify({ ...p.index, task: "../x" }));
    const r = run({ ...p, task: "../x" });
    assert.equal(r.code, 2);
    assert.match(r.err, /not valid/);
    const h = spawnSync("node", [SCRIPT, "hash", "../x"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(h.status, 2);
  });
});

test("--repo points the script at another project", () => {
  withProject((p) => {
    const r = spawnSync("node", [SCRIPT, p.task, "--repo", p.repo], { cwd: tmpdir(), encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, r.stderr);
  });
});

// ---------- hash and report ----------

test("hash: prints sha256 lines, and --write fills only the missing ones", () => {
  withProject((p) => {
    const idx = structuredClone(p.index);
    const want = idx.checks[1].evidence[0].sha256;
    delete idx.checks[1].evidence[0].sha256;
    idx.checks[2].evidence[0].sha256 = "0".repeat(64); // wrong on purpose, must stay
    p.write(idx);
    const r = run(p, ["--write"], { script: SCRIPT }).code; // --write without hash is a usage error
    assert.equal(r, 2);
    const h = spawnSync("node", [SCRIPT, "hash", p.task, "--write"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(h.status, 0, h.stderr);
    assert.match(h.stdout, new RegExp(`${want}  output/slugify.txt`));
    const after = JSON.parse(readFileSync(join(p.ev, "index.json"), "utf8"));
    assert.equal(after.checks[1].evidence[0].sha256, want);
    assert.equal(after.checks[2].evidence[0].sha256, "0".repeat(64), "an existing hash is never overwritten");
    assert.equal(run(p).code, 1, "the wrong hash is still reported");
  });
});

test("fill-hashes: the documented name fills the missing hashes like hash, and the fix line names it", () => {
  withProject((p) => {
    const idx = structuredClone(p.index);
    const want = idx.checks[1].evidence[0].sha256;
    delete idx.checks[1].evidence[0].sha256;
    p.write(idx);
    assert.match(run(p).err, /Fix: run `node \.claude\/skills\/prove\/scripts\/evidence-check\.mjs fill-hashes contact --write`/);
    const h = spawnSync("node", [SCRIPT, "fill-hashes", p.task, "--write"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(h.status, 0, h.stderr);
    assert.equal(JSON.parse(readFileSync(join(p.ev, "index.json"), "utf8")).checks[1].evidence[0].sha256, want);
    assert.equal(run(p).code, 0);
  });
});

test("hash: does not follow a path that leaves the folder", () => {
  withProject((p) => {
    const idx = structuredClone(p.index);
    idx.checks[1].evidence[0].path = "../../../app.txt";
    p.write(idx);
    const h = spawnSync("node", [SCRIPT, "hash", p.task], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(h.status, 0);
    assert.match(h.stdout, /leaves the evidence folder/);
    assert.doesNotMatch(h.stdout, /app\.txt$/m);
  });
});

test("report: prints a markdown table and a before and after table", () => {
  withProject((p) => {
    const idx = structuredClone(p.index);
    idx.checks[0].evidence[0].phase = "before";
    idx.checks[0].evidence[1].phase = "after";
    idx.checks[2] = { check: C3, status: "untested", reason: "no Safari | here" };
    p.write(idx);
    const r = spawnSync("node", [SCRIPT, "report", p.task], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Result: 2 pass, 0 fail, 1 untested/);
    assert.match(r.stdout, /\| .*Safari.* \| untested \| no Safari \\\| here/);
    assert.match(r.stdout, /## Before and after/);
    assert.match(r.stdout, /!\[before\]\(screenshots\/contact-375\.png\)/);
  });
});

// ---------- red team: holes found by the independent check ----------

/** A baseline JPEG with a real SOF0 frame header, w x h. */
function jpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
/** A GIF header with a logical screen of w x h. */
function gif(w, h) {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "latin1");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return Buffer.concat([b, Buffer.from([0x3b])]);
}
/** A WebP file with an extended (VP8X) header, w x h. */
function webp(w, h) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

/** Replace the two screenshots of check 1 with files made by `make`, with the extension `ext`. */
function swapScreens(p, ext, make, phoneW = 375, deskW = 1280) {
  return mutate(p, (i) => {
    const m = { ...p.put(`screenshots/m.${ext}`, make(phoneW, 4)), viewport: "375x812" };
    const d = { ...p.put(`screenshots/d.${ext}`, make(deskW, 4)), viewport: "1280x800" };
    const reply = p.put("reviews/c1.md", replyText(C1, "matches", [m.path, d.path]));
    i.checks[0].evidence = [m, d];
    i.checks[0].review = { verdict: "matches", reviewer: "fresh-subagent", images: [m.path, d.path], reply };
  });
}

test("file-empty: a text file that holds only white space", () => {
  withProject((p) => {
    const f = p.put("output/blank.txt", " \n\t\n");
    assertProblem(mutate(p, (i) => (i.checks[1].evidence[0] = f)), "file-empty", "only white space");
  });
});

test("path: an evidence folder that is a link to a folder outside the project is refused", () => {
  withProject((p) => {
    const away = realpathSync(mkdtempSync(join(tmpdir(), "evidence-away-")));
    try {
      mkdirSync(join(away, "output"));
      writeFileSync(join(away, "output/x.txt"), "x\n");
      const idx = structuredClone(p.index);
      idx.task = "linked";
      idx.checks = [
        { check: C1, status: "untested", reason: "r" },
        { check: C2, status: "pass", evidence: [{ path: "output/x.txt", sha256: sha("x\n") }] },
        { check: C3, status: "untested", reason: "r" },
      ];
      writeFileSync(join(away, "index.json"), JSON.stringify(idx));
      mkdirSync(join(p.repo, ".artifacts", "linked"));
      symlinkSync(away, join(p.repo, ".artifacts", "linked", "evidence"));
      const r = spawnSync("node", [SCRIPT, "linked"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
      assertProblem({ code: r.status, err: r.stderr }, "path", "outside the project");
      const h = spawnSync("node", [SCRIPT, "hash", "linked"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
      assert.equal(h.status, 2, "hash must refuse the linked folder");
      assert.match(h.stderr, /outside the project/);
    } finally {
      rmSync(away, { recursive: true, force: true });
    }
  });
});

test("path: an index.json that links outside the folder is refused, and hash --write never writes through it", () => {
  withProject((p) => {
    const away = realpathSync(mkdtempSync(join(tmpdir(), "evidence-away-")));
    try {
      const idx = structuredClone(p.index);
      delete idx.checks[1].evidence[0].sha256;
      const text = JSON.stringify(idx);
      writeFileSync(join(away, "index.json"), text);
      rmSync(join(p.ev, "index.json"));
      symlinkSync(join(away, "index.json"), join(p.ev, "index.json"));
      assertProblem(run(p), "path", "index is a link");
      const h = spawnSync("node", [SCRIPT, "hash", p.task, "--write"], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
      assert.equal(h.status, 2, h.stdout);
      assert.equal(readFileSync(join(away, "index.json"), "utf8"), text, "the file outside must not change");
    } finally {
      rmSync(away, { recursive: true, force: true });
    }
  });
});

test("path: a linked subfolder inside the evidence folder that leads outside is refused", () => {
  withProject((p) => {
    const away = realpathSync(mkdtempSync(join(tmpdir(), "evidence-away-")));
    try {
      writeFileSync(join(away, "x.txt"), "x\n");
      symlinkSync(away, join(p.ev, "shots"));
      assertProblem(mutate(p, (i) => (i.checks[1].evidence[0] = { path: "shots/x.txt", sha256: sha("x\n") })), "path", "leads outside");
    } finally {
      rmSync(away, { recursive: true, force: true });
    }
  });
});

test("png-end: a PNG that is cut short is refused", () => {
  withProject((p) => {
    const full = png(375, 4);
    const f = { ...p.put("screenshots/contact-375.png", full.subarray(0, full.length - 12)), viewport: "375x812", scheme: "light" };
    const r = mutate(p, (i) => {
      i.checks[0].evidence[0] = f;
      i.checks[0].review.reply = p.put("reviews/c1.md", readFileSync(join(p.ev, "reviews/c1.md")));
    });
    assertProblem(r, "png-end", "cut short");
  });
});

test("viewport: JPEG, GIF and WebP widths are read, so a false viewport fails for every image type", () => {
  for (const [ext, make] of [["jpg", jpeg], ["gif", gif], ["webp", webp]]) {
    withProject((p) => {
      const ok = swapScreens(p, ext, make);
      assert.equal(ok.code, 0, `${ext}: true widths must pass\n${ok.err}`);
    });
    withProject((p) => {
      // Two desktop captures, one of them labelled as a phone capture.
      assertProblem(swapScreens(p, ext, make, 1280, 1280), "viewport", "1280 px wide");
    });
  }
});

test("viewport: an image whose width cannot be read cannot claim a viewport", () => {
  withProject((p) => assertProblem(swapScreens(p, "jpg", () => SAMPLES.jpg()), "viewport", "cannot be read"));
});

test("viewport: a zero size is refused", () => {
  withProject((p) => assertProblem(mutate(p, (i) => (i.checks[0].evidence[0].viewport = "00x812")), "schema", "zero size"));
});

test("report: refuses to print a table for evidence that has problems", () => {
  withProject((p) => {
    writeFileSync(join(p.ev, "output/slugify.txt"), "tampered\n");
    const r = spawnSync("node", [SCRIPT, "report", p.task], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stdout, "", "no table on stdout");
    assert.match(r.stderr, /sha256/);
    assert.match(r.stderr, /report refused/);
  });
});

test("report: shows a viewport waiver, so a reader sees why a width is missing", () => {
  withProject((p) => {
    const idx = structuredClone(p.index);
    idx.checks[0].evidence = [idx.checks[0].evidence[1]];
    idx.checks[0].review.images = [idx.checks[0].evidence[0].path];
    idx.checks[0].viewport_waiver = "desktop app only";
    p.write(idx);
    const r = spawnSync("node", [SCRIPT, "report", p.task], { cwd: p.repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Width rule waived: desktop app only/);
  });
});

test("a run with --repo and a working folder that are symlinked project paths", () => {
  withProject((p) => {
    const away = realpathSync(mkdtempSync(join(tmpdir(), "evidence-link-")));
    try {
      const linked = join(away, "proj");
      symlinkSync(p.repo, linked);
      const a = spawnSync("node", [SCRIPT, p.task, "--repo", linked, "--strict-head"], { cwd: away, encoding: "utf8", env: GIT_ENV });
      assert.equal(a.status, 0, a.stderr);
      const b = spawnSync("node", [SCRIPT, p.task, "--strict-head"], { cwd: linked, encoding: "utf8", env: GIT_ENV });
      assert.equal(b.status, 0, b.stderr);
      writeFileSync(join(p.ev, "output/slugify.txt"), "tampered\n");
      const c = spawnSync("node", [SCRIPT, p.task, "--repo", linked], { cwd: away, encoding: "utf8", env: GIT_ENV });
      assert.equal(c.status, 1, "a symlinked project path must still catch a changed file");
    } finally {
      rmSync(away, { recursive: true, force: true });
    }
  });
});

// ---------- installed layout and symlink ----------

function installInto(p) {
  const r = spawnSync("node", [join(STACK, "scripts", "install.mjs"), p.repo], { encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, r.stderr);
  return join(p.repo, ".claude", "skills", "prove", "scripts", "evidence-check.mjs");
}

test("installed layout: runs from .claude/skills/prove/scripts/ in a project", () => {
  withProject((p) => {
    const installed = installInto(p);
    assert.ok(existsSync(installed), "the installer copies the script");
    const ok = run(p, [], { script: installed });
    assert.equal(ok.code, 0, ok.err);
    assert.match(ok.out, /sound and complete/);
    writeFileSync(join(p.ev, "output/slugify.txt"), "tampered\n");
    const bad = run(p, [], { script: installed });
    assert.equal(bad.code, 1);
    assert.match(bad.err, /sha256/);
  });
});

test("installed layout: the skill files that SKILL.md links are installed too", () => {
  withProject((p) => {
    installInto(p);
    for (const f of ["SKILL.md", "CAPTURE.md", "REVIEWER-BRIEF.md", "INDEX-FORMAT.md"]) {
      assert.ok(existsSync(join(p.repo, ".claude", "skills", "prove", f)), f);
    }
  });
});

test("a run through a symlink still runs (main check compares real paths)", () => {
  withProject((p) => {
    const link = join(p.repo, "link-to-check.mjs");
    symlinkSync(SCRIPT, link);
    const r = run(p, [], { script: link });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /sound and complete/);
    p.write("{ bad");
    const r2 = run(p, [], { script: link });
    assert.equal(r2.code, 2, "a symlinked run must still report errors");
    assert.match(r2.err, /not valid JSON/);
  });
});

test("the script has no dependency outside node:", () => {
  const src = readFileSync(SCRIPT, "utf8");
  for (const m of src.matchAll(/^import .* from "([^"]+)"/gm)) assert.match(m[1], /^node:/, m[1]);
});

// ---- nested bullets belong to their check (e2e run 1 break 7) ----

test("parseAcceptanceChecks: nested bullets and the line after them fold into their check, and an indented checkbox stays a check", async () => {
  const { parseAcceptanceChecks } = await import("../../skills/prove/scripts/evidence-check.mjs");
  const ticket = [
    "# 02: Filter",
    "",
    "## Acceptance checks",
    "",
    "- [ ] HTTP API: `GET /api/items?tag=Rust` returns only the links tagged `rust`.",
    "- [ ] Page, by screenshot:",
    "  - the tag buttons with counts",
    "  - a filtered list with `/?tag=rust` in the address",
    "",
    "  Anything without a screenshot is reported as untested.",
    "  - [ ] A nested checkbox is a check of its own.",
    "- [ ] The README shows `?tag=`.",
    "",
  ].join("\n");
  assert.deepEqual(parseAcceptanceChecks(ticket), [
    "HTTP API: `GET /api/items?tag=Rust` returns only the links tagged `rust`.",
    "Page, by screenshot: - the tag buttons with counts - a filtered list with `/?tag=rust` in the address Anything without a screenshot is reported as untested.",
    "A nested checkbox is a check of its own.",
    "The README shows `?tag=`.",
  ]);
});
