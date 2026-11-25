import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTicket, parseBlockedBy, parseBuilt, parseStatus, saysMerged, EXIT } from "../../skills/build/scripts/ticket-ready.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "build", "scripts", "ticket-ready.mjs");
const FIX = join(HERE, "fixtures", "ticket-ready");
const T = join(FIX, "feature", "tickets");

function run(args, { script = SCRIPT, cwd, bin = process.execPath } = {}) {
  const r = spawnSync(bin, [script, ...args], { encoding: "utf8", cwd });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Every message has the form "<what failed>. Fix: <what to do>." */
function assertMessageForm(text) {
  for (const line of text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("Usage:"))) {
    assert.match(line, /\. Fix: .+\.$/, `message does not follow "<what failed>. Fix: <what to do>.": ${line}`);
  }
}

test("exit 0: no blocker (Blocked by: none)", () => {
  const r = run([join(T, "14-none.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /no blocker/);
  assert.equal(r.err, "");
});

test("exit 0: one closed blocker", () => {
  const r = run([join(T, "10-ready-one.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /1 blocker\(s\) closed/);
});

test("exit 0: two closed blockers, a link entry and a code-quoted entry", () => {
  assert.equal(run([join(T, "11-ready-two.md")]).code, 0);
  assert.equal(run([join(T, "24-markdown-link.md")]).code, 0);
});

test("exit 0: Status value is read without regard to case", () => {
  assert.equal(run([join(T, "21-capital-status.md")]).code, 0);
});

test("exit 1: a blocker is open, and the message names it", () => {
  const r = run([join(T, "12-open-blocker.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Blocker 02-open\.md is still open/);
  assert.doesNotMatch(r.err, /01-closed\.md/);
  assertMessageForm(r.err);
});

test("exit 1: a blocker with no Status line is open", () => {
  const r = run([join(T, "20-no-status-blocker.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /no `Status:` line/);
  assertMessageForm(r.err);
});

test("exit 1: a Status line inside a code block does not count", () => {
  const r = run([join(T, "22-fenced-status.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /says `open`/);
});

test("exit 1: a blocker with two Status lines is open, also when one is in a comment or indented code", () => {
  for (const [ticket, lines] of [
    ["29-blocker-status-comment.md", "6, 8"],
    ["30-blocker-status-indented.md", "7, 9"],
    ["31-blocker-status-twice.md", "4, 5"],
  ]) {
    const r = run([join(T, ticket)]);
    assert.equal(r.code, 1, ticket);
    assert.match(r.err, new RegExp(`has 2 \`Status:\` lines \\(lines ${lines}\\)`), ticket);
    assertMessageForm(r.err);
  }
});

test("exit 1: a tilde fence that holds a backtick line hides only its own lines", () => {
  const r = run([join(T, "27-nested-fence.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Blocker 02-open\.md is still open/);
});

test("exit 0: a four-backtick fence that holds a three-backtick block hides its Blocked by line", () => {
  const r = run([join(T, "28-long-fence.md")]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /no blocker/);
});

test("exit 3: a blocker file is missing", () => {
  const r = run([join(T, "13-missing-blocker.md")]);
  assert.equal(r.code, 3);
  assert.match(r.err, /Blocker 99-gone\.md cannot be read/);
  assertMessageForm(r.err);
});

test("exit 3 wins over exit 1 when both problems exist, and both are printed", () => {
  const r = run([join(T, "23-both-problems.md")]);
  assert.equal(r.code, 3);
  assert.match(r.err, /99-gone\.md cannot be read/);
  assert.match(r.err, /02-open\.md is still open/);
});

test("exit 3: a blocker that is a folder cannot be read", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-"));
  try {
    mkdirSync(join(dir, "01-folder.md"));
    writeFileSync(join(dir, "02-a.md"), "# 02\n\nBlocked by: 01-folder.md\nStatus: open\n");
    const r = run([join(dir, "02-a.md")]);
    assert.equal(r.code, 3);
    assertMessageForm(r.err);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exit 4: the ticket file does not exist", () => {
  const r = run([join(T, "no-such-ticket.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /Cannot read the ticket/);
  assertMessageForm(r.err);
});

test("exit 4: the ticket path is a folder", () => {
  const r = run([T]);
  assert.equal(r.code, 4);
  assertMessageForm(r.err);
});

test("exit 4: an empty Blocked by line", () => {
  const r = run([join(T, "16-empty.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /is empty/);
  assertMessageForm(r.err);
});

test("exit 4: none mixed with a ticket name", () => {
  const r = run([join(T, "17-mixed.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /mixes/);
});

test("exit 4: two Blocked by lines", () => {
  const r = run([join(T, "25-two-lines.md")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /2 `Blocked by:` lines/);
});

test("exit 5: no Blocked by line, so no check ran", () => {
  const r = run([join(T, "15-no-line.md")]);
  assert.equal(r.code, 5);
  assert.match(r.err, /no blocker check ran/);
  assertMessageForm(r.err);
});

test("a Blocked by line inside a code block is ignored", () => {
  const r = run([join(T, "26-fenced-line.md")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /no blocker/);
});

test("exit 2: usage errors", () => {
  for (const args of [[], ["a.md", "b.md"], ["--bogus"], [""]]) {
    const r = run(args);
    assert.equal(r.code, 2, `args ${JSON.stringify(args)}`);
    assert.match(r.err, /Usage error/);
    assert.match(r.err, /Fix: /);
  }
});

test("--help exits 0 and prints the usage", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Usage: node \.claude\/skills\/build\/scripts\/ticket-ready\.mjs <ticket file>/);
});

test("a blocker in another folder: closed gives 0, open gives 1", () => {
  assert.equal(run([join(T, "18-other-folder.md")]).code, 0);
  const r = run([join(T, "19-other-folder-open.md")]);
  assert.equal(r.code, 1);
  assert.match(r.err, /02-pending\.md is still open/);
});

test("a relative ticket path works from another working folder", () => {
  const r = run(["feature/tickets/10-ready-one.md"], { cwd: FIX });
  assert.equal(r.code, 0);
  const open = run(["feature/tickets/12-open-blocker.md"], { cwd: FIX });
  assert.equal(open.code, 1);
});

test("the script runs through a symlinked path", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-link-"));
  try {
    const link = join(dir, "link-to-ticket-ready.mjs");
    symlinkSync(SCRIPT, link);
    // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
    // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
    const ok = run([join(T, "10-ready-one.md")], { script: link, bin: "node" });
    assert.equal(ok.code, 0);
    assert.match(ok.out, /Ready\./);
    const open = run([join(T, "12-open-blocker.md")], { script: link, bin: "node" });
    assert.equal(open.code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a copy of the fixtures in a new folder works the same (no path is built in)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-ready-copy-"));
  try {
    cpSync(FIX, dir, { recursive: true });
    assert.equal(run([join(dir, "feature", "tickets", "18-other-folder.md")]).code, 0);
    // Make the blocker in the other folder open, and the same ticket must now stop.
    writeFileSync(join(dir, "other", "tickets", "01-done.md"), "# 01\n\nBlocked by: none\nStatus: open\n");
    assert.equal(run([join(dir, "feature", "tickets", "18-other-folder.md")]).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a long run of spaces inside a Blocked by or Status line parses in one pass", () => {
  const gap = " ".repeat(160_000);
  assert.deepEqual(parseBlockedBy(`Blocked by: 01-a.md,${gap}02-b.md\n`).blockers, ["01-a.md", "02-b.md"]);
  assert.equal(parseStatus(`Status: not${gap}closed\n`), `not${gap}closed`);
  assert.equal(parseStatus(`Status:${gap}\n`), "");
});

test("exports: the parsers and the exit table", () => {
  assert.deepEqual(EXIT, { READY: 0, OPEN: 1, USAGE: 2, BLOCKER_UNREADABLE: 3, TICKET_UNREADABLE: 4, NO_LINE: 5 });
  assert.equal(parseBlockedBy("Blocked by: none (can start now)\n").kind, "none");
  assert.equal(parseBlockedBy("Blocked by: None (can start immediately)\n").kind, "none");
  assert.equal(parseBlockedBy("Blocked by: none\n").kind, "none");
  assert.deepEqual(parseBlockedBy("**Blocked by:** `01-a.md`, [b](02-b.md)\n").blockers, ["01-a.md", "02-b.md"]);
  assert.equal(parseBlockedBy("# t\n").kind, "missing");
  assert.equal(parseStatus("Status:   closed  \n"), "closed");
  assert.equal(parseStatus("```\nStatus: closed\n```\n"), null);
  assert.equal(parseStatus("Status: closed\nStatus: open\n"), null);
  assert.equal(checkTicket(join(T, "14-none.md")).code, 0);
});

// ---- a closed blocker counts only when its built commit is in origin/main (e2e run 1 break 3, run 2 break 17) ----

function git(cwd, ...args) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  const r = spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", env });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repo with a bare origin, `main` pushed, a built branch `agent/one-1a` that is not merged, and two local tickets. */
function withBuiltBlocker(fn, { closeLine } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ticket-ready-git-"));
  try {
    const origin = join(root, "origin.git");
    const repo = join(root, "repo");
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    spawnSync("git", ["init", "-q", "-b", "main", repo]);
    writeFileSync(join(repo, "a.txt"), "a\n");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-q", "-m", "base");
    git(repo, "remote", "add", "origin", origin);
    git(repo, "push", "-q", "origin", "main");
    git(repo, "switch", "-q", "-c", "agent/one-1a");
    writeFileSync(join(repo, "b.txt"), "b\n");
    git(repo, "add", "b.txt");
    git(repo, "commit", "-q", "-m", "ticket one");
    const sha = git(repo, "rev-parse", "--short", "HEAD");
    git(repo, "switch", "-q", "main");
    const tickets = join(repo, ".scratch", "f", "tickets");
    mkdirSync(tickets, { recursive: true });
    const line = (closeLine ?? "Built on branch agent/one-1a, last commit <sha>. Merge the branch before you build a ticket that this one blocks.").replace("<sha>", sha);
    writeFileSync(join(tickets, "01-one.md"), `# 01: One\n\nBlocked by: none\nStatus: closed\nSpec: ../spec.md\n\n## Comments\n\n${line}\n`);
    writeFileSync(join(tickets, "02-two.md"), "# 02: Two\n\nBlocked by: 01-one.md\nStatus: open\nSpec: ../spec.md\n");
    return fn({ repo, tickets, sha, ticket: join(tickets, "02-two.md") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("exit 1: a closed blocker whose built commit is not in origin/main is not done, and the message says why", () => {
  withBuiltBlocker(({ ticket, sha }) => {
    const r = run([ticket]);
    assert.equal(r.code, 1);
    assert.match(r.err, new RegExp(`Blocker 01-one\\.md is built on branch agent/one-1a at commit ${sha}, but that commit is not in \`origin/main\``));
    assert.match(r.err, /Fix: merge agent\/one-1a into main, run `git fetch origin`/);
    assertMessageForm(r.err);
  });
});

test("exit 0: the same blocker after its branch is merged into main and fetched", () => {
  withBuiltBlocker(({ repo, ticket }) => {
    git(repo, "merge", "-q", "--no-ff", "-m", "merge one", "agent/one-1a");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "fetch", "-q", "origin");
    const r = run([ticket]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /1 blocker\(s\) closed/);
  });
});

test("exit 1: a merge into local main that is not pushed does not count", () => {
  withBuiltBlocker(({ repo, ticket }) => {
    git(repo, "merge", "-q", "--no-ff", "-m", "merge one", "agent/one-1a");
    assert.equal(run([ticket]).code, 1);
  });
});

test("exit 0: after a squash merge, a line that starts with Merged marks the blocker done", () => {
  withBuiltBlocker(({ tickets, ticket }) => {
    const p = join(tickets, "01-one.md");
    writeFileSync(p, readFileSync(p, "utf8") + "Merged in 0123abc by squash.\n");
    assert.equal(run([ticket]).code, 0);
  });
});

test("exit 1: the built commit is unknown to git, and the message says that git cannot tell", () => {
  withBuiltBlocker(({ ticket }) => {
    const r = run([ticket]);
    assert.equal(r.code, 1);
    assert.match(r.err, /git cannot tell if that commit is in `origin\/main`/);
    assertMessageForm(r.err);
  }, { closeLine: "Built on branch agent/gone-9z, last commit 0000000. Merge the branch first." });
});

test("parseBuilt reads the close line of build step 9, the newer form without `last`, and takes the last line", () => {
  assert.deepEqual(parseBuilt("## Comments\n\nBuilt on branch agent/a-1b, last commit 7f991bc. Merge the branch first.\n"), { branch: "agent/a-1b", commit: "7f991bc" });
  assert.deepEqual(parseBuilt("Built on branch agent/a-1b, commit `abc1234`.\nBuilt on branch agent/a-2c, last commit def5678.\n"), { branch: "agent/a-2c", commit: "def5678" });
  assert.equal(parseBuilt("Status: closed\n"), null);
  assert.equal(parseBuilt("```\nBuilt on branch agent/a-1b, last commit 7f991bc.\n```\n"), null);
  assert.equal(saysMerged("## Comments\nMerged in 1234567.\n"), true);
  assert.equal(saysMerged("## Comments\nNot merged yet.\n"), false);
});
