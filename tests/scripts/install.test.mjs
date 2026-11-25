import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { install, InstallRefusal } from "../../scripts/install.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "install.mjs");

function write(root, rel, content, mode) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  if (mode) chmodSync(p, mode);
}

function makeSource() {
  const s = mkdtempSync(join(tmpdir(), "install-src-"));
  write(s, "skills/grill/SKILL.md", "grill\n");
  write(s, "skills/grill/REFERENCE.md", "ref\n");
  write(s, "hooks/guard.mjs", "// guard\n");
  write(s, "templates/AGENTS.md", "agents\n");
  write(s, "templates/CLAUDE.md", "claude\n");
  write(s, "templates/GLOSSARY.md", "glossary\n");
  write(s, "templates/adr/0000-template.md", "adr\n");
  write(s, "templates/claude-settings.json", '{ "hooks": {} }\n');
  write(s, "templates/githooks/prepare-commit-msg", "#!/bin/sh\n", 0o755);
  write(s, "tests/should-not-copy.test.mjs", "x\n");
  return s;
}

function makeTarget({ git = true } = {}) {
  const t = mkdtempSync(join(tmpdir(), "install-tgt-"));
  if (git) mkdirSync(join(t, ".git"));
  return t;
}

function listAll(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? listAll(p, base) : [p.slice(base.length + 1)];
  });
}

function withDirs(fn, opts) {
  const source = makeSource();
  const target = makeTarget(opts);
  try {
    return fn(source, target);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}

const quiet = () => {};

test("install copies everything to the documented places", () => {
  withDirs((source, target) => {
    const out = [];
    install({ source, target, log: (l) => out.push(l) });
    assert.deepEqual(listAll(target).filter((f) => !f.startsWith(".git/")).sort(), [
      ".claude/hooks/guard.mjs",
      ".claude/settings.json",
      ".claude/skills/grill/REFERENCE.md",
      ".claude/skills/grill/SKILL.md",
      ".githooks/prepare-commit-msg",
      "AGENTS.md",
      "CLAUDE.md",
      "GLOSSARY.md",
      "docs/adr/0000-template.md",
    ]);
    assert.equal(readFileSync(join(target, "AGENTS.md"), "utf8"), "agents\n");
    assert.ok(statSync(join(target, ".githooks/prepare-commit-msg")).mode & 0o100, "git hook keeps its executable bit");
    assert.ok(out.some((l) => l.includes("git config core.hooksPath .githooks")));
  });
});

test("--dry-run prints the plan and writes nothing", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, dryRun: true, log: (l) => out.push(l) });
    assert.deepEqual(listAll(target), []);
    assert.equal(r.counts.copy, 9);
    assert.ok(out.some((l) => /would copy {2}\.claude\/skills\/grill\/SKILL\.md/.test(l)));
    assert.ok(out.some((l) => /Dry run, nothing written/.test(l)));
    assert.ok(out.some((l) => l.includes("core.hooksPath")));
  });
});

test("existing files are never overwritten and are reported as skipped", () => {
  withDirs((source, target) => {
    write(target, "AGENTS.md", "mine\n");
    write(target, ".claude/skills/grill/SKILL.md", "my skill\n");
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(readFileSync(join(target, "AGENTS.md"), "utf8"), "mine\n");
    assert.equal(readFileSync(join(target, ".claude/skills/grill/SKILL.md"), "utf8"), "my skill\n");
    assert.equal(r.counts.skip, 2);
    assert.ok(out.some((l) => /^skip {4}AGENTS\.md/.test(l)));
    // the rest still installed
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "claude\n");
  });
});

test("a second run skips every file", () => {
  withDirs((source, target) => {
    install({ source, target, log: quiet });
    const r = install({ source, target, log: quiet });
    assert.equal(r.counts.copy, 0);
    assert.equal(r.counts.skip, 8);
    assert.equal(r.counts.manual, 1, "settings.json now exists, so it is a manual step");
  });
});

test("existing .claude/settings.json is not merged: the entries to add are printed", () => {
  withDirs((source, target) => {
    write(target, ".claude/settings.json", '{ "model": "x" }\n');
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(readFileSync(join(target, ".claude/settings.json"), "utf8"), '{ "model": "x" }\n');
    assert.equal(r.counts.manual, 1);
    const text = out.join("\n");
    assert.match(text, /already exists, so it was not changed/);
    assert.match(text, /"hooks": \{\}/);
  });
});

