import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureGitignore, GITIGNORE_HEADER, GITIGNORE_RULES, install, InstallRefusal, isOlderVersion, lookupClaudeVersion } from "../../scripts/install.mjs";

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

function gitInit(dir) {
  const r = spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function gitOut(dir, ...args) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env });
  return { status: r.status, out: r.stdout.trim() };
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

function present(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

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
      ".gitignore",
      ".stack/check",
      "AGENTS.md",
      "CLAUDE.md",
      "GLOSSARY.md",
      "docs/adr/0000-template.md",
      "docs/agents/enforcement.md",
    ]);
    assert.equal(readFileSync(join(target, "AGENTS.md"), "utf8"), "agents\n");
    assert.ok(lstatSync(join(target, "CLAUDE.md")).isSymbolicLink(), "CLAUDE.md is a symlink");
    assert.ok(statSync(join(target, ".githooks/prepare-commit-msg")).mode & 0o100, "git hook keeps its executable bit");
    assert.ok(out.some((l) => l.includes("git config core.hooksPath .githooks")));
  });
});

test("--dry-run prints the plan and writes nothing", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, dryRun: true, log: (l) => out.push(l) });
    assert.deepEqual(listAll(target), []);
    assert.equal(r.counts.copy + r.counts.generate + r.counts.link, 11);
    assert.ok(out.some((l) => /would copy {2}\.claude\/skills\/grill\/SKILL\.md/.test(l)));
    assert.ok(out.some((l) => l === "would link  CLAUDE.md -> AGENTS.md"));
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
    // the rest still installs, and CLAUDE.md links to the user's own AGENTS.md
    assert.equal(readlinkSync(join(target, "CLAUDE.md")), "AGENTS.md");
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "mine\n");
  });
});

