import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LEVELS, builtinRule, computeRisk, globToRegExp, levelOf, parseConfigText, plainPath, readConfig } from "../../skills/land/scripts/land-lib.mjs";
import { parseNameStatus, riskFromGit } from "../../skills/land/scripts/land-risk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "land", "scripts", "land-risk.mjs");
const CFG = readConfig({ levels: { low: ["docs/**", "**/*.md"], medium: ["src/**"], high: ["src/auth/**"] } }).config;

test("plainPath refuses `..`, `.`, empty parts, backslashes, leading slash and control characters", { timeout: 120000 }, () => {
  for (const p of ["docs/../.github/x", "./a", "a//b", "a\\b", "/etc/x", "a/\u0007b", "", "a/."]) assert.equal(plainPath(p), false, p);
  assert.equal(plainPath("docs/a.md"), true);
});

test("built-in rules: only the fences (CI, hook folders, .claude, .stack, CODEOWNERS) and path tricks", { timeout: 120000 }, () => {
  const want = {
    ".github/workflows/ci.yml": "ci-workflow", ".GitHub/Workflows/ci.yml": "ci-workflow", ".gitlab-ci.yml": "ci-workflow",
    ".github/actions/setup/action.yml": "ci-workflow", ".circleci/config.yml": "ci-workflow",
    ".claude/settings.json": "guard-files", "pkg/.claude/hooks/x.mjs": "guard-files", ".githooks/pre-commit": "guard-files",
    ".husky/pre-push": "guard-files", ".stack/check": "guard-files", ".stack/risk.json": "risk-config", ".STACK/Risk.json": "risk-config",
    "CODEOWNERS": "codeowners", "docs/CODEOWNERS": "codeowners", "docs/../x": "path-not-plain",
    ".claude./settings.json": "guard-files", ".claude /settings.json": "guard-files", ".cl\u200baude/x": "guard-files", "\uff0eclaude/x": "guard-files",
  };
  for (const [p, rule] of Object.entries(want)) assert.equal(builtinRule(p), rule, p);
  for (const p of ["docs/a.md", "src/total.mjs", "docs/.github/x.md", "AGENTS.md", "package.json", "yarn.lock", ".gitmodules", ".mcp.json", ".github/dependabot.yml"]) assert.equal(builtinRule(p), null, p);
});

test("default levels: manifests, lockfiles and agent files are high, docs are low, the rest is medium", { timeout: 120000 }, () => {
  const D = readConfig(null).config;
  const high = ["AGENTS.md", "sub/CLAUDE.md", "gemini.md", ".mcp.json", "x/.cursorrules", ".cursor/rules/a.mdc", "docs/agents/tracker.md", ".github/dependabot.yml",
    "package.json", "web/Package-Lock.JSON", "yarn.lock", "bunfig.toml", "requirements-dev.txt", "api/go.sum", "x.gemspec", "app/App.csproj", "Cargo.lock", ".gitmodules", ".envrc", "lefthook.yml", ".pre-commit-config.yaml"];
  for (const p of high) assert.equal(levelOf(p, D).level, "high", p);
  for (const p of ["docs/a.md", "README.md", "docs/img/x.txt", "pkg/notes.md"]) assert.equal(levelOf(p, D).level, "low", p);
  for (const p of ["src/total.mjs", "bin/x", "Makefile", "DOCS/a.txt", ".artifacts/t/evidence/index.json"]) assert.equal(levelOf(p, D).level, "medium", p);
  // Every default glob compiles and is a plain string, so the same list works as a starter file.
  for (const g of [...DEFAULT_LEVELS.high, ...DEFAULT_LEVELS.low]) assert.equal(typeof g, "string");
  assert.equal(readConfig({ levels: DEFAULT_LEVELS }).errors.length, 0);
  // A level that the project config names replaces the default list of that level. Other levels keep theirs.
  assert.equal(levelOf("package.json", readConfig({ levels: { low: ["**"] } }).config).level, "high");
  assert.equal(levelOf("package.json", readConfig({ levels: { high: [] } }).config).level, "medium");
  assert.equal(levelOf("package.json", readConfig({ levels: { high: ["src/auth/**"], low: ["**/*.json"] } }).config).level, "low");
  assert.equal(levelOf("package.json", readConfig({ requiredChecks: [] }).config).level, "high");
});