test("refuses a target that is not a git repo", () => {
  withDirs(
    (source, target) => {
      assert.throws(() => install({ source, target, log: quiet }), (e) => e instanceof InstallRefusal && /not a git repo/.test(e.message));
      assert.deepEqual(listAll(target), []);
    },
    { git: false },
  );
});

test("refuses to install into this repo itself, also through a symlink", () => {
  const source = makeSource();
  mkdirSync(join(source, ".git"));
  const holder = mkdtempSync(join(tmpdir(), "install-link-"));
  try {
    assert.throws(() => install({ source, target: source, log: quiet }), (e) => e instanceof InstallRefusal && /this repo itself/.test(e.message));
    const link = join(holder, "alias");
    symlinkSync(source, link);
    assert.throws(() => install({ source, target: link, log: quiet }), InstallRefusal);
    assert.equal(existsSync(join(source, ".claude")), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(holder, { recursive: true, force: true });
  }
});

test("a missing source piece is reported as a note and does not stop the install", () => {
  withDirs((source, target) => {
    rmSync(join(source, "hooks"), { recursive: true });
    const r = install({ source, target, log: quiet });
    assert.ok(r.notes.some((n) => /hooks\/ is missing/.test(n)));
    assert.equal(existsSync(join(target, ".claude/skills/grill/SKILL.md")), true);
  });
});

test("cli exit codes: 0 done, 1 refused, 2 usage", () => {
  withDirs((source, target) => {
    const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    assert.equal(run(["--source", source, "--dry-run", target]).status, 0);
    assert.deepEqual(listAll(target), []);
    assert.equal(run(["--source", source, target]).status, 0);
    assert.equal(run(["--source", source, source]).status, 1);
    assert.equal(run([]).status, 2);
    assert.equal(run(["--bogus", target]).status, 2);
    assert.equal(run(["--source", source, join(target, "nope")]).status, 2);
    const plain = mkdtempSync(join(tmpdir(), "install-plain-"));
    try {
      const r = run(["--source", source, plain]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /not a git repo/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

test("a dangling symlink at a destination is skipped, and nothing is written through it", () => {
  withDirs((source, target) => {
    const outside = mkdtempSync(join(tmpdir(), "install-out-"));
    try {
      symlinkSync(join(outside, "victim.md"), join(target, "AGENTS.md"));
      const r = install({ source, target, log: quiet });
      assert.equal(existsSync(join(outside, "victim.md")), false, "nothing created outside the target");
      assert.ok(r.items.some((i) => i.kind === "skip" && i.dest.endsWith("AGENTS.md")));
      assert.ok(existsSync(join(target, "CLAUDE.md")), "the rest still installs");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("a symlinked folder that leads outside the target is refused before anything is written", () => {
  withDirs((source, target) => {
    const outside = mkdtempSync(join(tmpdir(), "install-out-"));
    try {
      symlinkSync(outside, join(target, ".claude"));
      assert.throws(() => install({ source, target, log: quiet }), (e) => e instanceof InstallRefusal && /outside the target/.test(e.message));
      assert.deepEqual(readdirSync(outside), [], "nothing written outside");
      assert.equal(existsSync(join(target, "AGENTS.md")), false, "nothing written inside either");
      assert.throws(() => install({ source, target, dryRun: true, log: quiet }), InstallRefusal, "a dry run refuses too");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("a symlinked folder that stays inside the target is allowed", () => {
  withDirs((source, target) => {
    mkdirSync(join(target, "shared"));
    symlinkSync(join(target, "shared"), join(target, ".claude"));
    install({ source, target, log: quiet });
    assert.ok(existsSync(join(target, "shared", "settings.json")));
  });
});

test("a file where a folder must go is refused before anything is written", () => {
  withDirs((source, target) => {
    write(target, "docs", "i am a file\n");
    assert.throws(() => install({ source, target, log: quiet }), (e) => e instanceof InstallRefusal && /is a file/.test(e.message));
    assert.equal(existsSync(join(target, "AGENTS.md")), false);
    assert.equal(existsSync(join(target, ".claude")), false);
  });
});
