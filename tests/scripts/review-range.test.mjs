import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "peer-review", "scripts", "review-range.mjs");

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

function write(repo, rel, text) {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

/** A temp repo on `main` with one commit. Returns { repo, cleanup }. */
function makeRepo({ branch = "main", commit = true } = {}) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "review-range-")));
  git(repo, "init", "-q", "-b", branch);
  if (commit) {
    write(repo, "base.txt", "base\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "base");
  }
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function run(args, cwd) {
  const r = spawnSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8", env: GIT_ENV });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withRepo(opts, fn) {
  const { repo, cleanup } = makeRepo(opts);
  try {
    return fn(repo);
  } finally {
    cleanup();
  }
}

test("committed only: shows the commit since the base", () => {
  withRepo({}, (repo) => {
    git(repo, "checkout", "-q", "-b", "feature");
    write(repo, "a.txt", "committed line\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "a");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+committed line/);
    assert.match(r.out, /committed since the base: 1/);
    assert.match(r.out, /merge base/);
  });
});

test("uncommitted only: unstaged edit to a tracked file is in the diff", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nunstaged edit\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+unstaged edit/);
    assert.match(r.out, /unstaged: 1/);
    assert.match(r.out, /committed since the base: 0/);
  });
});

test("uncommitted only: a staged change is in the diff", () => {
  withRepo({}, (repo) => {
    write(repo, "s.txt", "staged line\n");
    git(repo, "add", "s.txt");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+staged line/);
    assert.match(r.out, /staged: 1/);
  });
});

test("committed and uncommitted together appear in one diff, each group listed", () => {
  withRepo({}, (repo) => {
    git(repo, "checkout", "-q", "-b", "feature");
    write(repo, "c.txt", "from a commit\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "c");
    write(repo, "base.txt", "base\nfrom the working tree\n");
    write(repo, "new.txt", "brand new\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+from a commit/);
    assert.match(r.out, /\+from the working tree/);
    assert.match(r.out, /\+brand new/);
    assert.match(r.out, /committed since the base: 1/);
    assert.match(r.out, /unstaged: 1/);
    assert.match(r.out, /untracked: 1/);
  });
});

test("untracked file is included, and a gitignored file is not", () => {
  withRepo({}, (repo) => {
    write(repo, ".gitignore", "ignored.txt\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "ignore");
    write(repo, "fresh.txt", "untracked content\n");
    write(repo, "ignored.txt", "should not show\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /diff --git a\/fresh\.txt b\/fresh\.txt/);
    assert.match(r.out, /\+untracked content/);
    assert.doesNotMatch(r.out, /should not show/);
  });
});

test("nothing changed: exit 3 with a message on stderr", () => {
  withRepo({}, (repo) => {
    const r = run([], repo);
    assert.equal(r.code, 3);
    assert.equal(r.out, "");
    assert.match(r.err, /^review-range {2}nothing to review/);
    assert.match(r.err, /Fix:/);
  });
});

test("nothing changed with --json: exit 3 and ok is false", () => {
  withRepo({}, (repo) => {
    const r = run(["--json"], repo);
    assert.equal(r.code, 3);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.reason, "nothing-to-review");
  });
});

test("only a .artifacts/ file changed: still nothing to review", () => {
  withRepo({}, (repo) => {
    write(repo, ".artifacts/task/review.md", "notes\n");
    const r = run([], repo);
    assert.equal(r.code, 3);
  });
});

test("no base found: exit 2 and the message says how to pass one", () => {
  withRepo({ branch: "trunk" }, (repo) => {
    write(repo, "x.txt", "x\n");
    const r = run([], repo);
    assert.equal(r.code, 2);
    assert.match(r.err, /no base found/);
    assert.match(r.err, /--base/);
  });
});

test("--base lets a repo with no main or master work", () => {
  withRepo({ branch: "trunk" }, (repo) => {
    write(repo, "x.txt", "x line\n");
    const r = run(["--base", "trunk"], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+x line/);
  });
});

test("--base with a ref that does not exist: exit 2", () => {
  withRepo({}, (repo) => {
    const r = run(["--base", "nope"], repo);
    assert.equal(r.code, 2);
    assert.match(r.err, /does not resolve/);
  });
});

test("origin/main is preferred over main", () => {
  withRepo({}, (repo) => {
    const first = git(repo, "rev-parse", "HEAD");
    write(repo, "later.txt", "later\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "later");
    git(repo, "update-ref", "refs/remotes/origin/main", first);
    const r = run(["--json"], repo);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.base.ref, "origin/main");
    assert.deepEqual(j.committed, ["later.txt"]);
  });
});

test("falls back to master when there is no main", () => {
  withRepo({ branch: "master" }, (repo) => {
    write(repo, "m.txt", "m\n");
    const r = run(["--json"], repo);
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.parse(r.out).base.ref, "master");
  });
});

test("not a git repo: exit 2", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "review-range-plain-")));
  try {
    const r = run([], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /not a git repository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a repo with no commits: exit 2", () => {
  withRepo({ commit: false }, (repo) => {
    write(repo, "x.txt", "x\n");
    const r = run([], repo);
    assert.equal(r.code, 2);
    assert.match(r.err, /no commits/);
  });
});

