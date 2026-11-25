import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchesKey, taskKey, parseWorktrees, EXIT } from "../../skills/build/scripts/ticket-in-work.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "build", "scripts", "ticket-in-work.mjs");
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
};

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function sh(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/** A fresh repo on `main` with one commit. Returns its real path. */
function repo() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ticket-in-work-")));
  dirs.push(base);
  const root = join(base, "repo");
  mkdirSync(root);
  sh(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, "README.md"), "# demo\n");
  sh(root, "add", "-A");
  sh(root, "commit", "-q", "-m", "init");
  return root;
}

function run(args, cwd, { script = SCRIPT, bin = process.execPath } = {}) {
  const r = spawnSync(bin, [script, ...args], { encoding: "utf8", cwd, env: GIT_ENV });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Every message has the form "<what failed>. <why>. Fix: <step>." */
function assertMessageForm(text) {
  for (const line of text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("Usage:"))) {
    assert.match(line, /\. Fix: .+\.$/, `message does not follow "<what failed>. Fix: <step>.": ${line}`);
  }
}

test("taskKey: a ticket file gives the title part of its name", () => {
  assert.equal(taskKey(".scratch/slugs/tickets/01-slugify.md"), "slugify");
  assert.equal(taskKey("/abs/path/12-user-auth.md"), "user-auth");
  assert.equal(taskKey("issue-42"), "issue-42");
  assert.equal(taskKey("Bad Key"), null);
  assert.equal(taskKey(""), null);
});

test("matchesKey: the key, or the key plus suffix parts that each have a digit, in any case", () => {
  assert.equal(matchesKey("agent/slugify-0a1", "slugify"), true);
  assert.equal(matchesKey("slugify", "slugify"), true);
  assert.equal(matchesKey("agent/slugify-docs", "slugify"), false);
  assert.equal(matchesKey("agent/slugify-urls-0a1", "slugify"), false);
  assert.equal(matchesKey("agent/slug-urls-0a1", "slug"), false);
  assert.equal(matchesKey("agent/issue-42-0816a", "issue-4"), false);
  assert.equal(matchesKey("agent/issue-42-0816a", "issue-42"), true);
  assert.equal(matchesKey("agent/slugify-0A1", "slugify"), true);
  assert.equal(matchesKey("agent/slugify-2026-11-25", "slugify"), true);
  assert.equal(matchesKey("agent/slugify-2026-docs", "slugify"), false);
  assert.equal(matchesKey("agent/slugify-", "slugify"), false);
});

test("parseWorktrees: reads paths and branches, skips a bare entry", () => {
  const w = parseWorktrees("worktree /a\nHEAD 1\nbranch refs/heads/main\n\nworktree /b\nHEAD 2\ndetached\n\nworktree /c\nbare\n");
  assert.deepEqual(w.map((x) => [x.path, x.branch]), [["/a", "main"], ["/b", null]]);
});

test("exit 0: no other worktree or branch for the ticket", () => {
  const root = repo();
  sh(root, "branch", "agent/other-1a2");
  const r = run(["01-slugify.md"], root);
  assert.equal(r.code, EXIT.FREE);
  assert.match(r.out, /No other work on ticket slugify/);
  assert.equal(r.err, "");
});

test("exit 1: another worktree has a branch for the ticket", () => {
  const root = repo();
  const wt = join(dirname(root), "wt", "slugify-0a1");
  sh(root, "worktree", "add", "-q", "-b", "agent/slugify-0a1", wt, "main");
  const r = run([".scratch/slugs/tickets/01-slugify.md"], root);
  assert.equal(r.code, EXIT.IN_WORK);
  assert.match(r.err, /Ticket slugify is already in work\. Worktree .*slugify-0a1 has branch agent\/slugify-0a1/);
  assert.equal(r.err.trim().split("\n").length, 1, "the branch of a reported worktree is not reported twice");
  assertMessageForm(r.err);
});

test("exit 1: a local branch for the ticket exists with no worktree", () => {
  const root = repo();
  sh(root, "branch", "agent/slugify-7c2");
  const r = run(["slugify"], root);
  assert.equal(r.code, EXIT.IN_WORK);
  assert.match(r.err, /Local branch agent\/slugify-7c2 exists/);
  assertMessageForm(r.err);
});

