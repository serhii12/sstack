// --tool claude|codex|both. Codex finds skills in .agents/skills/, so the Codex copy goes there,
// with the path .claude/skills/ in its text changed to .agents/skills/. A separate file, so that
// it does not touch install.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { install, InstallUsageError } from "../../scripts/install.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "install.mjs");
const CODEX_HOOKS = readFileSync(join(dirname(SCRIPT), "..", "templates", "codex-hooks.json"), "utf8");
const SKILL_TEXT = "Run `node .claude/skills/grill/scripts/lint.mjs`.\nHeld by: .claude/skills/grill/scripts/lint.mjs\n";
const SCRIPT_TEXT = '#!/usr/bin/env node\nconst USAGE = "Usage: node .claude/skills/grill/scripts/lint.mjs <file>";\n';

function write(root, rel, content, mode) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  if (mode) chmodSync(p, mode);
}

function makeSource() {
  const s = mkdtempSync(join(tmpdir(), "install-codex-src-"));
  write(s, "skills/grill/SKILL.md", SKILL_TEXT);
  write(s, "skills/grill/scripts/lint.mjs", SCRIPT_TEXT, 0o755);
  write(s, "skills/grill/agents/openai.yaml", "policy:\n  allow_implicit_invocation: false\n");
  write(s, "hooks/guard-git.mjs", "// guard\n");
  write(s, "hooks/git-policy.mjs", "// policy\n");
  write(s, "templates/AGENTS.md", "agents\n");
  write(s, "templates/GLOSSARY.md", "glossary\n");
  write(s, "templates/adr/0000-template.md", "adr\n");
  write(s, "templates/claude-settings.json", '{ "hooks": {} }\n');
  write(s, "templates/codex-hooks.json", CODEX_HOOKS);
  write(s, "templates/githooks/prepare-commit-msg", "#!/bin/sh\n", 0o755);
  return s;
}

function listAll(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? listAll(p, base) : [p.slice(base.length + 1)];
  });
}