test("repo path can be passed as an argument", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nvia argument\n");
    const r = run([repo], tmpdir());
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+via argument/);
  });
});

test("file names with spaces: listed, diffed and valid in JSON", () => {
  withRepo({}, (repo) => {
    write(repo, "my notes.txt", "tracked\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "spaced");
    write(repo, "my notes.txt", "tracked\nedited with space\n");
    write(repo, "new file with spaces.txt", "untracked spaced\n");
    const text = run([], repo);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /\+edited with space/);
    assert.match(text.out, /\+untracked spaced/);
    const j = JSON.parse(run(["--json"], repo).out);
    assert.ok(j.unstaged.includes("my notes.txt"));
    assert.deepEqual(j.untracked, ["new file with spaces.txt"]);
  });
});

test("a file name that looks like an option is handled as a path", () => {
  withRepo({}, (repo) => {
    write(repo, "--evil.txt", "dashed\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+dashed/);
  });
});

test("--stat prints the file list and no diff", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nline\n");
    const r = run(["--stat"], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /unstaged: 1/);
    assert.doesNotMatch(r.out, /^diff --git/m);
  });
});

test("--stat still exits 3 when nothing changed", () => {
  withRepo({}, (repo) => {
    assert.equal(run(["--stat"], repo).code, 3);
  });
});

test("--json has the lists, the base and the diff", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nline\n");
    write(repo, "u.txt", "u\n");
    const r = run(["--json"], repo);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.base.ref, "main");
    assert.deepEqual(j.unstaged, ["base.txt"]);
    assert.deepEqual(j.untracked, ["u.txt"]);
    assert.match(j.diff, /\+line/);
    assert.match(j.diff, /\+u/);
  });
});

test("usage errors exit 2", () => {
  for (const args of [["--nope"], ["a", "b"], ["--base"], ["--base", "--stat"]]) {
    const r = run(args, tmpdir());
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.err, /^review-range {2}/);
  }
});

test("a tracked file under .artifacts/ is left out of the lists and the diff", () => {
  withRepo({}, (repo) => {
    write(repo, ".artifacts/t/review.md", "old\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "artifacts");
    git(repo, "checkout", "-q", "-b", "feature");
    write(repo, ".artifacts/t/review.md", "old\nSECRET-REVIEW-NOTE\n");
    write(repo, "code.txt", "real change\n");
    git(repo, "add", "-A");
    const r = run(["--json"], repo);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.staged, ["code.txt"]);
    assert.doesNotMatch(j.diff, /SECRET-REVIEW-NOTE/);
    assert.match(j.diff, /\+real change/);
  });
});