test("exit 1: a remote branch for the ticket exists, as when another machine pushed it", () => {
  const root = repo();
  const sha = sh(root, "rev-parse", "HEAD").trim();
  sh(root, "update-ref", "refs/remotes/origin/agent/slugify-9d4", sha);
  sh(root, "update-ref", "refs/remotes/origin/main", sha);
  const r = run(["01-slugify.md"], root);
  assert.equal(r.code, EXIT.IN_WORK);
  assert.match(r.err, /Branch agent\/slugify-9d4 exists on the remote origin/);
  assert.doesNotMatch(r.err, /origin\/main/);
  assertMessageForm(r.err);
});

test("exit 0: the current worktree is on the ticket branch, and its remote copy is not other work", () => {
  const root = repo();
  const wt = join(dirname(root), "wt", "slugify-0a1");
  sh(root, "worktree", "add", "-q", "-b", "agent/slugify-0a1", wt, "main");
  const sha = sh(root, "rev-parse", "HEAD").trim();
  sh(root, "update-ref", "refs/remotes/origin/agent/slugify-0a1", sha);
  const r = run(["01-slugify.md"], wt);
  assert.equal(r.code, EXIT.FREE, r.err);
  assert.match(r.out, /This checkout is on agent\/slugify-0a1, which matches the ticket/);
});

test("exit 1 from the main checkout when the ticket worktree belongs to another session", () => {
  const root = repo();
  const wt = join(dirname(root), "wt", "slugify-0a1");
  sh(root, "worktree", "add", "-q", "-b", "agent/slugify-0a1", wt, "main");
  const other = join(dirname(root), "wt", "slugify-b3c");
  sh(root, "worktree", "add", "-q", "-b", "agent/slugify-b3c", other, "main");
  const r = run(["slugify"], wt);
  assert.equal(r.code, EXIT.IN_WORK);
  assert.match(r.err, /agent\/slugify-b3c/);
  assert.doesNotMatch(r.err, /agent\/slugify-0a1/);
});

test("exit 2: no argument, two arguments or a bad key", () => {
  const root = repo();
  for (const args of [[], ["a", "b"], ["Bad Key"], ["--key"]]) {
    const r = run(args, root);
    assert.equal(r.code, EXIT.USAGE, `args ${JSON.stringify(args)}`);
    assert.match(r.err, /Usage error/);
  }
});

test("exit 3: the folder is not in a git repo", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ticket-in-work-nogit-")));
  dirs.push(base);
  const r = run(["slugify"], base);
  assert.equal(r.code, EXIT.GIT);
  assertMessageForm(r.err);
});

test("exit 1 on a second machine: a branch that the first machine pushed right after its worktree", () => {
  // This is the flow of `build` step 2: make the worktree, push the branch at once.
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ticket-in-work-push-")));
  dirs.push(base);
  const origin = join(base, "origin.git");
  sh(base, "init", "-q", "--bare", "-b", "main", origin);
  const a = join(base, "a");
  const b = join(base, "b");
  sh(base, "init", "-q", "-b", "main", a);
  writeFileSync(join(a, "README.md"), "# demo\n");
  sh(a, "add", "-A");
  sh(a, "commit", "-q", "-m", "init");
  sh(a, "remote", "add", "origin", origin);
  sh(a, "push", "-q", "origin", "main");
  sh(base, "clone", "-q", origin, b);
  sh(a, "fetch", "-q", "origin");
  sh(a, "worktree", "add", "-q", "--no-track", "-b", "agent/slugify-0a1", join(base, "a-wt", "slugify-0a1"), "origin/main");
  assert.equal(run(["slugify"], b).code, EXIT.FREE, "machine b sees nothing before the push");
  sh(join(base, "a-wt", "slugify-0a1"), "push", "-q", "-u", "origin", "agent/slugify-0a1");
  assert.equal(run(["slugify"], b).code, EXIT.FREE, "machine b sees nothing before its own fetch");
  sh(b, "fetch", "-q", "origin");
  const r = run(["slugify"], b);
  assert.equal(r.code, EXIT.IN_WORK, r.err);
  assert.match(r.err, /agent\/slugify-0a1/);
});

test("the script runs through a symlinked path", () => {
  const root = repo();
  const sha = sh(root, "rev-parse", "HEAD").trim();
  sh(root, "update-ref", "refs/remotes/origin/agent/slugify-9d4", sha);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ticket-in-work-link-")));
  dirs.push(dir);
  const link = join(dir, "link-to-ticket-in-work.mjs");
  symlinkSync(SCRIPT, link);
  // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
  // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
  const r = run(["slugify"], root, { script: link, bin: "node" });
  assert.equal(r.code, EXIT.IN_WORK, `exit ${r.code}, stderr: ${r.err}`);
  assert.match(r.err, /agent\/slugify-9d4/);
});