test("globs: ** crosses folders, * does not, {a,b} is a choice, case only with nocase", { timeout: 120000 }, () => {
  assert.ok(globToRegExp("docs/**").test("docs/a/b.md"));
  assert.ok(!globToRegExp("docs/*").test("docs/a/b.md"));
  assert.ok(globToRegExp("**/*.md").test("a.md"));
  assert.ok(globToRegExp("{src,lib}/*.mjs").test("lib/x.mjs"));
  assert.ok(!globToRegExp("docs/**").test("DOCS/a.md"));
  assert.ok(globToRegExp("docs/**", { nocase: true }).test("DOCS/a.md"));
});

test("levelOf: high and medium globs ignore case, low needs the exact case, no match is medium", { timeout: 120000 }, () => {
  assert.equal(levelOf("docs/a.txt", CFG).level, "low");
  assert.equal(levelOf("DOCS/a.txt", CFG).level, "medium");
  assert.equal(levelOf("DOCS/a.txt", CFG).rule, "unmatched");
  assert.equal(levelOf("SRC/x.mjs", CFG).level, "medium");
  assert.equal(levelOf("src/auth/login.mjs", CFG).level, "high");
  assert.equal(levelOf("bin/x", CFG).rule, "unmatched");
  assert.equal(levelOf(".claude/skills/land/SKILL.md", CFG).level, "high", "a built-in beats the **/*.md low glob");
});

test("computeRisk: the highest path decides, and the result names the rule and the paths per level", { timeout: 120000 }, () => {
  const r = computeRisk(["docs/a.md", "src/b.mjs"], CFG);
  assert.equal(r.level, "medium");
  assert.equal(r.rule, "config:medium:src/**");
  assert.equal(r.path, "src/b.mjs");
  assert.deepEqual(r.paths, { low: ["docs/a.md"], medium: ["src/b.mjs"], high: [] });
  assert.equal(computeRisk(["docs/a.md"], CFG).level, "low");
  assert.equal(computeRisk([], CFG).rule, "no-changed-files");
  assert.equal(computeRisk(["docs/a.md"], CFG, { incomplete: true }).rule, "file-list-incomplete");
});

test("a config cannot lower a built-in rule: low ** still leaves workflows and the guard folders high", { timeout: 120000 }, () => {
  const open = readConfig({ levels: { low: ["**"] } }).config;
  assert.equal(computeRisk([".github/workflows/ci.yml"], open).level, "high");
  assert.equal(computeRisk([".claude/settings.json"], open).level, "high");
  assert.equal(computeRisk(["pnpm-lock.yaml"], open).level, "high", "this config names no high list, so the default high list stays");
  assert.equal(computeRisk(["pnpm-lock.yaml"], readConfig({ levels: { low: ["**"], high: [] } }).config).level, "low", "a project can clear the default high list");
  assert.equal(computeRisk([".stack/risk.json"], open).rule, "builtin:risk-config");
  assert.equal(computeRisk(["src/a.mjs"], open).level, "low");
});

test("readConfig lists every bad part and every unknown key as an error, so the gate can stop", { timeout: 120000 }, () => {
  const r = readConfig({ levels: { low: "docs/**", sometimes: [] }, requiredChecks: [{ name: "t" }, { name: "t", app: "a" }], mergeMethod: "fast", notHuman: "x", allowNoChecks: "yes", extra: 1 });
  assert.deepEqual(r.config.levels.low, []);
  assert.deepEqual(r.config.requiredChecks, [{ name: "t", app: "a" }]);
  assert.equal(r.config.mergeMethod, "squash");
  assert.equal(r.config.allowNoChecks, false);
  assert.equal(r.errors.length, 7);
  assert.match(parseConfigText("{ bad").errors[0], /not valid JSON/);
  assert.equal(parseConfigText("{ bad").found, true);
  const none = parseConfigText(null);
  assert.equal(none.found, false);
  assert.deepEqual(none.errors, []);
  assert.deepEqual(none.config.levels, DEFAULT_LEVELS);
  assert.deepEqual(readConfig({ requiredChecks: [], allowNoChecks: true }).errors, []);
});