test("an untracked file under .artifacts/ is left out next to a real change", () => {
  withRepo({}, (repo) => {
    write(repo, ".artifacts/t/review.md", "UNTRACKED-NOTE\n");
    write(repo, "code.txt", "real\n");
    const j = JSON.parse(run(["--json"], repo).out);
    assert.deepEqual(j.untracked, ["code.txt"]);
    assert.doesNotMatch(j.diff, /UNTRACKED-NOTE/);
  });
});

test("a file staged and then deleted again is nothing to review (exit 3)", () => {
  withRepo({}, (repo) => {
    write(repo, "gone.txt", "x\n");
    git(repo, "add", "gone.txt");
    rmSync(join(repo, "gone.txt"));
    const r = run([], repo);
    assert.equal(r.code, 3, r.out);
    assert.match(r.err, /nothing to review/);
  });
});

test("a commit that is undone by a later commit is nothing to review (exit 3)", () => {
  withRepo({}, (repo) => {
    git(repo, "checkout", "-q", "-b", "feature");
    write(repo, "t.txt", "t\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "add");
    git(repo, "rm", "-q", "t.txt");
    git(repo, "commit", "-q", "-m", "undo");
    assert.equal(run([], repo).code, 3);
  });
});

test("a file with a staged change and a further unstaged change shows both", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nstaged part\n");
    git(repo, "add", "base.txt");
    write(repo, "base.txt", "base\nstaged part\nunstaged part\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+staged part/);
    assert.match(r.out, /\+unstaged part/);
  });
});

test("a deleted tracked file appears in the diff", () => {
  withRepo({}, (repo) => {
    rmSync(join(repo, "base.txt"));
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /deleted file mode/);
    assert.match(r.out, /-base/);
  });
});

test("changes that landed on the base after the branch point stay out", () => {
  withRepo({}, (repo) => {
    git(repo, "checkout", "-q", "-b", "feature");
    write(repo, "mine.txt", "my work\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "mine");
    git(repo, "checkout", "-q", "main");
    write(repo, "theirs.txt", "landed later\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "theirs");
    git(repo, "checkout", "-q", "feature");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /\+my work/);
    assert.doesNotMatch(r.out, /landed later/);
  });
});

test("a symlinked path to the script still runs and prints (no silent exit 0)", () => {
  withRepo({}, (repo) => {
    write(repo, "base.txt", "base\nvia link\n");
    const linkDir = realpathSync(mkdtempSync(join(tmpdir(), "review-range-link-")));
    try {
      const link = join(linkDir, "rr.mjs");
      symlinkSync(SCRIPT, link);
      const r = spawnSync("node", [link], { cwd: repo, encoding: "utf8", env: GIT_ENV });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /\+via link/);
    } finally {
      rmSync(linkDir, { recursive: true, force: true });
    }
  });
});

test("a textconv driver in the repo config is never run", () => {
  withRepo({}, (repo) => {
    const marker = join(repo, "..", `textconv-ran-${process.pid}`);
    write(repo, ".gitattributes", "*.txt diff=evil\n");
    git(repo, "config", "diff.evil.textconv", `touch ${marker} && cat`);
    git(repo, "add", ".gitattributes");
    git(repo, "commit", "-q", "-m", "attrs");
    write(repo, "base.txt", "base\nchanged\n");
    write(repo, "new.txt", "new\n");
    const r = run([], repo);
    assert.equal(r.code, 0, r.err);
    assert.equal(existsSync(marker), false, "textconv command ran");
    rmSync(marker, { force: true });
  });
});

test("installed layout: runs as .claude/skills/peer-review/scripts/review-range.mjs from the project root", () => {
  withRepo({}, (repo) => {
    const dest = join(repo, ".claude", "skills", "peer-review");
    cpSync(join(dirname(SCRIPT), ".."), dest, { recursive: true });
    write(repo, "src.txt", "installed run\n");
    const r = spawnSync("node", [".claude/skills/peer-review/scripts/review-range.mjs", "--json"], { cwd: repo, encoding: "utf8", env: GIT_ENV });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(j.untracked.includes("src.txt"));
    assert.match(j.diff, /\+installed run/);
  });
});