test("a second run skips every file", () => {
  withDirs((source, target) => {
    install({ source, target, log: quiet });
    const r = install({ source, target, log: quiet });
    assert.equal(r.counts.copy + r.counts.generate + r.counts.link, 0);
    assert.equal(r.counts.skip, 10);
    assert.equal(readlinkSync(join(target, "CLAUDE.md")), "AGENTS.md", "the link is kept");
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
      assert.ok(existsSync(join(target, "GLOSSARY.md")), "the rest still installs");
      assert.equal(present(join(target, "CLAUDE.md")), false, "no CLAUDE.md link that leads outside through AGENTS.md");
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

test("cli: run through a symlink still prints the dry-run plan", () => {
  withDirs((source, target) => {
    const links = mkdtempSync(join(tmpdir(), "install-link-"));
    try {
      const link = join(links, "install.mjs");
      symlinkSync(SCRIPT, link);
      // Spawn `node`, not process.execPath. Under `bun test` that is Bun, and Bun resolves a symlink in
      // argv[1] by itself, so a script that lost its realpathSync call would still pass here.
      const r = spawnSync("node", [link, "--source", source, "--dry-run", target], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /would copy {2}\.claude\/skills\/grill\/SKILL\.md/);
      assert.match(r.stdout, /Dry run, nothing written/);
      assert.deepEqual(listAll(target), []);
    } finally {
      rmSync(links, { recursive: true, force: true });
    }
  });
});

// ---- core.hooksPath, .stack/check, docs/agents/enforcement.md ----

function withGitTarget(fn) {
  const source = makeSource();
  const target = mkdtempSync(join(tmpdir(), "install-git-"));
  try {
    gitInit(target);
    return fn(source, target);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}

test("hooksPath: a real git repo with no value gets core.hooksPath set to .githooks", () => {
  withGitTarget((source, target) => {
    const r = install({ source, target, log: quiet });
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").out, ".githooks");
    assert.equal(r.hooksPath, "set");
  });
});

test("hooksPath: --dry-run prints the action and changes nothing", () => {
  withGitTarget((source, target) => {
    const out = [];
    const r = install({ source, target, dryRun: true, log: (l) => out.push(l) });
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").status, 1, "still unset");
    assert.equal(r.hooksPath, "would-set");
    assert.ok(out.some((l) => /would run {2}git config core\.hooksPath \.githooks/.test(l)));
    assert.equal(existsSync(join(target, ".stack")), false);
    assert.equal(existsSync(join(target, "docs")), false);
  });
});

test("hooksPath: a value that is already set is kept, and the manual command is printed", () => {
  withGitTarget((source, target) => {
    gitOut(target, "config", "core.hooksPath", "other-hooks");
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").out, "other-hooks");
    assert.equal(r.hooksPath, "other");
    const text = out.join("\n");
    assert.match(text, /already set to "other-hooks"/);
    assert.match(text, /git config core\.hooksPath \.githooks/);
  });
});

test("hooksPath: an empty value that is set counts as set and is kept", () => {
  withGitTarget((source, target) => {
    gitOut(target, "config", "core.hooksPath", "");
    const r = install({ source, target, log: quiet });
    assert.equal(r.hooksPath, "other");
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").out, "");
  });
});

test("hooksPath: a value that is already .githooks is reported and left alone", () => {
  withGitTarget((source, target) => {
    gitOut(target, "config", "core.hooksPath", ".githooks");
    assert.equal(install({ source, target, log: quiet }).hooksPath, "already");
  });
});

test("hooksPath: a target with a .git folder that git does not accept is not configured, and the manual command is printed", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(r.hooksPath, "no-git");
    assert.ok(out.join("\n").includes("git config core.hooksPath .githooks"));
    assert.equal(existsSync(join(target, ".git", "config")), false, "the fake .git folder gets no config");
  });
});

test("hooksPath: a fake .git folder inside a real repo never changes the outer repo", () => {
  const source = makeSource();
  const outer = mkdtempSync(join(tmpdir(), "install-outer-"));
  try {
    gitInit(outer);
    const target = join(outer, "inner");
    mkdirSync(join(target, ".git"), { recursive: true });
    const r = install({ source, target, log: quiet });
    assert.equal(r.hooksPath, "no-git");
    assert.equal(gitOut(outer, "config", "--get", "core.hooksPath").status, 1, "outer repo is unchanged");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(outer, { recursive: true, force: true });
  }
});

test("hooksPath: works through a symlinked target path", () => {
  withGitTarget((source, target) => {
    const links = mkdtempSync(join(tmpdir(), "install-link-"));
    try {
      const link = join(links, "alias");
      symlinkSync(target, link);
      const r = install({ source, target: link, log: quiet });
      assert.equal(r.hooksPath, "set");
      assert.equal(gitOut(target, "config", "--get", "core.hooksPath").out, ".githooks");
      assert.ok(existsSync(join(target, ".stack", "check")));
      assert.equal(readlinkSync(join(target, "CLAUDE.md")), "AGENTS.md");
    } finally {
      rmSync(links, { recursive: true, force: true });
    }
  });
});

test("hooksPath: a hook in .git/hooks keeps core.hooksPath unset, and the output names the hook", () => {
  withGitTarget((source, target) => {
    write(target, ".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n", 0o755);
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(r.hooksPath, "kept");
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").status, 1, "still unset");
    const text = out.join("\n");
    assert.match(text, /\.git\/hooks has hooks of the project: pre-commit\./);
    assert.match(text, /--replace-git-hooks/);
    assert.doesNotMatch(text, /\.sample/);
  });
});

test("hooksPath: --replace-git-hooks sets core.hooksPath and names the hooks that stop running", () => {
  withGitTarget((source, target) => {
    write(target, ".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n", 0o755);
    write(target, ".git/hooks/pre-push", "#!/bin/sh\nexit 0\n", 0o755);
    const r = spawnSync(process.execPath, [SCRIPT, "--source", source, "--replace-git-hooks", target], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(gitOut(target, "config", "--get", "core.hooksPath").out, ".githooks");
    assert.match(r.stdout, /These hooks in \.git\/hooks stop running now: pre-commit, pre-push\./);
  });
});

test(".stack/check: a starter is created, executable, marked as a placeholder, and exits 0 with a warning", () => {
  withGitTarget((source, target) => {
    install({ source, target, log: quiet });
    const file = join(target, ".stack", "check");
    assert.ok(statSync(file).mode & 0o100, "executable");
    assert.match(readFileSync(file, "utf8"), /PLACEHOLDER/);
    const r = spawnSync(file, [], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /placeholder/);
  });
});

test(".stack/check: the starter lets a commit through with a warning when the git hook runs it", () => {
  withGitTarget((source, target) => {
    // use the real hook from this repo, not the test stub
    const hook = readFileSync(join(dirname(SCRIPT), "..", "templates", "githooks", "prepare-commit-msg"));
    write(source, "templates/githooks/prepare-commit-msg", hook, 0o755);
    install({ source, target, log: quiet });
    gitOut(target, "config", "user.email", "t@example.com");
    gitOut(target, "config", "user.name", "t");
    writeFileSync(join(target, "f.txt"), "x\n");
    gitOut(target, "add", "f.txt");
    const r = spawnSync("git", ["-C", target, "commit", "-q", "-m", "first"], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /\.stack\/check is a placeholder/);
  });
});

test(".stack/check: an existing file is never overwritten", () => {
  withGitTarget((source, target) => {
    write(target, ".stack/check", "#!/bin/sh\nexit 1\n", 0o755);
    const r = install({ source, target, log: quiet });
    assert.equal(readFileSync(join(target, ".stack", "check"), "utf8"), "#!/bin/sh\nexit 1\n");
    assert.ok(r.items.some((i) => i.kind === "skip" && i.dest.endsWith(".stack/check")));
  });
});

test("docs/agents/enforcement.md: created with the retro format, and never overwritten", () => {
  withGitTarget((source, target) => {
    install({ source, target, log: quiet });
    const text = readFileSync(join(target, "docs", "agents", "enforcement.md"), "utf8");
    assert.match(text, /^# Enforcement/);
    assert.match(text, /\| Rule \| Written in \| Held by \| Changed \|/);
    writeFileSync(join(target, "docs", "agents", "enforcement.md"), "mine\n");
    install({ source, target, log: quiet });
    assert.equal(readFileSync(join(target, "docs", "agents", "enforcement.md"), "utf8"), "mine\n");
  });
});

for (const rel of [".stack/check", "docs/agents/enforcement.md"]) {
  test(`a dangling symlink at ${rel} is skipped and nothing is written through it`, () => {
    withGitTarget((source, target) => {
      const outside = mkdtempSync(join(tmpdir(), "install-out-"));
      try {
        mkdirSync(dirname(join(target, rel)), { recursive: true });
        symlinkSync(join(outside, "victim"), join(target, rel));
        const r = install({ source, target, log: quiet });
        assert.equal(existsSync(join(outside, "victim")), false, "nothing created outside the target");
        assert.ok(r.items.some((i) => i.kind === "skip" && i.dest.endsWith(rel)));
        assert.ok(existsSync(join(target, "CLAUDE.md")), "the rest still installs");
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test(`a symlinked folder above ${rel} that leads outside the target is refused before anything is written`, () => {
    withGitTarget((source, target) => {
      const outside = mkdtempSync(join(tmpdir(), "install-out-"));
      try {
        symlinkSync(outside, join(target, rel.split("/")[0]));
        assert.throws(() => install({ source, target, log: quiet }), (e) => e instanceof InstallRefusal && /outside the target/.test(e.message));
        assert.deepEqual(readdirSync(outside), []);
        assert.equal(existsSync(join(target, "AGENTS.md")), false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });
}

// ---- CLAUDE.md: a relative symlink to AGENTS.md ----

const REPO = join(dirname(SCRIPT), "..");

test("this repo: CLAUDE.md is a relative symlink to AGENTS.md, and templates/ has no CLAUDE.md", () => {
  assert.ok(lstatSync(join(REPO, "CLAUDE.md")).isSymbolicLink());
  assert.equal(readlinkSync(join(REPO, "CLAUDE.md")), "AGENTS.md");
  assert.ok(lstatSync(join(REPO, "AGENTS.md")).isFile());
  assert.equal(present(join(REPO, "templates", "CLAUDE.md")), false, "the installer makes the link, so there is no template file");
});

test("CLAUDE.md: a missing CLAUDE.md becomes a relative symlink to AGENTS.md", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    const link = join(target, "CLAUDE.md");
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(readlinkSync(link), "AGENTS.md", "relative, so it works after the repo moves");
    assert.equal(readFileSync(link, "utf8"), "agents\n");
    assert.equal(r.counts.link, 1);
    assert.ok(out.includes("link  CLAUDE.md -> AGENTS.md"));
  });
});

test("CLAUDE.md: --dry-run prints the link action and makes no link", () => {
  withDirs((source, target) => {
    const calls = [];
    const out = [];
    install({ source, target, dryRun: true, log: (l) => out.push(l), symlink: (...a) => calls.push(a) });
    assert.deepEqual(calls, []);
    assert.equal(present(join(target, "CLAUDE.md")), false);
    assert.ok(out.includes("would link  CLAUDE.md -> AGENTS.md"));
  });
});

test("CLAUDE.md: an existing file is never overwritten, and the steps to do by hand are printed", () => {
  withDirs((source, target) => {
    write(target, "CLAUDE.md", "my rules\n");
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(lstatSync(join(target, "CLAUDE.md")).isSymbolicLink(), false);
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "my rules\n");
    assert.ok(r.items.some((i) => i.kind === "manual" && i.dest.endsWith("CLAUDE.md")));
    const text = out.join("\n");
    assert.match(text, /^manual {2}CLAUDE\.md \(already exists as a file, not changed\)$/m);
    assert.match(text, /move any rules from CLAUDE\.md into AGENTS\.md/);
    assert.match(text, /rm CLAUDE\.md && ln -s AGENTS\.md CLAUDE\.md/);
  });
});

test("CLAUDE.md: an existing link to another file is never changed", () => {
  withDirs((source, target) => {
    write(target, "docs/RULES.md", "rules\n");
    symlinkSync(join("docs", "RULES.md"), join(target, "CLAUDE.md"));
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(readlinkSync(join(target, "CLAUDE.md")), join("docs", "RULES.md"));
    assert.ok(r.items.some((i) => i.kind === "manual" && i.dest.endsWith("CLAUDE.md")));
    assert.match(out.join("\n"), /CLAUDE\.md already exists as a link to docs\/RULES\.md/);
  });
});

test("CLAUDE.md: an existing link to AGENTS.md is skipped with no manual step", () => {
  withDirs((source, target) => {
    symlinkSync("AGENTS.md", join(target, "CLAUDE.md"));
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.ok(r.items.some((i) => i.kind === "skip" && i.dest.endsWith("CLAUDE.md")));
    assert.ok(out.includes("skip    CLAUDE.md (already a link to AGENTS.md)"));
    assert.equal(r.counts.manual, 0);
  });
});

test("CLAUDE.md: a dangling link that leads outside the target is not written through", () => {
  withDirs((source, target) => {
    const outside = mkdtempSync(join(tmpdir(), "install-out-"));
    try {
      symlinkSync(join(outside, "victim.md"), join(target, "CLAUDE.md"));
      const r = install({ source, target, log: quiet });
      assert.deepEqual(readdirSync(outside), [], "nothing created outside the target");
      assert.equal(readlinkSync(join(target, "CLAUDE.md")), join(outside, "victim.md"), "the link is left as it was");
      assert.ok(r.items.some((i) => i.kind === "manual" && i.dest.endsWith("CLAUDE.md")));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("CLAUDE.md: no link when AGENTS.md is a symlink to a file outside the target", () => {
  withDirs((source, target) => {
    const outside = mkdtempSync(join(tmpdir(), "install-out-"));
    try {
      writeFileSync(join(outside, "real.md"), "outside\n");
      symlinkSync(join(outside, "real.md"), join(target, "AGENTS.md"));
      const out = [];
      const r = install({ source, target, log: (l) => out.push(l) });
      assert.equal(present(join(target, "CLAUDE.md")), false);
      assert.ok(r.items.some((i) => i.kind === "manual" && i.dest.endsWith("CLAUDE.md")));
      assert.match(out.join("\n"), /which is outside the target/);
      assert.equal(readFileSync(join(outside, "real.md"), "utf8"), "outside\n");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("CLAUDE.md: a link is made when AGENTS.md is a symlink that stays inside the target", () => {
  withDirs((source, target) => {
    write(target, "docs/AGENTS.md", "inside\n");
    symlinkSync(join("docs", "AGENTS.md"), join(target, "AGENTS.md"));
    install({ source, target, log: quiet });
    assert.equal(readlinkSync(join(target, "CLAUDE.md")), "AGENTS.md");
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "inside\n");
  });
});

test("CLAUDE.md: when the OS refuses the symlink, a one-line @AGENTS.md file is written and the output says so", () => {
  withDirs((source, target) => {
    const refuse = () => {
      const e = new Error("operation not permitted");
      e.code = "EPERM";
      throw e;
    };
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l), symlink: refuse });
    const file = join(target, "CLAUDE.md");
    assert.equal(lstatSync(file).isSymbolicLink(), false);
    assert.equal(readFileSync(file, "utf8"), "@AGENTS.md\n");
    assert.ok(r.items.some((i) => i.fallback && i.dest === file));
    const text = out.join("\n");
    assert.match(text, /create {2}CLAUDE\.md \(one line, @AGENTS\.md, because the OS refused the symlink: EPERM\)/);
    assert.match(text, /ln -s AGENTS\.md CLAUDE\.md/);
  });
});

test("CLAUDE.md: if something appears at CLAUDE.md during the install, it is not overwritten", () => {
  withDirs((source, target) => {
    const race = (to, dest) => {
      writeFileSync(dest, "theirs\n");
      const e = new Error("file already exists");
      e.code = "EEXIST";
      throw e;
    };
    assert.throws(() => install({ source, target, log: quiet, symlink: race }), (e) => e.code === "EEXIST");
    assert.equal(readFileSync(join(target, "CLAUDE.md"), "utf8"), "theirs\n");
  });
});

test("CLAUDE.md: no link and a note when neither the source nor the target has AGENTS.md", () => {
  withDirs((source, target) => {
    rmSync(join(source, "templates", "AGENTS.md"));
    const r = install({ source, target, log: quiet });
    assert.equal(present(join(target, "CLAUDE.md")), false);
    assert.ok(r.notes.some((n) => /CLAUDE\.md was not linked/.test(n)));
  });
});

test("CLAUDE.md: the cli dry run prints the link action", () => {
  withDirs((source, target) => {
    const r = spawnSync(process.execPath, [SCRIPT, "--source", source, "--dry-run", target], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^would link {2}CLAUDE\.md -> AGENTS\.md$/m);
    assert.deepEqual(listAll(target), []);
  });
});

// ---- claude version note ----

const warns = (out) => out.filter((l) => l.includes("onFailure: block"));

test("claude version: an older version prints the warning and the install still finishes", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l), claudeVersion: () => "2.1.294 (Claude Code)\n" });
    assert.equal(warns(out).length, 1);
    assert.match(warns(out)[0], /2\.1\.295/);
    assert.ok(r.counts.copy > 0);
    assert.ok(present(join(target, "AGENTS.md")));
  });
});

test("claude version: 2.1.295 and newer print nothing", () => {
  for (const v of ["2.1.295", "2.1.295 (Claude Code)", "2.2.0", "3.0.0", "2.10.0"]) {
    withDirs((source, target) => {
      const out = [];
      install({ source, target, log: (l) => out.push(l), claudeVersion: () => v });
      assert.equal(warns(out).length, 0, v);
    });
  }
});

test("claude version: older versions across each part print the warning", () => {
  for (const v of ["1.9.999", "2.0.999", "2.1.9", "2.1.100"]) assert.equal(isOlderVersion(v), true, v);
});

test("claude version: no binary, no output or unreadable text prints nothing", () => {
  for (const fake of [() => null, () => "", () => "not a version", () => undefined, () => { throw new Error("boom"); }]) {
    withDirs((source, target) => {
      const out = [];
      install({ source, target, log: (l) => out.push(l), claudeVersion: fake });
      assert.equal(warns(out).length, 0);
      assert.ok(present(join(target, "AGENTS.md")));
    });
  }
});

test("claude version: the warning also shows in a dry run and the install result is the same", () => {
  withDirs((source, target) => {
    const out = [];
    const r = install({ source, target, dryRun: true, log: (l) => out.push(l), claudeVersion: () => "1.0.0" });
    assert.equal(warns(out).length, 1);
    assert.ok(r.counts.copy > 0);
  });
});

test("claude version: the real lookup returns null when no claude binary is on PATH", () => {
  const empty = mkdtempSync(join(tmpdir(), "install-path-"));
  const old = process.env.PATH;
  process.env.PATH = empty;
  try {
    assert.equal(lookupClaudeVersion(), null);
  } finally {
    process.env.PATH = old;
    rmSync(empty, { recursive: true, force: true });
  }
});

// ---- .gitignore: evidence media stays out of commits ----

function realRepo() {
  const t = mkdtempSync(join(tmpdir(), "install-gi-"));
  gitInit(t);
  return t;
}

test("gitignore: a repo with no .gitignore gets one with the header and every media rule", () => {
  withDirs((source, target) => {
    install({ source, target, log: quiet });
    const text = readFileSync(join(target, ".gitignore"), "utf8");
    assert.equal(text, [GITIGNORE_HEADER, ...GITIGNORE_RULES].join("\n") + "\n");
  });
});

test("gitignore: an existing .gitignore is kept and the rules are appended after it", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", "node_modules/\ndist");
    const r = install({ source, target, log: quiet });
    assert.equal(r.gitignore, "added");
    const text = readFileSync(join(target, ".gitignore"), "utf8");
    assert.ok(text.startsWith("node_modules/\ndist\n\n"), JSON.stringify(text));
    for (const rule of GITIGNORE_RULES) assert.ok(text.split("\n").includes(rule), rule);
  });
});

test("gitignore: a second install adds nothing", () => {
  withDirs((source, target) => {
    install({ source, target, log: quiet });
    const first = readFileSync(join(target, ".gitignore"), "utf8");
    const out = [];
    const r = install({ source, target, log: (l) => out.push(l) });
    assert.equal(r.gitignore, "already");
    assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), first);
    assert.ok(out.some((l) => l.startsWith("skip    .gitignore")));
  });
});

test("gitignore: an empty .gitignore gets the rules, and a second install adds nothing", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", "");
    assert.equal(install({ source, target, log: quiet }).gitignore, "added");
    const text = readFileSync(join(target, ".gitignore"), "utf8");
    assert.equal(text, [GITIGNORE_HEADER, ...GITIGNORE_RULES].join("\n") + "\n");
    assert.equal(install({ source, target, log: quiet }).gitignore, "already");
    assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), text);
  });
});