test("parseNameStatus gives both names of a rename or copy", { timeout: 120000 }, () => {
  assert.deepEqual(parseNameStatus("M\0a.txt\0R100\0package-lock.json\0x/old.txt\0C90\0a\0b\0"), ["a.txt", "package-lock.json", "x/old.txt", "a", "b"]);
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "land-risk-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e.invalid", GIT_CONFIG_GLOBAL: "/dev/null" };
  const g = (...a) => spawnSync("git", ["-c", "commit.gpgsign=false", ...a], { cwd: dir, encoding: "utf8", env });
  const w = (p, c) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  };
  g("init", "-q", "-b", "main");
  w(".stack/risk.json", JSON.stringify({ levels: { low: ["docs/**"], medium: ["src/**"], high: ["**/package-lock.json"] } }));
  w("docs/a.md", "a\n");
  w("package-lock.json", "{}\n");
  g("add", "-A");
  g("commit", "-q", "-m", "base");
  g("update-ref", "refs/remotes/origin/main", "HEAD");
  g("switch", "-q", "-c", "agent/t");
  return { dir, g, w, rm: () => rmSync(dir, { recursive: true, force: true }) };
}

test("git mode: the config comes from the base, so a change to .stack/risk.json cannot lower its own risk", { timeout: 120000 }, () => {
  const r = repo();
  try {
    r.w(".stack/risk.json", JSON.stringify({ levels: { low: ["**"] } }));
    r.w("src/x.mjs", "x\n");
    r.g("add", "-A");
    r.g("commit", "-q", "-m", "lower the risk");
    const res = riskFromGit({ dir: r.dir });
    assert.equal(res.base, "origin/main");
    assert.equal(res.level, "high");
    assert.equal(res.rule, "builtin:risk-config");
    assert.deepEqual(res.paths.medium, ["src/x.mjs"], "src/** is medium under the BASE config, not low under the head config");
  } finally {
    r.rm();
  }
});

test("git mode: a renamed lockfile is high, a docs-only change is low", { timeout: 120000 }, () => {
  const r = repo();
  try {
    r.w("docs/b.md", "b\n");
    r.g("add", "-A");
    r.g("commit", "-q", "-m", "docs");
    assert.equal(riskFromGit({ dir: r.dir }).level, "low");
    mkdirSync(join(r.dir, "vendor"));
    renameSync(join(r.dir, "package-lock.json"), join(r.dir, "vendor", "old.txt"));
    r.g("add", "-A");
    r.g("commit", "-q", "-m", "hide the lockfile");
    const res = riskFromGit({ dir: r.dir });
    assert.equal(res.level, "high");
    assert.ok(res.paths.high.includes("package-lock.json"), JSON.stringify(res.paths));
  } finally {
    r.rm();
  }
});

test("CLI: --paths and --config mode prints JSON and exits 0; usage errors exit 2", { timeout: 120000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "land-risk-cli-"));
  try {
    writeFileSync(join(dir, "paths.txt"), "docs/a.md\n.github/workflows/x.yml\n");
    writeFileSync(join(dir, "cfg.json"), JSON.stringify({ levels: { low: ["docs/**"] } }));
    const r = spawnSync(process.execPath, [SCRIPT, "--paths", join(dir, "paths.txt"), "--config", join(dir, "cfg.json")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.level, "high");
    assert.equal(j.rule, "builtin:ci-workflow");
    assert.deepEqual(j.paths.low, ["docs/a.md"]);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--paths", "x"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--level", "low"], { encoding: "utf8" }).status, 2);
    const nb = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", cwd: dir });
    assert.equal(nb.status, 2);
    assert.match(nb.stderr, /\. Fix: .+\.$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