function withDirs(fn) {
  const source = makeSource();
  const target = mkdtempSync(join(tmpdir(), "install-codex-tgt-"));
  mkdirSync(join(target, ".git"));
  try {
    return fn(source, target);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}

const files = (target) => listAll(target).filter((f) => !f.startsWith(".git/")).sort();
const quiet = () => {};
const SHARED = [".githooks/prepare-commit-msg", ".gitignore", ".stack/check", "AGENTS.md", "GLOSSARY.md", "docs/adr/0000-template.md", "docs/agents/enforcement.md", "docs/agents/permissions.md"];
const CODEX_SKILLS = [".agents/skills/grill/SKILL.md", ".agents/skills/grill/agents/openai.yaml", ".agents/skills/grill/scripts/lint.mjs"];
const CODEX_GUARD = [".codex/hooks.json", ".codex/hooks/git-policy.mjs", ".codex/hooks/guard-git.mjs"];
const CLAUDE_SKILLS = [".claude/skills/grill/SKILL.md", ".claude/skills/grill/agents/openai.yaml", ".claude/skills/grill/scripts/lint.mjs"];

test("--tool codex: skills go to .agents/skills/, and nothing goes to .claude/ or CLAUDE.md", () => {
  withDirs((source, target) => {
    install({ source, target, tool: "codex", log: quiet, claudeVersion: () => null });
    assert.deepEqual(files(target), [...CODEX_SKILLS, ...CODEX_GUARD, ...SHARED].sort());
  });
});

test("--tool codex: the copy says .agents/skills/ where the source says .claude/skills/, and a script keeps its mode", () => {
  withDirs((source, target) => {
    install({ source, target, tool: "codex", log: quiet, claudeVersion: () => null });
    const skill = readFileSync(join(target, ".agents/skills/grill/SKILL.md"), "utf8");
    assert.equal(skill, SKILL_TEXT.replaceAll(".claude/skills/", ".agents/skills/"));
    assert.match(skill, /^Held by: \.agents\/skills\/grill\/scripts\/lint\.mjs$/m);
    const script = join(target, ".agents/skills/grill/scripts/lint.mjs");
    assert.equal(readFileSync(script, "utf8"), SCRIPT_TEXT.replaceAll(".claude/skills/", ".agents/skills/"));
    assert.ok(statSync(script).mode & 0o100, "the script keeps its executable bit");
    for (const f of CODEX_SKILLS) assert.doesNotMatch(readFileSync(join(target, f), "utf8"), /\.claude\/skills\//, f);
    assert.equal(readFileSync(join(source, "skills/grill/SKILL.md"), "utf8"), SKILL_TEXT, "the source is not changed");
  });
});

test("--tool codex --dry-run prints the .agents/skills/ copies and writes nothing", () => {
  withDirs((source, target) => {
    const out = [];
    install({ source, target, tool: "codex", dryRun: true, log: (l) => out.push(l), claudeVersion: () => null });
    assert.deepEqual(files(target), []);
    assert.ok(out.includes("would copy  .agents/skills/grill/SKILL.md"));
    assert.ok(!out.some((l) => l.includes(".claude/")), "no line names a .claude/ path");
  });
});

test("--tool codex: existing files are never overwritten and are reported as skipped", () => {
  withDirs((source, target) => {
    write(target, ".agents/skills/grill/SKILL.md", "my skill\n");
    const out = [];
    const r = install({ source, target, tool: "codex", log: (l) => out.push(l), claudeVersion: () => null });
    assert.equal(readFileSync(join(target, ".agents/skills/grill/SKILL.md"), "utf8"), "my skill\n");
    assert.ok(out.includes("skip    .agents/skills/grill/SKILL.md (already exists, not overwritten)"));
    assert.ok(r.counts.skip >= 1);
    const again = install({ source, target, tool: "codex", log: quiet, claudeVersion: () => null });
    assert.equal(again.counts.copy + again.counts.generate + again.counts.link, 0, "a second run creates nothing");
  });
});

test("--tool both: both skill trees, CLAUDE.md and the Claude settings, and only the Codex copy is rewritten", () => {
  withDirs((source, target) => {
    install({ source, target, tool: "both", log: quiet, claudeVersion: () => null });
    const all = files(target);
    for (const f of [...CODEX_SKILLS, ...CODEX_GUARD, ...CLAUDE_SKILLS, ...SHARED, "CLAUDE.md", ".claude/settings.json", ".claude/hooks/guard-git.mjs"]) assert.ok(all.includes(f), f);
    assert.ok(lstatSync(join(target, "CLAUDE.md")).isSymbolicLink());
    assert.equal(readFileSync(join(target, ".claude/skills/grill/SKILL.md"), "utf8"), SKILL_TEXT);
    assert.doesNotMatch(readFileSync(join(target, ".agents/skills/grill/SKILL.md"), "utf8"), /\.claude\//);
  });
});

test("no --tool means claude: nothing goes to .agents/ or .codex/", () => {
  withDirs((source, target) => {
    install({ source, target, log: quiet, claudeVersion: () => null });
    assert.ok(existsSync(join(target, ".claude/skills/grill/SKILL.md")));
    assert.equal(existsSync(join(target, ".agents")), false);
    assert.equal(existsSync(join(target, ".codex")), false);
  });
});

test("an unknown --tool value is a usage error, and nothing is written", () => {
  withDirs((source, target) => {
    assert.throws(() => install({ source, target, tool: "cursor", log: quiet }), (e) => e instanceof InstallUsageError && /claude, codex or both/.test(e.message));
    assert.deepEqual(files(target), []);
    const run = (args) => spawnSync(process.execPath, [SCRIPT, "--source", source, ...args], { encoding: "utf8" });
    for (const args of [["--tool", "cursor", target], [target, "--tool"]]) {
      const r = run(args);
      assert.equal(r.status, 2, args.join(" "));
      assert.match(r.stderr, /--tool claude\|codex\|both/);
    }
    assert.equal(run(["--tool", "codex", "--dry-run", target]).status, 0);
    assert.deepEqual(files(target), []);
  });
});

test("--tool codex: no Claude Code rules and no Claude version note are printed, and no Codex config file is written", () => {
  withDirs((source, target) => {
    const out = [];
    install({ source, target, tool: "codex", log: (l) => out.push(l), claudeVersion: () => "1.0.0 (Claude Code)" });
    const text = out.join("\n");
    assert.doesNotMatch(text, /Permissions for Claude Code/);
    assert.doesNotMatch(text, /onFailure: block/);
    assert.match(text, /Permissions for Codex\. The installer wrote no Codex config file\./);
    assert.match(text, /docs\/agents\/permissions\.md/);
    for (const f of [".codex/config.toml", ".codex/rules"]) assert.equal(existsSync(join(target, f)), false, f);
    assert.match(readFileSync(join(target, "docs/agents/permissions.md"), "utf8"), /`node \.agents\/skills\/<skill>\/scripts\/<script>\.mjs`/);
  });
});

// ---- the git guard as a Codex hook ----

test("--tool codex: the guard goes to .codex/hooks/, and .codex/hooks.json finds it through --git-common-dir", () => {
  withDirs((source, target) => {
    install({ source, target, tool: "codex", log: quiet, claudeVersion: () => null });
    assert.equal(readFileSync(join(target, ".codex/hooks/guard-git.mjs"), "utf8"), "// guard\n");
    const hooks = JSON.parse(readFileSync(join(target, ".codex/hooks.json"), "utf8"));
    const command = hooks.hooks.PreToolUse[0].hooks[0].command;
    assert.match(command, /git rev-parse --path-format=absolute --git-common-dir/);
    assert.match(command, /\/\.codex\/hooks\/guard-git\.mjs" \|\| exit 2$/);
  });
});

test("--tool codex: an existing .codex/hooks.json is never changed, and the entries to add are printed", () => {
  withDirs((source, target) => {
    write(target, ".codex/hooks.json", '{ "hooks": {} }\n');
    const out = [];
    const r = install({ source, target, tool: "codex", log: (l) => out.push(l), claudeVersion: () => null });
    assert.equal(readFileSync(join(target, ".codex/hooks.json"), "utf8"), '{ "hooks": {} }\n');
    assert.equal(r.counts.manual, 1);
    const text = out.join("\n");
    assert.match(text, /^manual {2}\.codex\/hooks\.json/m);
    assert.match(text, /\.codex\/hooks\.json already exists, so it was not changed\. Add these entries by hand/);
    assert.match(text, /"statusMessage": "sstack git guard"/);
  });
});

test("next steps: Codex installs say in one line that the project and the hook need trust, Claude installs do not", () => {
  const TRUST = /^\d+\. In Codex, trust this project, then trust the hook "sstack git guard" in \/hooks\. Until then, Codex skips the guard with no warning\. Type \$name where these steps say \/name\.$/;
  for (const [tool, wanted] of [["codex", 1], ["both", 1], ["claude", 0]]) {
    withDirs((source, target) => {
      const steps = install({ source, target, tool, log: quiet, claudeVersion: () => null }).nextSteps;
      assert.equal(steps.filter((l) => TRUST.test(l)).length, wanted, tool);
      assert.equal(steps.filter((l) => /Codex/.test(l)).length, wanted, `${tool}: only that line names Codex`);
    });
  }
});

test("--tool codex: the starter docs name the Codex guard files", () => {
  withDirs((source, target) => {
    install({ source, target, tool: "codex", log: quiet, claudeVersion: () => null });
    assert.match(readFileSync(join(target, "docs/agents/enforcement.md"), "utf8"), /\.codex\/hooks\/guard-git\.mjs \(Codex, after you trust it\)/);
    assert.match(readFileSync(join(target, "docs/agents/permissions.md"), "utf8"), /`\.codex\/hooks\/` and `\.codex\/hooks\.json`/);
  });
});