test("gitignore: a .gitignore with no newline at the end gets the rules on new lines", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", "node_modules/");
    assert.equal(install({ source, target, log: quiet }).gitignore, "added");
    const text = readFileSync(join(target, ".gitignore"), "utf8");
    assert.equal(text, ["node_modules/", "", GITIGNORE_HEADER, ...GITIGNORE_RULES].join("\n") + "\n");
    assert.equal(install({ source, target, log: quiet }).gitignore, "already");
  });
});

test("gitignore: only the missing rules are appended, and the header is not repeated", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", `${GITIGNORE_HEADER}\n${GITIGNORE_RULES[0]}\n`);
    install({ source, target, log: quiet });
    const lines = readFileSync(join(target, ".gitignore"), "utf8").split("\n");
    assert.equal(lines.filter((l) => l === GITIGNORE_HEADER).length, 1);
    for (const rule of GITIGNORE_RULES) assert.equal(lines.filter((l) => l === rule).length, 1, rule);
  });
});

test("gitignore: a rule that ignores all of .artifacts/ counts as present", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", ".artifacts/\n");
    assert.equal(install({ source, target, log: quiet }).gitignore, "already");
    assert.equal(readFileSync(join(target, ".gitignore"), "utf8"), ".artifacts/\n");
  });
});

