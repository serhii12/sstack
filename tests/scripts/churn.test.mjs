import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { churn, unquotePath, EXIT } from "../../skills/improve-codebase/scripts/churn.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "improve-codebase", "scripts", "churn.mjs");
const BASE = mkdtempSync(join(tmpdir(), "churn-base-"));
// Remove the base folder after the last test, in any test order.
after(() => rmSync(BASE, { recursive: true, force: true }));

// No global or system git config, so the owner's hooks and settings never run here.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CEILING_DIRECTORIES: BASE,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
for (const k of Object.keys(GIT_ENV)) if (k === "GIT_DIR" || k === "GIT_WORK_TREE" || k === "GIT_INDEX_FILE") delete GIT_ENV[k];

function git(cwd, args, env = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...GIT_ENV, ...env } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function repo() {
  const dir = mkdtempSync(join(BASE, "repo-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "core.hooksPath", "/dev/null"]);
  return dir;
}

let tick = 0;
/** Write the files and commit them. Each commit gets its own date, one day apart from 2026-01-01. */
function commit(dir, files, { date } = {}) {
  for (const [path, content] of Object.entries(files)) {
    const p = join(dir, path);
    if (content === null) {
      unlinkSync(p);
      continue;
    }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  git(dir, ["add", "-A"]);
  tick++;
  const d = date ?? new Date(Date.UTC(2026, 0, 1) + tick * 86_400_000).toISOString();
  git(dir, ["commit", "-q", "-m", `c${tick}`], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
}

function cli(args, { cwd, env } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: { ...GIT_ENV, ...env } });
}

function withRepo(fn) {
  const dir = repo();
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** a.mjs changes 3 times, b.mjs 2 times, c.mjs and d.mjs once. */
function standard(dir) {
  commit(dir, { "src/a.mjs": "1", "src/b.mjs": "1", "src/d.mjs": "1" });
  commit(dir, { "src/a.mjs": "2", "src/c.mjs": "1" });
  commit(dir, { "src/a.mjs": "3", "src/b.mjs": "2" });
}

test("ranks files by commit count, most first, and ties by path", () => {
  withRepo((dir) => {
    standard(dir);
    const r = churn(dir);
    assert.equal(r.commits, 3);
    assert.deepEqual(r.files, [
      { path: "src/a.mjs", count: 3 },
      { path: "src/b.mjs", count: 2 },
      { path: "src/c.mjs", count: 1 },
      { path: "src/d.mjs", count: 1 },
    ]);
  });
});

test("cli: prints a header and one `count  path` line per file, exit 0", () => {
  withRepo((dir) => {
    standard(dir);
    const r = cli([], { cwd: dir });
    assert.equal(r.status, EXIT.OK, r.stderr);
    const lines = r.stdout.trim().split("\n");
    assert.match(lines[0], /^Churn over 3 commit\(s\), last 200 commits, merges left out\. Top 4 of 4 file\(s\):$/);
    assert.deepEqual(lines.slice(1), ["3  src/a.mjs", "2  src/b.mjs", "1  src/c.mjs", "1  src/d.mjs"]);
  });
});

test("--commits limits the window to the last n commits", () => {
  withRepo((dir) => {
    standard(dir);
    const r = churn(dir, { commits: 1 });
    assert.equal(r.commits, 1);
    assert.deepEqual(r.files.map((f) => f.path), ["src/a.mjs", "src/b.mjs"]);
  });
});

test("--since limits the window by date", () => {
  withRepo((dir) => {
    commit(dir, { "old.mjs": "1" }, { date: "2020-01-01T00:00:00Z" });
    commit(dir, { "new.mjs": "1" }, { date: "2026-06-01T00:00:00Z" });
    const r = churn(dir, { since: "2025-01-01" });
    assert.deepEqual(r.files.map((f) => f.path), ["new.mjs"]);
  });
});

test("--top limits the printed lines", () => {
  withRepo((dir) => {
    standard(dir);
    const r = cli(["--top", "2"], { cwd: dir });
    assert.equal(r.status, 0);
    assert.deepEqual(r.stdout.trim().split("\n").slice(1), ["3  src/a.mjs", "2  src/b.mjs"]);
  });
});

test("files that no longer exist are left out", () => {
  withRepo((dir) => {
    standard(dir);
    commit(dir, { "src/a.mjs": null });
    assert.deepEqual(churn(dir).files.map((f) => f.path), ["src/b.mjs", "src/c.mjs", "src/d.mjs"]);
  });
});

test("lockfiles are left out", () => {
  withRepo((dir) => {
    commit(dir, { "package-lock.json": "{}", "pnpm-lock.yaml": "x", "sub/yarn.lock": "x", "src/a.mjs": "1" });
    commit(dir, { "package-lock.json": "{ }", "src/a.mjs": "2" });
    assert.deepEqual(churn(dir).files.map((f) => f.path), ["src/a.mjs"]);
  });
});

test("agent tooling, work notes and dependency folders are left out", () => {
  withRepo((dir) => {
    commit(dir, {
      ".claude/skills/x/SKILL.md": "1", ".githooks/pre-commit": "1", ".stack/check": "1", ".artifacts/t/review.md": "1",
      ".scratch/f/spec.md": "1", "node_modules/a/index.js": "1", "pkg/node_modules/b/index.js": "1", "src/a.mjs": "1",
      "docs/claude-notes.md": "1",
    });
    assert.deepEqual(churn(dir).files.map((f) => f.path), ["docs/claude-notes.md", "src/a.mjs"]);
  });
});

test("a merge commit does not count a file again", () => {
  withRepo((dir) => {
    commit(dir, { "a.mjs": "1" });
    git(dir, ["switch", "-q", "-c", "side"]);
    commit(dir, { "b.mjs": "1" });
    git(dir, ["switch", "-q", "main"]);
    commit(dir, { "a.mjs": "2" });
    git(dir, ["merge", "-q", "--no-ff", "-m", "merge side", "side"]);
    const r = churn(dir);
    assert.equal(r.commits, 3);
    assert.deepEqual(r.files, [{ path: "a.mjs", count: 2 }, { path: "b.mjs", count: 1 }]);
  });
});

test("a run from a subfolder prints paths from the repo root", () => {
  withRepo((dir) => {
    standard(dir);
    const r = cli([], { cwd: join(dir, "src") });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\n3 {2}src\/a\.mjs\n/);
  });
});

test("the folder argument names the repo", () => {
  withRepo((dir) => {
    standard(dir);
    const r = cli([dir], { cwd: BASE });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /src\/a\.mjs/);
  });
});

test("a path that git quotes is read back as the real name", () => {
  assert.equal(unquotePath('"a\\"b.mjs"'), 'a"b.mjs');
  assert.equal(unquotePath('"tab\\there.mjs"'), "tab\there.mjs");
  assert.equal(unquotePath('"caf\\303\\251.mjs"'), "café.mjs");
  assert.equal(unquotePath("plain.mjs"), "plain.mjs");
  withRepo((dir) => {
    commit(dir, { 'q"uote.mjs': "1", "café.mjs": "1", "with space.mjs": "1" });
    assert.deepEqual(churn(dir).files.map((f) => f.path).sort(), ["café.mjs", 'q"uote.mjs', "with space.mjs"].sort());
  });
});

test("a file name with a newline stays on one output line", () => {
  withRepo((dir) => {
    commit(dir, { "src/a.mjs": "1", "x\n999  src/evil.mjs": "1", "-rf.mjs": "1", " lead.mjs": "1" });
    const r = cli([], { cwd: dir });
    assert.equal(r.status, EXIT.OK, r.stderr);
    const lines = r.stdout.trimEnd().split("\n").slice(1);
    assert.deepEqual(lines, ["1   lead.mjs", "1  -rf.mjs", "1  src/a.mjs", '1  "x\\n999  src/evil.mjs"']);
  });
});

test("a shallow clone says so in the header, and a full clone does not", () => {
  withRepo((dir) => {
    standard(dir);
    const clone = join(BASE, `shallow-${tick}`);
    git(BASE, ["clone", "-q", "--depth", "1", `file://${dir}`, clone]);
    try {
      const r = cli([], { cwd: clone });
      assert.equal(r.status, EXIT.OK, r.stderr);
      assert.match(r.stdout.split("\n")[0], /^Churn over 1 commit\(s\), last 200 commits, merges left out\. The clone is shallow, so older commits are missing\. Top 4 of 4 file\(s\):$/);
      assert.doesNotMatch(cli([], { cwd: dir }).stdout, /shallow/);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  });
});

test("--since shows the date that git read, so a date that git cannot read is visible", () => {
  withRepo((dir) => {
    commit(dir, { "new.mjs": "1" }, { date: new Date().toISOString() });
    const good = cli(["--since", "2020-03-04"], { cwd: dir });
    assert.match(good.stdout, /since 2020-03-04 \(git reads it as 2020-03-04\)/);
    // git reads the year 2999 as this year. The header must show that.
    const odd = cli(["--since", "2999-01-01"], { cwd: dir });
    const read = /since 2999-01-01 \(git reads it as (\d{4})-\d\d-\d\d\)/.exec(odd.stdout + odd.stderr);
    assert.ok(read, odd.stdout + odd.stderr);
    assert.notEqual(read[1], "2999");
  });
});

test("--since shows the same date in every time zone, also where the UTC date is a different day", () => {
  // At each hour, the local date at UTC-12 or at UTC+14 is not the UTC date. So one of the two zones always tests the gap.
  withRepo((dir) => {
    commit(dir, { "new.mjs": "1" }, { date: new Date().toISOString() });
    for (const TZ of ["Etc/GMT+12", "Etc/GMT-14", "UTC"]) {
      const r = cli(["--since", "2020-03-04"], { cwd: dir, env: { TZ } });
      assert.equal(r.status, EXIT.OK, r.stderr);
      assert.match(r.stdout, /since 2020-03-04 \(git reads it as 2020-03-04\)/, TZ);
    }
  });
});

test("exit 1: the window holds no file that still exists", () => {
  withRepo((dir) => {
    commit(dir, { "a.mjs": "1" });
    commit(dir, { "a.mjs": null });
    const r = cli([], { cwd: dir });
    assert.equal(r.status, EXIT.NOTHING);
    assert.match(r.stdout, /no changed file still exists\. Fix: /);
  });
});

test("exit 3: a repo with no commits", () => {
  withRepo((dir) => {
    writeFileSync(join(dir, "a.mjs"), "1");
    const r = cli([], { cwd: dir });
    assert.equal(r.status, EXIT.NO_COMMITS);
    assert.match(r.stderr, /no commits.*Fix: /);
  });
});

test("exit 4: a folder outside any git repo", () => {
  const dir = mkdtempSync(join(BASE, "plain-"));
  try {
    const r = cli([], { cwd: dir });
    assert.equal(r.status, EXIT.NOT_A_REPO);
    assert.match(r.stderr, /not inside a git work tree\. Fix: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exit 5: git cannot run", () => {
  withRepo((dir) => {
    commit(dir, { "a.mjs": "1" });
    const r = cli([], { cwd: dir, env: { PATH: "/nonexistent" } });
    assert.equal(r.status, EXIT.GIT_FAILED);
    assert.match(r.stderr, /git cannot run.*Fix: /);
  });
});

test("exit 2: usage errors", () => {
  withRepo((dir) => {
    commit(dir, { "a.mjs": "1" });
    for (const args of [["--commits"], ["--commits", "0"], ["--commits", "abc"], ["--commits", "2147483648"], ["--commits", "99999999999999999999"], ["--top", "-1"], ["--since"], ["--since", "-x"], ["--bogus"], ["a", "b"], [join(dir, "a.mjs")]]) {
      const r = cli(args, { cwd: dir });
      assert.equal(r.status, EXIT.USAGE, `args ${JSON.stringify(args)}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /Fix: /);
    }
  });
});

test("--help exits 0", () => {
  const r = cli(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test("a symlink to the script still runs", () => {
  withRepo((dir) => {
    standard(dir);
    const linkDir = mkdtempSync(join(BASE, "link-"));
    try {
      const link = join(linkDir, "churn.mjs");
      symlinkSync(SCRIPT, link);
      const r = spawnSync(process.execPath, [link], { cwd: dir, encoding: "utf8", env: GIT_ENV });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /3 {2}src\/a\.mjs/);
    } finally {
      rmSync(linkDir, { recursive: true, force: true });
    }
  });
});