test("gitignore: CRLF line ends stay CRLF", () => {
  withDirs((source, target) => {
    write(target, ".gitignore", "dist\r\n");
    install({ source, target, log: quiet });
    const text = readFileSync(join(target, ".gitignore"), "utf8");
    assert.ok(text.startsWith("dist\r\n\r\n"));
    assert.ok(!/[^\r]\n/.test(text), "every line ends with CRLF");
  });
});

test("gitignore: a symlinked .gitignore is never written, and the rules are printed", () => {
  withDirs((source, target) => {
    const outside = mkdtempSync(join(tmpdir(), "install-gi-out-"));
    try {
      writeFileSync(join(outside, "gi"), "dist\n");
      symlinkSync(join(outside, "gi"), join(target, ".gitignore"));
      const out = [];
      const r = install({ source, target, log: (l) => out.push(l) });
      assert.equal(r.gitignore, "manual");
      assert.equal(readFileSync(join(outside, "gi"), "utf8"), "dist\n");
      assert.ok(out.some((l) => l.includes(GITIGNORE_RULES[0])));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("gitignore: --dry-run writes no .gitignore", () => {
  withDirs((source, target) => {
    const r = install({ source, target, dryRun: true, log: quiet });
    assert.equal(r.gitignore, "would-add");
    assert.equal(existsSync(join(target, ".gitignore")), false);
  });
});

test("gitignore: in a real repo, git ignores evidence media and keeps the review file, the index and the text output", () => {
  const source = makeSource();
  const target = realRepo();
  try {
    install({ source, target, log: quiet });
    const files = [
      ".artifacts/t/evidence/screenshots/after-375x812-light.png",
      ".artifacts/t/evidence/video/flow.webm",
      ".artifacts/t/evidence/a.jpg",
      ".artifacts/t/evidence/b.mp4",
      ".artifacts/t/review.md",
      ".artifacts/t/evidence/index.json",
      ".artifacts/t/evidence/output/test.txt",
      "docs/logo.png",
    ];
    for (const f of files) write(target, f, "x\n");
    const ignored = (f) => gitOut(target, "check-ignore", "-q", "--no-index", f).status === 0;
    for (const f of files.slice(0, 4)) assert.ok(ignored(f), `${f} must be ignored`);
    for (const f of files.slice(4)) assert.ok(!ignored(f), `${f} must stay visible to git`);
    const status = gitOut(target, "status", "--porcelain", "--untracked-files=all").out;
    assert.doesNotMatch(status, /evidence\/.*\.(png|webm|jpg|mp4)$/m);
    assert.match(status, /docs\/logo\.png/);
    assert.match(status, /\.artifacts\/t\/review\.md/);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("ensureGitignore: works alone on a folder", () => {
  const t = mkdtempSync(join(tmpdir(), "install-gi-alone-"));
  try {
    assert.equal(ensureGitignore(t).state, "added");
    assert.equal(ensureGitignore(t).state, "already");
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
});
