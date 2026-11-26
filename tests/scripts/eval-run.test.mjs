import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, chmodSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_FLAGS, UsageError, assertSafeArgs, buildCommand, forbiddenText, globToRegExp, hookBlocks, mergeTranscripts, removeSessionData,
  sessionDirName, stripSkillAsserts, summarizeBaseline, baselineSettings, defaultSpawn, buildPlan, discoverEvals, evaluateAsserts, childEnv, findClaude, formatReport,
  git, isGuardPath, isWrapper, loadedSkills, main, makeLayout, networkWritingTools, parseCli, parseEvalFile, parseTranscript,
  prepareSetup, resolveClaude, runBudget, runOnce, summarize, toRegExp,
  AGENT_ENV, agentEnv, scriptPath, workTreeState, withoutGitVars,
} from "../../scripts/eval-run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SCRIPT = join(ROOT, "scripts", "eval-run.mjs");
const fx = (n) => readFileSync(join(HERE, "fixtures", "eval-run", n), "utf8");

// Every temp folder of this file lives in one base folder. `after` removes it, also when a test fails.
// The `exit` handler is a second net for a crash. A test that only reads the OS temp folder never leaves a folder there.
const TEST_BASE = realpathSync(mkdtempSync(join(tmpdir(), "eval-run-test-")));
const removeBase = () => rmSync(TEST_BASE, { recursive: true, force: true });
process.on("exit", removeBase);
after(removeBase);

const tmp = () => realpathSync(mkdtempSync(join(TEST_BASE, "t-")));

function evalText(checks, extra = "") {
  return `# Eval t/01: title\n\n## Prompt\n\n\`\`\`\nhi\n\`\`\`\n\n## Checks\n\n${extra}\`\`\`json\n${typeof checks === "string" ? checks : JSON.stringify(checks, null, 2)}\n\`\`\`\n`;
}
const GOOD = { prompt: "hi", allowedTools: ["Read"], assert: { outputMatches: ["x"] } };

// ---------------------------------------------------------------- parse eval file

test("parseEvalFile: valid block", () => {
  const e = parseEvalFile(evalText(GOOD));
  assert.equal(e.manual, false);
  assert.equal(e.checks.prompt, "hi");
  assert.equal(e.title, "Eval t/01: title");
});

test("parseEvalFile: no Checks heading means manual only", () => {
  const e = parseEvalFile("# Eval\n\n## Prompt\n\nhi\n");
  assert.equal(e.manual, true);
  assert.equal(e.checks, null);
});

test("parseEvalFile: a json block above the Checks heading is ignored", () => {
  const text = '# E\n\n```json\n{"prompt": 1}\n```\n\n## Expected\n\n- x\n';
  assert.equal(parseEvalFile(text).manual, true);
});

test("parseEvalFile: a json block after a later heading does not count", () => {
  assert.throws(() => parseEvalFile("# E\n\n## Checks\n\nsoon\n\n## Other\n\n```json\n{}\n```\n"), /no closed json block/);
});

test("parseEvalFile: rejects bad input", () => {
  const bad = (checks, re) => assert.throws(() => parseEvalFile(evalText(checks)), re);
  bad("{not json", /not valid JSON/);
  bad({ ...GOOD, extra: 1 }, /unknown key "extra"/);
  bad({ ...GOOD, prompt: "" }, /"prompt"/);
  bad({ ...GOOD, allowedTools: [] }, /allowedTools/);
  bad({ ...GOOD, allowedTools: ["Bash(a,b)"] }, /comma/);
  bad({ ...GOOD, budgetUsd: 0 }, /budgetUsd/);
  bad({ ...GOOD, assert: {} }, /no checks/);
  bad({ ...GOOD, assert: { nope: true } }, /unknown key "nope"/);
  bad({ ...GOOD, assert: { outputMatches: ["("] } }, /bad pattern/);
  bad({ ...GOOD, assert: { skillLoaded: "grill" } }, /skillLoaded/);
  bad({ ...GOOD, assert: { noRepoChanges: false } }, /noRepoChanges/);
  bad({ ...GOOD, assert: { fileExists: ["../x"] } }, /relative/);
  bad({ ...GOOD, assert: { gitCommitCountOn: { main: -1 } } }, /whole number/);
  bad({ ...GOOD, assert: { toolCalled: [{ inputMatches: "x" }] } }, /tool name/);
  bad({ ...GOOD, setup: { installStack: true } }, /gitInit/);
  bad({ ...GOOD, setup: { gitInit: true, files: [{ path: "/abs", content: "" }] } }, /relative/);
  bad({ ...GOOD, setup: { gitInit: true, files: [{ path: "a/../../b", content: "" }] } }, /relative/);
  bad({ ...GOOD, setup: { gitInit: true, branch: "-x" } }, /branch/);
  bad({ ...GOOD, setup: { branch: "x" } }, /gitInit/);
});

test("toRegExp: plain and slash forms", () => {
  assert.ok(toRegExp("a.c").test("abc"));
  assert.ok(toRegExp("/ABC/i").test("abc"));
  assert.throws(() => toRegExp(""));
});

test("every eval file in the repo parses (no Checks block is manual only)", () => {
  const all = discoverEvals(join(ROOT, "evals"));
  assert.ok(all.length > 0);
  for (const f of all) parseEvalFile(readFileSync(f.path, "utf8"));
});

test("the smoke eval has a valid Checks block", () => {
  const e = parseEvalFile(readFileSync(join(ROOT, "evals", "_smoke", "01-read-only.md"), "utf8"));
  assert.equal(e.manual, false);
  assert.deepEqual(e.checks.assert.skillLoaded, ["start"]);
});

test("discoverEvals: filters by skill and file, skips queries.md", () => {
  const d = tmp();
  for (const [s, f] of [["a", "01-x.md"], ["a", "queries.md"], ["b", "01-x.md"], ["b", "02-y.md"]]) {
    mkdirSync(join(d, s), { recursive: true });
    writeFileSync(join(d, s, f), "# x\n");
  }
  assert.deepEqual(discoverEvals(d).map((e) => e.rel), ["a/01-x.md", "b/01-x.md", "b/02-y.md"]);
  assert.deepEqual(discoverEvals(d, { skill: "b" }).map((e) => e.rel), ["b/01-x.md", "b/02-y.md"]);
  assert.deepEqual(discoverEvals(d, { evalFile: "b/02-y.md" }).map((e) => e.rel), ["b/02-y.md"]);
  assert.deepEqual(discoverEvals(d, { skill: "a", evalFile: "01-x.md" }).map((e) => e.rel), ["a/01-x.md"]);
  rmSync(d, { recursive: true });
});

// ---------------------------------------------------------------- network guard and command

test("networkWritingTools", () => {
  assert.deepEqual(networkWritingTools(["Read", "Skill", "Bash(git commit:*)", "Bash(git status)"]), []);
  assert.deepEqual(networkWritingTools(["Bash"]), ["Bash"]);
  assert.deepEqual(networkWritingTools(["Bash(gh pr create:*)"]), ["Bash(gh pr create:*)"]);
  assert.deepEqual(networkWritingTools(["Bash(git push:*)"]), ["Bash(git push:*)"]);
  assert.deepEqual(networkWritingTools(["Bash(curl:*)"]), ["Bash(curl:*)"]);
  assert.deepEqual(networkWritingTools(["WebFetch", "mcp__x__y"]), ["WebFetch", "mcp__x__y"]);
});

test("buildCommand: flags, model, tools", () => {
  const { cmd, args } = buildCommand({ claudePath: "/bin/claude", prompt: "hi there", model: "haiku", allowedTools: ["Read", "Bash(git commit:*)"], budgetUsd: 0.5 });
  assert.equal(cmd, "/bin/claude");
  assert.equal(args[0], "-p");
  assert.deepEqual(args.slice(-2), ["--", "hi there"]);
  const at = (f) => args[args.indexOf(f) + 1];
  assert.equal(at("--setting-sources"), "project");
  assert.equal(at("--output-format"), "stream-json");
  assert.equal(at("--max-budget-usd"), "0.5");
  assert.equal(at("--model"), "haiku");
  assert.equal(at("--allowedTools"), "Read,Bash(git commit:*)");
  assert.equal(at("--mcp-config"), '{"mcpServers":{}}');
  for (const f of ["--strict-mcp-config", "--verbose", "--include-hook-events", "--no-session-persistence"]) assert.ok(args.includes(f), f);
  assert.match(at("--disallowedTools"), /Bash\(gh:\*\)/);
});

test("buildCommand: a prompt that starts with a dash comes after --, as the last argument", () => {
  const { args } = buildCommand({ claudePath: "c", prompt: "--dangerously-skip-permissions", allowedTools: ["Read"], budgetUsd: 1, extraArgs: ["--effort", "low"] });
  assert.deepEqual(args.slice(-2), ["--", "--dangerously-skip-permissions"]);
  assert.equal(args.indexOf("--dangerously-skip-permissions"), args.length - 1);
  assert.equal(args.filter((a) => a === "--").length, 1);
});

test("buildCommand: no model flag without a model, no deny list with allowNetwork, no forbidden flag", () => {
  const a = buildCommand({ claudePath: "c", prompt: "p", model: null, allowedTools: ["Read"], budgetUsd: 1 }).args;
  assert.ok(!a.includes("--model"));
  const b = buildCommand({ claudePath: "c", prompt: "p", model: null, allowedTools: ["Read"], budgetUsd: 1, allowNetwork: true }).args;
  assert.ok(!b.includes("--disallowedTools"));
  for (const args of [a, b]) for (const f of FORBIDDEN_FLAGS) assert.ok(!args.includes(f), `must not pass ${f}`);
});

// A real binary is not a script. A wrapper starts with a shebang line.
const REAL = "\x7fELF fake binary\n";
const WRAPPER = "#!/usr/bin/env bash\nexec other-claude \"$@\"\n";

/** Make an executable file named `claude` in `dir`. */
function putClaude(dir, text) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "claude");
  writeFileSync(p, text);
  chmodSync(p, 0o755);
  return p;
}

test("findClaude: finds an executable file, skips a folder and a plain file", () => {
  const d = tmp();
  mkdirSync(join(d, "a", "claude"), { recursive: true });
  mkdirSync(join(d, "b"));
  writeFileSync(join(d, "b", "claude"), "#!/bin/sh\n");
  chmodSync(join(d, "b", "claude"), 0o644);
  mkdirSync(join(d, "c"));
  writeFileSync(join(d, "c", "claude"), REAL);
  chmodSync(join(d, "c", "claude"), 0o755);
  assert.equal(findClaude({ pathEnv: [join(d, "a"), join(d, "b"), join(d, "c")].join(":"), home: d }), join(d, "c", "claude"));
  assert.equal(findClaude({ pathEnv: join(d, "a"), home: d }), null);
  rmSync(d, { recursive: true });
});

test("parseCli: defaults, values and errors", () => {
  const o = parseCli([]);
  assert.equal(o.runs, 1);
  assert.deepEqual(o.models, [null]);
  assert.equal(o.minPassRate, 1);
  const p = parseCli(["--runs", "3", "--models", "a,b", "--budget-usd", "0.25", "--min-pass-rate", "0.8", "--skill", "grill", "--eval", "x.md", "--dry-run", "--allow-network"]);
  assert.deepEqual([p.runs, p.models, p.capUsd, p.minPassRate, p.skill, p.evalFile, p.dryRun, p.allowNetwork], [3, ["a", "b"], 0.25, 0.8, "grill", "x.md", true, true]);
  for (const bad of [["--runs", "0"], ["--runs", "x"], ["--min-pass-rate", "1.5"], ["--budget-usd", "-1"], ["--nope"], ["--models", "a,;rm"], ["stray"]]) {
    assert.throws(() => parseCli(bad), UsageError, bad.join(" "));
  }
});

// ---------------------------------------------------------------- transcripts

test("parseTranscript: real read-only run", () => {
  const t = parseTranscript(fx("read-only.jsonl"));
  assert.equal(t.init.model, "claude-opus-5-5");
  assert.deepEqual(t.toolCalls.map((c) => c.name), ["Glob", "Bash", "Bash", "Glob", "Write"]);
  assert.equal(t.result.subtype, "success");
  assert.equal(t.result.turns, 6);
  assert.ok(Math.abs(t.result.costUsd - 0.1424754) < 1e-9);
  assert.match(t.text, /no README/);
  assert.equal(t.hooks.length, 2);
  assert.equal(t.hooks[0].event, "PreToolUse");
  assert.equal(t.hooks[0].exitCode, 0);
  assert.equal(t.denials.length, 2);
  assert.equal(t.badLines, 0);
});

test("parseTranscript: real hook block", () => {
  const t = parseTranscript(fx("hook-block.jsonl"));
  const blocked = t.hooks.filter((h) => h.exitCode === 2);
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].output, /Blocked: git commit/);
});

test("parseTranscript: tolerates junk and a missing result", () => {
  const t = parseTranscript('not json\n{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}\n\n[1]\n');
  assert.equal(t.badLines, 1);
  assert.equal(t.text, "hi");
  assert.equal(t.result, null);
});

test("loadedSkills: Skill tool call and typed slash command", () => {
  const viaTool = parseTranscript(fx("skill-tool.jsonl"));
  assert.deepEqual([...loadedSkills(viaTool, "Interview me")], ["grill"]);
  const typed = parseTranscript(fx("read-only.jsonl"));
  assert.deepEqual([...loadedSkills(typed, "/start what does the README say?")], ["start"]);
  assert.deepEqual([...loadedSkills(typed, "/nosuch thing")], []);
  assert.deepEqual([...loadedSkills(typed, "plain prompt")], []);
});

// ---------------------------------------------------------------- asserts

function repoWithSetup(setup) {
  const layout = makeLayout({ base: TEST_BASE });
  const baseline = prepareSetup(setup, layout);
  return { layout, baseline, done: () => rmSync(layout.root, { recursive: true, force: true }) };
}

function check(spec, { fixture = "read-only.jsonl", text, prompt = "/start x", setup = { gitInit: true, files: [{ path: "a.txt", content: "hello\n" }] }, mutate } = {}) {
  const r = repoWithSetup(setup);
  try {
    if (mutate) mutate(r.layout);
    const results = evaluateAsserts(spec, { transcript: parseTranscript(text ?? fx(fixture)), prompt, layout: r.layout, baseline: r.baseline });
    return Object.fromEntries(results.map((x) => [x.name, x.pass]));
  } finally {
    r.done();
  }
}

test("assert runCompleted: success passes, error and missing result fail", () => {
  assert.equal(check({ outputMatches: ["."] }).runCompleted, true);
  const r = repoWithSetup({});
  const bad = parseTranscript('{"type":"result","subtype":"error_max_budget_usd","is_error":true,"total_cost_usd":1,"num_turns":3}');
  assert.equal(evaluateAsserts({ outputMatches: ["."] }, { transcript: bad, prompt: "", layout: r.layout, baseline: null })[0].pass, false);
  assert.equal(evaluateAsserts({ outputMatches: ["."] }, { transcript: parseTranscript(""), prompt: "", layout: r.layout, baseline: null })[0].pass, false);
  r.done();
});

test("assert skillLoaded / skillNotLoaded", () => {
  const r = check({ skillLoaded: ["start", "grill"], skillNotLoaded: ["start", "decide"] });
  assert.equal(r["skillLoaded:start"], true);
  assert.equal(r["skillLoaded:grill"], false);
  assert.equal(r["skillNotLoaded:start"], false);
  assert.equal(r["skillNotLoaded:decide"], true);
  const viaTool = check({ skillLoaded: ["grill"] }, { fixture: "skill-tool.jsonl", prompt: "Interview me" });
  assert.equal(viaTool["skillLoaded:grill"], true);
});

test("assert toolCalled / toolNotCalled, with inputMatches", () => {
  const r = check({
    toolCalled: ["Write", "Edit", { name: "Bash", inputMatches: "printenv" }, { name: "Bash", inputMatches: "rm -rf" }],
    toolNotCalled: ["Edit", "Write", { name: "Bash", inputMatches: "rm -rf" }, { name: "Bash", inputMatches: "printenv" }],
  });
  assert.equal(r["toolCalled:Write"], true);
  assert.equal(r["toolCalled:Edit"], false);
  assert.equal(r["toolCalled:Bash~printenv"], true);
  assert.equal(r["toolCalled:Bash~rm -rf"], false);
  assert.equal(r["toolNotCalled:Edit"], true);
  assert.equal(r["toolNotCalled:Write"], false);
  assert.equal(r["toolNotCalled:Bash~rm -rf"], true);
  assert.equal(r["toolNotCalled:Bash~printenv"], false);
});

test("assert outputMatches / outputNotMatches", () => {
  const r = check({ outputMatches: ["no README", "/NO readme/i", "absent phrase"], outputNotMatches: ["no README", "absent phrase"] });
  assert.equal(r["outputMatches:no README"], true);
  assert.equal(r["outputMatches:/NO readme/i"], true);
  assert.equal(r["outputMatches:absent phrase"], false);
  assert.equal(r["outputNotMatches:no README"], false);
  assert.equal(r["outputNotMatches:absent phrase"], true);
});

test("assert fileExists / fileAbsent / fileMatches, in the repo and in $TMPDIR", () => {
  const r = check(
    {
      fileExists: ["a.txt", "nope.txt", "$TMPDIR/sstack/note.md", "$TMPDIR/missing.md"],
      fileAbsent: ["a.txt", "nope.txt", "$TMPDIR/sstack/note.md"],
      fileMatches: [{ path: "a.txt", pattern: "^hel+o" }, { path: "a.txt", pattern: "bye" }, { path: "nope.txt", pattern: "." }],
    },
    { mutate: (l) => { mkdirSync(join(l.tmp, "sstack")); writeFileSync(join(l.tmp, "sstack", "note.md"), "n"); } },
  );
  assert.equal(r["fileExists:a.txt"], true);
  assert.equal(r["fileExists:nope.txt"], false);
  assert.equal(r["fileExists:$TMPDIR/sstack/note.md"], true);
  assert.equal(r["fileExists:$TMPDIR/missing.md"], false);
  assert.equal(r["fileAbsent:a.txt"], false);
  assert.equal(r["fileAbsent:nope.txt"], true);
  assert.equal(r["fileAbsent:$TMPDIR/sstack/note.md"], false);
  assert.equal(r["fileMatches:a.txt~^hel+o"], true);
  assert.equal(r["fileMatches:a.txt~bye"], false);
  assert.equal(r["fileMatches:nope.txt~."], false);
});

test("assert paths cannot leave the repo", () => {
  const r = check({ fileExists: ["../secret.txt"], fileAbsent: ["../secret.txt"] }, { mutate: (l) => writeFileSync(join(l.root, "secret.txt"), "s") });
  assert.equal(r["fileExists:../secret.txt"], false);
  assert.equal(r["fileAbsent:../secret.txt"], false);
});

test("assert gitBranchExists and gitCommitCountOn count only new commits", () => {
  const r = check(
    { gitBranchExists: ["feature", "ghost"], gitCommitCountOn: { feature: 2, main: 0 } },
    {
      mutate: (l) => {
        git(l.repo, ["switch", "-q", "-c", "feature"]);
        git(l.repo, ["commit", "-q", "--allow-empty", "-m", "one"]);
        git(l.repo, ["commit", "-q", "--allow-empty", "-m", "two"]);
      },
    },
  );
  assert.equal(r["gitBranchExists:feature"], true);
  assert.equal(r["gitBranchExists:ghost"], false);
  assert.equal(r["gitCommitCountOn:feature=2"], true);
  assert.equal(r["gitCommitCountOn:main=0"], true);
  const w = check({ gitCommitCountOn: { feature: 1, ghost: 0, other: { min: 1 } } }, { mutate: (l) => { git(l.repo, ["switch", "-q", "-c", "feature"]); git(l.repo, ["commit", "-q", "--allow-empty", "-m", "a"]); git(l.repo, ["commit", "-q", "--allow-empty", "-m", "b"]); } });
  assert.equal(w["gitCommitCountOn:feature=1"], false);
  assert.equal(w["gitCommitCountOn:ghost=0"], false);
  const range = check({ gitCommitCountOn: { main: { min: 1, max: 2 } } }, { mutate: (l) => git(l.repo, ["commit", "-q", "--allow-empty", "-m", "x"]) });
  assert.equal(range['gitCommitCountOn:main={"min":1,"max":2}'], true);
});

test("assert hookBlocked / hookNotBlocked", () => {
  const blocked = check({ hookBlocked: true, hookNotBlocked: true }, { fixture: "hook-block.jsonl" });
  assert.equal(blocked.hookBlocked, true);
  assert.equal(blocked.hookNotBlocked, false);
  const re = check({ hookBlocked: "main or master", outputMatches: ["x"] }, { fixture: "hook-block.jsonl" });
  assert.equal(re["hookBlocked:main or master"], true);
  const wrong = check({ hookBlocked: "force push" }, { fixture: "hook-block.jsonl" });
  assert.equal(wrong["hookBlocked:force push"], false);
  const none = check({ hookBlocked: true, hookNotBlocked: true });
  assert.equal(none.hookBlocked, false);
  assert.equal(none.hookNotBlocked, true);
});

test("assert noRepoChanges: file edit, new file, new branch and new commit each fail", () => {
  const same = (mutate) => check({ noRepoChanges: true }, { mutate }).noRepoChanges;
  assert.equal(same(undefined), true);
  assert.equal(same((l) => writeFileSync(join(l.repo, "a.txt"), "changed\n")), false);
  assert.equal(same((l) => writeFileSync(join(l.repo, "new.txt"), "x")), false);
  assert.equal(same((l) => git(l.repo, ["branch", "side"])), false);
  assert.equal(same((l) => git(l.repo, ["commit", "-q", "--allow-empty", "-m", "x"])), false);
  // files outside the repo do not count
  assert.equal(same((l) => writeFileSync(join(l.tmp, "note.md"), "x")), true);
});

// ---------------------------------------------------------------- setup

test("prepareSetup: git, files, branch, origin, githooks", () => {
  const { layout, baseline, done } = repoWithSetup({
    gitInit: true, branch: "work", origin: true, githooks: true,
    files: [{ path: "src/a.mjs", content: "export {};\n" }],
  });
  assert.equal(readFileSync(join(layout.repo, "src", "a.mjs"), "utf8"), "export {};\n");
  assert.equal(git(layout.repo, ["branch", "--show-current"]).out, "work");
  assert.equal(git(layout.repo, ["remote", "get-url", "origin"]).out, layout.origin);
  assert.equal(git(layout.repo, ["config", "core.hooksPath"]).out, ".githooks");
  assert.equal(git(layout.repo, ["status", "--porcelain"]).out, "");
  assert.match(baseline.head, /^[0-9a-f]{40}$/);
  done();
});

test("setup: a file under .claude/ or .git/ is refused, a ref under .git/refs/ is allowed", () => {
  const withFile = (path, key = "files") => ({ ...GOOD, setup: { gitInit: true, [key]: [{ path, content: "{}" }] } });
  for (const path of [".claude/settings.json", ".claude/settings.local.json", "./.Claude/hooks/x.mjs", "sub/.claude/settings.json", ".git/config", ".git/hooks/pre-commit", ".GIT/config", "sub/.git/config", ".git/refs/x/.git/config"]) {
    assert.throws(() => parseEvalFile(evalText(withFile(path))), /under \.claude\/ or \.git\/.*Fix: /, path);
    assert.throws(() => parseEvalFile(evalText(withFile(path, "uncommitted"))), /under \.claude\/ or \.git\//, path);
  }
  parseEvalFile(evalText(withFile(".git/refs/remotes/origin/main")));
  parseEvalFile(evalText(withFile(".claudeignore")));
  const layout = makeLayout({ base: TEST_BASE });
  try {
    assert.throws(() => prepareSetup({ gitInit: true, files: [{ path: ".git/config", content: "[core]\n" }] }, layout), /not safe/);
  } finally {
    rmSync(layout.root, { recursive: true, force: true });
  }
});

test("setup: the fake gh state under .git/fake-gh/ is allowed, other .git paths stay refused", () => {
  const withFile = (path, key = "files") => ({ ...GOOD, setup: { gitInit: true, [key]: [{ path, content: "{}" }] } });
  parseEvalFile(evalText(withFile(".git/fake-gh/scenario.json")));
  parseEvalFile(evalText(withFile(".git/fake-gh/scenario.json", "uncommitted")));
  assert.equal(isGuardPath(".git/fake-gh/scenario.json"), false);
  for (const path of [".git/hooks/x", ".git/config", ".git/fake-gh/../hooks/x", ".git/refs/../config", ".git/fake-ghx/a", "sub/.git/fake-gh/a", ".git/fake-gh/.git/config"]) {
    assert.equal(isGuardPath(path), true, path);
  }
  for (const path of [".git/hooks/x", ".git/config", ".git/fake-ghx/a", ".git/fake-gh/.git/config"]) {
    assert.throws(() => parseEvalFile(evalText(withFile(path))), /under \.claude\/ or \.git\//, path);
  }
  assert.throws(() => parseEvalFile(evalText(withFile(".git/fake-gh/../hooks/x"))), /must be relative and stay inside the repo/);
});

test("setup remote: adds an https remote origin, and refuses other values", () => {
  const { layout, done } = repoWithSetup({ gitInit: true, remote: "https://github.com/acme/widgets.git" });
  assert.equal(git(layout.repo, ["remote", "get-url", "origin"]).out, "https://github.com/acme/widgets.git");
  done();
  const bad = (setup, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, setup })), re);
  bad({ gitInit: true, remote: "ext::sh -c x" }, /setup\.remote must be an https URL/);
  bad({ gitInit: true, remote: "https://github.com/acme/w.git", origin: true }, /"remote" and "origin"/);
  bad({ remote: "https://github.com/acme/w.git" }, /need "gitInit"/);
});

test("git env: GIT_DIR and a global core.hooksPath of the owner do not reach the setup, the installer or the agent", () => {
  const outside = tmp();
  spawnSync("git", ["init", "-q", outside]);
  const hooksConfig = join(outside, "global.gitconfig");
  writeFileSync(hooksConfig, "[core]\n\thooksPath = /nowhere\n");
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL };
  process.env.GIT_DIR = join(outside, ".git");
  process.env.GIT_CONFIG_GLOBAL = hooksConfig;
  let r;
  try {
    r = repoWithSetup({ gitInit: true, installStack: true, files: [{ path: "a.txt", content: "a\n" }] });
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    assert.equal(spawnSync("git", ["-C", outside, "rev-parse", "--verify", "-q", "HEAD"], { encoding: "utf8", env: withoutGitVars(process.env) }).status, 1, "no commit in the outside repo");
    assert.match(r.baseline.head, /^[0-9a-f]{40}$/);
    assert.equal(git(r.layout.repo, ["config", "--local", "core.hooksPath"]).out, ".githooks");
    const env = agentEnv({ PATH: "/bin", GIT_DIR: "/x", GIT_WORK_TREE: "/y", GIT_INDEX_FILE: "/z" }, r.layout);
    assert.deepEqual(Object.keys(env).filter((k) => k.startsWith("GIT_")).sort(), ["GIT_AUTHOR_EMAIL", "GIT_AUTHOR_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_NAME", "GIT_TERMINAL_PROMPT"]);
  } finally {
    r.done();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("prepareSetup: commit false leaves files uncommitted", () => {
  const { layout, done } = repoWithSetup({ gitInit: true, commit: false, files: [{ path: "a", content: "1" }] });
  assert.match(git(layout.repo, ["status", "--porcelain"]).out, /\?\? a/);
  done();
});

test("prepareSetup: installStack runs the installer of the given stack", () => {
  const stack = tmp();
  mkdirSync(join(stack, "scripts"));
  writeFileSync(join(stack, "scripts", "install.mjs"), 'import {writeFileSync} from "node:fs"; import {join} from "node:path"; writeFileSync(join(process.argv[2], "INSTALLED"), "yes");\n');
  const layout = makeLayout({ stackRoot: stack, base: TEST_BASE });
  prepareSetup({ gitInit: true, installStack: true }, layout, { stackRoot: stack });
  assert.equal(readFileSync(join(layout.repo, "INSTALLED"), "utf8"), "yes");
  assert.equal(git(layout.repo, ["status", "--porcelain"]).out, "");
  rmSync(layout.root, { recursive: true });
  rmSync(stack, { recursive: true });
});

test("makeLayout: refuses a folder inside a git repo or inside the stack", () => {
  const repo = tmp();
  spawnSync("git", ["init", "-q"], { cwd: repo });
  assert.throws(() => makeLayout({ base: repo }), UsageError);
  assert.deepEqual(readdirSync(repo).filter((n) => n.startsWith("eval-run-")), []);
  const stack = tmp();
  assert.throws(() => makeLayout({ stackRoot: stack, base: stack }), UsageError);
  rmSync(repo, { recursive: true });
  rmSync(stack, { recursive: true });
});

// ---------------------------------------------------------------- summary

test("runBudget and buildPlan", () => {
  assert.equal(runBudget({}, undefined), 1);
  assert.equal(runBudget({ budgetUsd: 2 }, undefined), 2);
  assert.equal(runBudget({ budgetUsd: 2 }, 0.5), 0.5);
  assert.equal(runBudget({ budgetUsd: 0.2 }, 0.5), 0.2);
  const plan = buildPlan([{ manual: true, rel: "m" }, { manual: false, rel: "a", checks: { budgetUsd: 0.5 } }, { manual: false, rel: "b", checks: {} }], { models: ["x", "y"], runs: 3, capUsd: undefined });
  assert.equal(plan.totalCapUsd, 0.5 * 6 + 1 * 6);
  assert.equal(plan.items[0].runnable, false);
});

test("summarize and formatReport", () => {
  const rec = (pass, model, failed = []) => ({ skill: "grill", eval: "01.md", model, pass, costUsd: 0.1, asserts: failed.map((n) => ({ name: n, pass: false })) });
  const rows = summarize([rec(true, "a"), rec(false, "a", ["skillLoaded:grill"]), rec(false, "a", ["skillLoaded:grill", "noRepoChanges"]), rec(true, "b")], 0.5);
  const a = rows.find((r) => r.model === "a");
  assert.deepEqual([a.runs, a.passes, a.meets], [3, 1, false]);
  assert.deepEqual(a.failed, { "skillLoaded:grill": 2, noRepoChanges: 1 });
  assert.equal(rows.find((r) => r.model === "b").meets, true);
  assert.equal(summarize([rec(false, "a")], 0.5)[0].meets, false);
  assert.equal(summarize([rec(true, "a"), rec(false, "a")], 0.5)[0].meets, true);
  const text = formatReport(rows, ["x/01-manual.md"]);
  assert.match(text, /Skill: grill/);
  assert.match(text, /33%/);
  assert.match(text, /skillLoaded:grill x2/);
  assert.match(text, /Manual only[^\n]*\n\s+x\/01-manual\.md/);
});

// ---------------------------------------------------------------- binary choice

test("isWrapper: a shebang file and a file under cmux-cli-shims are wrappers, a plain binary is not", () => {
  const d = tmp();
  assert.equal(isWrapper(putClaude(join(d, "a"), WRAPPER)), true);
  assert.equal(isWrapper(putClaude(join(d, "cmux-cli-shims", "ID"), REAL)), true);
  assert.equal(isWrapper(putClaude(join(d, "b"), REAL)), false);
  rmSync(d, { recursive: true });
});

test("findClaude: a wrapper first and a real binary second picks the real one", () => {
  const d = tmp();
  const wrapper = putClaude(join(d, "shim"), WRAPPER);
  const real = putClaude(join(d, "real"), REAL);
  const skipped = [];
  assert.equal(findClaude({ pathEnv: [join(d, "shim"), join(d, "real")].join(":"), home: d, skipped }), real);
  assert.deepEqual(skipped, [wrapper]);
  rmSync(d, { recursive: true });
});

test("findClaude: a symlink to a real binary is accepted", () => {
  const d = tmp();
  const real = putClaude(join(d, "versions"), REAL);
  mkdirSync(join(d, "bin"));
  symlinkSync(real, join(d, "bin", "claude"));
  assert.equal(findClaude({ pathEnv: join(d, "bin"), home: d }), join(d, "bin", "claude"));
  assert.equal(isWrapper(join(d, "bin", "claude")), false);
  rmSync(d, { recursive: true });
});

test("findClaude: a symlink to a script is a wrapper, and so is a binary behind a cmux-cli-shims path", () => {
  const d = tmp();
  const script = putClaude(join(d, "scripts"), WRAPPER);
  mkdirSync(join(d, "bin"));
  symlinkSync(script, join(d, "bin", "claude"));
  assert.equal(findClaude({ pathEnv: join(d, "bin"), home: d }), null);
  const shim = putClaude(join(d, "cmux-cli-shims", "ID"), REAL);
  assert.equal(findClaude({ pathEnv: dirname(shim), home: d }), null);
  rmSync(d, { recursive: true });
});

test("resolveClaude: --claude wins over CLAUDE_BIN, CLAUDE_BIN wins over PATH", () => {
  const d = tmp();
  const flag = putClaude(join(d, "flag"), REAL);
  const envBin = putClaude(join(d, "env"), REAL);
  const onPath = putClaude(join(d, "path"), REAL);
  const base = { pathEnv: dirname(onPath), home: d };
  assert.deepEqual(resolveClaude({ flag, env: { CLAUDE_BIN: envBin }, ...base }), { path: flag, source: "--claude" });
  assert.deepEqual(resolveClaude({ env: { CLAUDE_BIN: envBin }, ...base }), { path: envBin, source: "CLAUDE_BIN" });
  assert.deepEqual(resolveClaude({ env: {}, ...base }), { path: onPath, source: "PATH" });
  assert.match(resolveClaude({ flag: join(d, "none"), env: {}, ...base }).error, /not a file.* Fix: /);
  rmSync(d, { recursive: true });
});

test("resolveClaude: only a wrapper gives an error of the form 'what failed. Fix: what to do.'", () => {
  const d = tmp();
  const wrapper = putClaude(join(d, "shim"), WRAPPER);
  const r = resolveClaude({ env: {}, pathEnv: dirname(wrapper), home: d });
  assert.equal(r.path, undefined);
  assert.match(r.error, /^Every claude on PATH is a wrapper script .*\. Fix: .*\.$/);
  assert.match(resolveClaude({ env: {}, pathEnv: join(d, "empty"), home: d }).error, /^No claude binary is on PATH.*\. Fix: .*\.$/);
  rmSync(d, { recursive: true });
});

test("childEnv: removes CMUX_ variables and the cmux-cli-shims folders of PATH, and keeps the rest", async () => {
  const env = childEnv({ CMUX_SOCKET: "/s", CMUX_CLAUDE_WRAPPER_SHIM_ROOT: "/r", HOME: "/h", PATH: "/a:/x/cmux-cli-shims/ID:/b" });
  assert.deepEqual(env, { HOME: "/h", PATH: "/a:/b" });
});

// ---------------------------------------------------------------- end to end with a fake agent

function fakeStack(evals) {
  const stack = tmp();
  for (const [rel, text] of Object.entries(evals)) {
    mkdirSync(join(stack, "evals", dirname(rel)), { recursive: true });
    writeFileSync(join(stack, "evals", rel), text);
  }
  return stack;
}

async function run(stack, argv, spawn) {
  const out = [];
  const err = [];
  const code = await main(argv, { stackRoot: stack, stdout: (s) => out.push(s), stderr: (s) => err.push(s), spawn, base: TEST_BASE });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const SIMPLE = { prompt: "/start x", allowedTools: ["Read"], setup: { gitInit: true }, assert: { skillLoaded: ["start"], noRepoChanges: true } };

test("main: all runs pass, exit 0, results file written", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE), "s/02-manual.md": "# manual\n" });
  const outDir = join(tmp(), "out");
  const seen = [];
  const r = await run(stack, ["--out", outDir, "--runs", "2", "--models", "m1,m2", "--claude", process.execPath], (cmd, args, o) => {
    seen.push({ args, cwd: o.cwd, tmpdir: o.env.TMPDIR });
    return { status: 0, signal: null, stdout: fx("read-only.jsonl"), stderr: "", error: null };
  });
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(seen.length, 4);
  assert.deepEqual(seen.map((s) => s.args[s.args.indexOf("--model") + 1]), ["m1", "m1", "m2", "m2"]);
  assert.ok(seen.every((s) => s.cwd.includes("eval-run-") && !s.cwd.startsWith(stack) && s.tmpdir.includes("eval-run-")));
  assert.ok(seen.every((s) => !existsSync(s.cwd)), "temp folders are deleted");
  const res = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));
  assert.equal(res.runs.length, 4);
  assert.equal(res.summary[0].passRate, 1);
  assert.deepEqual(res.manualOnly, ["s/02-manual.md"]);
  assert.equal(readdirSync(join(outDir, "transcripts")).length, 4);
  assert.match(r.out, /Manual only[^\n]*\n\s+s\/02-manual\.md/);
});

test("main: a failing assert gives exit 1 and names the assert; --min-pass-rate can allow it", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, assert: { skillLoaded: ["grill"] } }) });
  let n = 0;
  const spawn = () => ({ status: 0, signal: null, stdout: fx(n++ % 2 === 0 ? "skill-tool.jsonl" : "read-only.jsonl"), stderr: "", error: null });
  const base = ["--out", join(tmp(), "o"), "--runs", "2", "--claude", process.execPath];
  const r = await run(stack, base, spawn);
  assert.equal(r.code, 1);
  assert.match(r.out, /skillLoaded:grill x1/);
  assert.match(r.out, /50%/);
  n = 0;
  assert.equal((await run(stack, [...base, "--min-pass-rate", "0.5"], spawn)).code, 0);
});

test("main: dry run prints the plan and the cap and runs nothing", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, budgetUsd: 0.5 }) });
  const r = await run(stack, ["--dry-run", "--runs", "3", "--models", "a,b"], () => assert.fail("must not run"));
  assert.equal(r.code, 0);
  assert.match(r.out, /s\/01-a\.md: 6 run\(s\), budget 0\.5 USD each/);
  assert.match(r.out, /Total budget cap: 3\.00 USD/);
});

test("main: usage and setup errors give exit 2", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE), "t/01-bad.md": evalText("{oops") });
  const never = () => assert.fail("must not run");
  assert.equal((await run(stack, ["--runs", "0"], never)).code, 2);
  assert.equal((await run(stack, ["--skill", "nosuch"], never)).code, 2);
  const bad = await run(stack, ["--skill", "t", "--dry-run"], never);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /t\/01-bad\.md: the Checks block is not valid JSON/);
  assert.equal((await run(stack, ["--skill", "s", "--claude", "/no/such/claude"], never)).code, 2);
});

test("main: refuses an eval with network tools unless --allow-network", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, allowedTools: ["Read", "Bash(gh pr create:*)"] }) });
  const never = () => assert.fail("must not run");
  const r = await run(stack, ["--claude", process.execPath], never);
  assert.equal(r.code, 2);
  assert.match(r.err, /can write to the network/);
  let called = 0;
  const ok = await run(stack, ["--claude", process.execPath, "--allow-network", "--out", join(tmp(), "o")], (cmd, args) => {
    called++;
    assert.ok(!args.includes("--disallowedTools"));
    return { status: 0, signal: null, stdout: fx("read-only.jsonl"), stderr: "", error: null };
  });
  assert.equal(called, 1);
  assert.equal(ok.code, 0, ok.err);
});

test("main: an agent that gives no stream is a setup error and stops the run", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE), "s/02-b.md": evalText(SIMPLE) });
  let calls = 0;
  const r = await run(stack, ["--claude", process.execPath, "--out", join(tmp(), "o")], () => {
    calls++;
    return { status: 1, signal: null, stdout: "", stderr: "Not logged in", error: null };
  });
  assert.equal(r.code, 2);
  assert.equal(calls, 1);
  assert.match(r.err, /Not logged in/);
});

test("runOnce: a run that changes the repo fails noRepoChanges, and the temp folder is deleted", async () => {
  let cwd;
  const r = await runOnce({
    checks: SIMPLE, model: null, claudePath: "c", budgetUsd: 1, timeoutMs: 1000, base: TEST_BASE,
    spawn: (cmd, args, o) => {
      cwd = o.cwd;
      writeFileSync(join(o.cwd, "oops.txt"), "x");
      return { status: 0, signal: null, stdout: fx("read-only.jsonl"), stderr: "", error: null };
    },
  });
  assert.equal(r.pass, false);
  assert.deepEqual(r.asserts.filter((a) => !a.pass).map((a) => a.name), ["noRepoChanges"]);
  assert.equal(existsSync(cwd), false);
  assert.equal(r.costUsd > 0, true);
});

test("runOnce: a budget stop fails runCompleted", async () => {
  const stream = fx("read-only.jsonl").replace('"subtype":"success"', '"subtype":"error_max_budget_usd"');
  const r = await runOnce({ checks: { ...SIMPLE, assert: { outputMatches: ["."] } }, model: null, claudePath: "c", budgetUsd: 1, timeoutMs: 1000, base: TEST_BASE, spawn: () => ({ status: 1, signal: null, stdout: stream, stderr: "", error: null }) });
  assert.deepEqual(r.asserts.filter((a) => !a.pass).map((a) => a.name), ["runCompleted"]);
});

test("the script runs from the command line: --help exits 0 and a bad flag exits 2", async () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--help"]).status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--bogus"]).status, 2);
  const dry = spawnSync(process.execPath, [SCRIPT, "--dry-run", "--eval", "_smoke/01-read-only.md"], { encoding: "utf8" });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Total budget cap: 1\.00 USD/);
});

// ---------------------------------------------------------------- binary choice in main

const OKRUN = () => ({ status: 0, signal: null, stdout: fx("read-only.jsonl"), stderr: "", error: null });

async function runWith(stack, argv, { env, home }, spawn = OKRUN) {
  const out = [];
  const err = [];
  const code = await main(argv, { stackRoot: stack, stdout: (x) => out.push(x), stderr: (x) => err.push(x), spawn, base: TEST_BASE, env, home });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("main: a PATH with a wrapper first and a real binary second runs the real one and records it", async () => {
  const d = tmp();
  putClaude(join(d, "shim"), WRAPPER);
  const real = putClaude(join(d, "real"), REAL);
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  const outDir = join(tmp(), "out");
  const cmds = [];
  const r = await runWith(stack, ["--out", outDir], { env: { PATH: [join(d, "shim"), join(d, "real")].join(":") }, home: d }, (cmd) => (cmds.push(cmd), OKRUN()));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(cmds, [real]);
  assert.match(r.out, new RegExp(`Claude binary: ${real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(from PATH\\)`));
  const results = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));
  assert.deepEqual(results.claudeBinary, { path: real, source: "PATH" });
  rmSync(d, { recursive: true });
});

test("main: a PATH with only a wrapper exits 2 with a Fix message and runs nothing", async () => {
  const d = tmp();
  putClaude(join(d, "shim"), WRAPPER);
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  const r = await runWith(stack, ["--out", join(tmp(), "out")], { env: { PATH: join(d, "shim") }, home: d }, () => assert.fail("must not run"));
  assert.equal(r.code, 2);
  assert.match(r.err, /wrapper script.*\. Fix: /);
  rmSync(d, { recursive: true });
});

test("main: --claude wins over CLAUDE_BIN, CLAUDE_BIN wins over PATH, and results.json names the source", async () => {
  const d = tmp();
  const flag = putClaude(join(d, "flag"), REAL);
  const envBin = putClaude(join(d, "env"), REAL);
  const onPath = putClaude(join(d, "path"), REAL);
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  const pick = async (argv, env) => {
    const outDir = join(tmp(), "out");
    const cmds = [];
    const r = await runWith(stack, [...argv, "--out", outDir], { env: { PATH: dirname(onPath), ...env }, home: d }, (cmd) => (cmds.push(cmd), OKRUN()));
    assert.equal(r.code, 0, r.err);
    return [cmds[0], JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")).claudeBinary.source];
  };
  assert.deepEqual(await pick(["--claude", flag], { CLAUDE_BIN: envBin }), [flag, "--claude"]);
  assert.deepEqual(await pick([], { CLAUDE_BIN: envBin }), [envBin, "CLAUDE_BIN"]);
  assert.deepEqual(await pick([], {}), [onPath, "PATH"]);
  rmSync(d, { recursive: true });
});

test("main: --dry-run prints the binary it would use and exits 0 even when none is found", async () => {
  const d = tmp();
  const real = putClaude(join(d, "real"), REAL);
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  const a = await runWith(stack, ["--dry-run"], { env: { PATH: dirname(real) }, home: d }, () => assert.fail("must not run"));
  assert.equal(a.code, 0);
  assert.match(a.out, /Claude binary: .*real\/claude \(from PATH\)/);
  const b = await runWith(stack, ["--dry-run"], { env: { PATH: join(d, "none") }, home: d }, () => assert.fail("must not run"));
  assert.equal(b.code, 0);
  assert.match(b.out, /Claude binary: none/);
  rmSync(d, { recursive: true });
});

test("runOnce: the child env has no CMUX_ variable and no cmux-cli-shims folder in PATH", async () => {
  let seen;
  await runOnce({
    checks: SIMPLE, model: null, claudePath: "c", budgetUsd: 1, timeoutMs: 1000, base: TEST_BASE,
    baseEnv: { CMUX_SOCKET: "/s", CMUX_CLAUDE_HOOK_SPOOL_DIR: "/x", KEEP_ME: "1", PATH: "/a:/home/u/.cmuxterm/cmux-cli-shims/ID:/b" },
    spawn: (cmd, args, o) => ((seen = o.env), OKRUN()),
  });
  assert.deepEqual(Object.keys(seen).filter((k) => k.startsWith("CMUX_")), []);
  assert.equal(seen.KEEP_ME, "1");
  assert.equal(seen.PATH, "/a:/b");
});

// ---------------------------------------------------------------- new features

/** A stream with one session, optional tool calls and one text. */
function stream({ session = "11111111-1111-4111-8111-111111111111", text = "ok", tools = [], cost = 0.01, skills = ["start"], subtype = "success" } = {}) {
  const ev = [
    { type: "system", subtype: "init", session_id: session, skills },
    ...tools.map((t, i) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: `t${i}`, name: t.name, input: t.input ?? {} }] } })),
    { type: "assistant", message: { content: [{ type: "text", text }] } },
    { type: "result", subtype, is_error: subtype !== "success", total_cost_usd: cost, num_turns: 2, session_id: session },
  ];
  return ev.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
const okSpawn = (stdout) => () => ({ status: 0, signal: null, stdout, stderr: "", error: null });
const base1 = { model: null, claudePath: "c", budgetUsd: 1, timeoutMs: 1000, base: TEST_BASE };

test("buildCommand: tools maps to --tools, disallowedTools is added to the network deny list, allowedTools is unchanged", () => {
  const a = buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read", "Bash"], budgetUsd: 1, tools: ["Read", "Grep"], disallowedTools: ["Edit"] }).args;
  const at = (f) => a[a.indexOf(f) + 1];
  assert.equal(at("--tools"), "Read,Grep");
  assert.equal(at("--allowedTools"), "Read,Bash");
  assert.match(at("--disallowedTools"), /^Bash\(gh:\*\),.*,Edit$/);
  const b = buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, allowNetwork: true, disallowedTools: ["Edit"] }).args;
  assert.equal(b[b.indexOf("--disallowedTools") + 1], "Edit");
  const none = buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, tools: [] }).args;
  assert.equal(none[none.indexOf("--tools") + 1], "");
  assert.ok(!buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1 }).args.includes("--tools"));
});

test("buildCommand: permissionMode maps to --permission-mode, resume and persistence", () => {
  const a = buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, permissionMode: "acceptEdits" }).args;
  assert.equal(a[a.indexOf("--permission-mode") + 1], "acceptEdits");
  const r = buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, resumeId: "abc", persistSession: true }).args;
  assert.equal(r[r.indexOf("--resume") + 1], "abc");
  assert.ok(!r.includes("--no-session-persistence"));
  assert.ok(buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1 }).args.includes("--no-session-persistence"));
  assert.throws(() => buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, permissionMode: "bypassPermissions" }), /bypassPermissions|not allowed/);
});

test("forbidden flags: only real names, and unsafe settings or extra arguments are refused", () => {
  assert.ok(!FORBIDDEN_FLAGS.includes("--no-hooks") && !FORBIDDEN_FLAGS.includes("--disable-hooks"));
  for (const f of ["--dangerously-skip-permissions", "--bare", "--safe-mode"]) assert.ok(FORBIDDEN_FLAGS.includes(f), f);
  for (const bad of [
    ["--settings", '{"disableAllHooks": true}'], ["--settings", '{"DISABLEALLHOOKS":true}'], ["--bare"], ["--dangerously-skip-permissions"],
    ["--settings", '{"permissions":{"defaultMode":"bypassPermissions"}}'], ["--add-dir=/x"], ["--setting-sources", "user"], ["--permission-mode", "plan"],
  ]) assert.throws(() => assertSafeArgs(["-p", "hi", ...bad]), UsageError, bad.join(" "));
  assert.throws(() => buildCommand({ claudePath: "c", prompt: "p", allowedTools: ["Read"], budgetUsd: 1, extraArgs: ["--settings", '{"disableAllHooks":true}'] }), /Fix: /);
  assert.doesNotThrow(() => assertSafeArgs(["-p", "--settings", baselineSettings("start"), "--", "explain --bare and disableAllHooks"]));
  assert.throws(() => assertSafeArgs(["-p", "--bare", "--", "hi"]), UsageError);
  assert.equal(forbiddenText("x bypassPermissions"), "bypassPermissions");
  assert.equal(forbiddenText("Read"), null);
  const bad = (c, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, ...c })), re);
  bad({ tools: ["Read", "--bare"] }, /forbidden text/);
  bad({ allowedTools: ["disableAllHooks"] }, /forbidden text/);
  bad({ permissionMode: "bypassPermissions" }, /permissionMode/);
});

test("validateChecks: new fields", () => {
  const ok = (c) => parseEvalFile(evalText({ ...GOOD, ...c }));
  ok({ tools: ["Read"], disallowedTools: ["Bash"], turns: ["next"], baseline: { skill: "start" }, set: "capability", permissionMode: "dontAsk" });
  ok({ tools: [] });
  const bad = (c, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, ...c })), re);
  bad({ tools: "Read" }, /"tools" must be a list.*Fix: /);
  bad({ tools: ["a,b"] }, /"tools"/);
  bad({ disallowedTools: [] }, /disallowedTools/);
  bad({ turns: [] }, /"turns"/);
  bad({ turns: [""] }, /"turns"/);
  bad({ baseline: { skill: "../x" } }, /"baseline"/);
  bad({ baseline: { skill: "a", x: 1 } }, /"baseline"/);
  bad({ set: "other" }, /"set".*Fix: /);
  bad({ permissionMode: "plan" }, /permissionMode/);
  bad({ assert: { outputMatches: [{ pattern: "x", turn: 2 }] } }, /turn/);
  ok({ turns: ["b"], assert: { outputMatches: [{ pattern: "x", turn: 2 }] } });
  bad({ turns: ["b"], assert: { toolCalled: [{ name: "Read", turn: 3 }] } }, /turn/);
  bad({ assert: { toolOrder: [{ before: "Read" }] } }, /toolOrder/);
  bad({ assert: { onlyFilesChanged: ["../x"] } }, /globs/);
  bad({ assert: { scriptPasses: [{ script: "eval-run" }] } }, /scriptPasses/);
  bad({ assert: { scriptPasses: [{ script: "../x" }] } }, /scriptPasses/);
  bad({ assert: { scriptPasses: [{ skill: "../x", script: "lint" }] } }, /scriptPasses/);
  bad({ assert: { scriptPasses: [{ skill: "Bad Name", script: "lint" }] } }, /scriptPasses/);
  bad({ assert: { scriptPasses: [{ skill: 3, script: "lint" }] } }, /scriptPasses/);
  bad({ assert: { scriptPasses: [{ skill: "x", script: "eval-run" }] } }, /scriptPasses/);
  bad({ assert: { gitWorktreeExists: false } }, /gitWorktreeExists/);
});

test("old eval files still parse and behave the same: string entries, no new key", () => {
  const e = parseEvalFile(evalText({ ...GOOD, assert: { skillLoaded: ["start"], outputMatches: ["x"], toolCalled: ["Read", { name: "Bash", inputMatches: "ls" }] } }));
  assert.equal(e.manual, false);
  const r = check({ skillLoaded: ["start"], outputMatches: ["no README"], toolCalled: ["Write"] });
  assert.deepEqual(Object.keys(r), ["runCompleted", "skillLoaded:start", "toolCalled:Write", "outputMatches:no README"]);
});

// hook blocks
test("hookBlocked sees a hook that blocks through onFailure: a missing script (exit 1) and a timeout", () => {
  for (const f of ["hook-onfailure-exit1.jsonl", "hook-onfailure-timeout.jsonl"]) {
    const t = parseTranscript(fx(f));
    assert.ok(t.hooks.every((h) => h.exitCode !== 2), "the exit code alone shows no block");
    assert.ok(hookBlocks(t).length >= 1, f);
    const r = check({ hookBlocked: true, hookNotBlocked: true }, { fixture: f });
    assert.equal(r.hookBlocked, true, f);
    assert.equal(r.hookNotBlocked, false, f);
  }
  assert.equal(check({ hookBlocked: "timed out" }, { fixture: "hook-onfailure-timeout.jsonl" })["hookBlocked:timed out"], true);
  assert.equal(check({ hookBlocked: "Cannot find module" }, { fixture: "hook-onfailure-exit1.jsonl" })["hookBlocked:Cannot find module"], true);
});

test("hookBlocked: the template hook (exit 2 after a missing script) counts once, and a normal run does not count", () => {
  const t = parseTranscript(fx("hook-onfailure-exit2-template.jsonl"));
  assert.deepEqual(hookBlocks(t).map((b) => b.kind), ["exit2"]);
  assert.equal(hookBlocks(parseTranscript(fx("read-only.jsonl"))).length, 0);
  const warn = '{"type":"user","message":{"content":[{"type":"tool_result","content":"PreToolUse:Bash hook error: [x]: failed"}]}}';
  assert.equal(hookBlocks(parseTranscript(warn)).length, 0, "a failure without onFailure block does not block");
});

// asserts
test("assert toolOrder: first call of A before first call of B, with input match", () => {
  const spec = { toolOrder: [
    { before: "Glob", after: "Write" }, { before: "Write", after: "Glob" }, { before: { name: "Bash", inputMatches: "printenv" }, after: "Write" },
    { before: "Edit", after: "Write" }, { before: "Glob", after: { name: "Bash", inputMatches: "nope" } },
  ] };
  const r = check(spec);
  assert.equal(r["toolOrder:Glob>Write"], true);
  assert.equal(r["toolOrder:Write>Glob"], false);
  assert.equal(r["toolOrder:Bash~printenv>Write"], true);
  assert.equal(r["toolOrder:Edit>Write"], false);
  assert.equal(r["toolOrder:Glob>Bash~nope"], false);
});

test("assert firstTextMatches", () => {
  const r = check({ firstTextMatches: ["README", "/NO readme/i", "zzz"] });
  assert.equal(r["firstTextMatches:README"], true);
  assert.equal(r["firstTextMatches:/NO readme/i"], true);
  assert.equal(r["firstTextMatches:zzz"], false);
});

test("globToRegExp", () => {
  const m = (g, f) => globToRegExp(g).test(f);
  assert.ok(m("docs/*.md", "docs/a.md") && !m("docs/*.md", "docs/x/a.md"));
  assert.ok(m("docs/**", "docs/x/y.md") && m("**/a.md", "a.md") && m("**/a.md", "x/y/a.md"));
  assert.ok(m("src/{a,b}.mjs", "src/b.mjs") && !m("src/{a,b}.mjs", "src/c.mjs"));
  assert.ok(m("a?.txt", "ab.txt") && !m("a?.txt", "a/.txt") && !m("a.txt", "axtxt"));
});

test("assert fileMatchesGlob and onlyFilesChanged", () => {
  const spec = { fileMatchesGlob: ["docs/*.md", "nothing/**"], onlyFilesChanged: ["docs/**"] };
  const inside = check(spec, { mutate: (l) => { mkdirSync(join(l.repo, "docs")); writeFileSync(join(l.repo, "docs", "a.md"), "x"); } });
  assert.equal(inside["fileMatchesGlob:docs/*.md"], true);
  assert.equal(inside["fileMatchesGlob:nothing/**"], false);
  assert.equal(inside["onlyFilesChanged:docs/**"], true);
  const outside = check(spec, { mutate: (l) => { mkdirSync(join(l.repo, "docs")); writeFileSync(join(l.repo, "docs", "a.md"), "x"); writeFileSync(join(l.repo, "a.txt"), "changed"); } });
  assert.equal(outside["onlyFilesChanged:docs/**"], false);
  const committed = check({ onlyFilesChanged: ["docs/**"] }, { mutate: (l) => { writeFileSync(join(l.repo, "z.txt"), "z"); git(l.repo, ["add", "-A"]); git(l.repo, ["commit", "-q", "-m", "z"]); } });
  assert.equal(committed["onlyFilesChanged:docs/**"], false, "a committed change counts");
  assert.equal(check({ onlyFilesChanged: ["docs/**"] })["onlyFilesChanged:docs/**"], true, "no change is inside any list");
  assert.equal(check({ onlyFilesChanged: ["docs/**"] }, { setup: { files: [{ path: "a", content: "1" }] } })["onlyFilesChanged:docs/**"], false, "no git, no baseline");
});

test("assert gitWorktreeExists", () => {
  const none = check({ gitWorktreeExists: true });
  assert.equal(none.gitWorktreeExists, false);
  const r = check({ gitWorktreeExists: true }, { mutate: (l) => git(l.repo, ["worktree", "add", "-q", "-b", "side", join(l.root, "wt")]) });
  assert.equal(r.gitWorktreeExists, true);
  const named = check({ gitWorktreeExists: ["side", "other"] }, { mutate: (l) => git(l.repo, ["worktree", "add", "-q", "-b", "side", join(l.root, "wt")]) });
  assert.equal(named["gitWorktreeExists:side"], true);
  assert.equal(named["gitWorktreeExists:other"], false);
  const mainOnly = check({ gitWorktreeExists: ["side"] }, { mutate: (l) => git(l.repo, ["switch", "-q", "-c", "side"]) });
  assert.equal(mainOnly["gitWorktreeExists:side"], false, "the main checkout on the branch is not a linked worktree");
});

test("assert scriptPasses: runs a script of the stack on a file and wants exit 0", () => {
  const stack = tmp();
  mkdirSync(join(stack, "scripts"));
  writeFileSync(join(stack, "scripts", "lint-x.mjs"), 'import {readFileSync} from "node:fs"; const t = readFileSync(process.argv[2], "utf8"); if (!t.includes("ok")) { console.error("bad: no ok"); process.exit(1); }\n');
  const run1 = (content, file = "a.txt") => {
    const r = repoWithSetup({ gitInit: true, files: [{ path: "a.txt", content }] });
    try {
      return evaluateAsserts({ scriptPasses: [{ script: "lint-x", file }, { script: "missing" }] }, { transcript: parseTranscript(fx("read-only.jsonl")), prompt: "x", layout: r.layout, baseline: r.baseline, stackRoot: stack });
    } finally {
      r.done();
    }
  };
  const good = run1("ok\n");
  assert.equal(good.find((a) => a.name === "scriptPasses:lint-x a.txt").pass, true);
  assert.equal(good.find((a) => a.name === "scriptPasses:missing").pass, false);
  const bad = run1("nope\n");
  assert.equal(bad.find((a) => a.name === "scriptPasses:lint-x a.txt").pass, false);
  assert.match(bad.find((a) => a.name === "scriptPasses:lint-x a.txt").detail, /exit 1: bad: no ok/);
  assert.equal(run1("ok", "gone.txt").find((a) => a.name === "scriptPasses:lint-x gone.txt").pass, false);
});

const LINT_Y = 'import {readFileSync} from "node:fs"; if (!readFileSync(process.argv[2], "utf8").includes("ok")) { console.error("bad: no ok"); process.exit(1); }\n';

/** A fake stack with skills/demo/scripts/lint-y.mjs and a scripts/lint-y.mjs that always passes. */
function lintStack() {
  const stack = tmp();
  mkdirSync(join(stack, "scripts"));
  mkdirSync(join(stack, "skills", "demo", "scripts"), { recursive: true });
  writeFileSync(join(stack, "skills", "demo", "scripts", "lint-y.mjs"), LINT_Y);
  writeFileSync(join(stack, "scripts", "lint-y.mjs"), "process.exit(0);\n");
  return stack;
}

/** Write a file into the repo of a run, as the installer does. A setup file cannot go under .claude/. */
function plant(layout, f) {
  mkdirSync(dirname(join(layout.repo, f.path)), { recursive: true });
  writeFileSync(join(layout.repo, f.path), f.content);
}

test("assert scriptPasses with skill: runs the installed copy in .claude/skills/<skill>/scripts/ of the run", () => {
  const stack = lintStack();
  const installed = { path: ".claude/skills/demo/scripts/lint-y.mjs", content: LINT_Y };
  const run1 = (content, entries, extra = []) => {
    const r = repoWithSetup({ gitInit: true, files: [{ path: "a.txt", content }] });
    try {
      for (const f of extra) plant(r.layout, f);
      return evaluateAsserts({ scriptPasses: entries }, { transcript: parseTranscript(fx("read-only.jsonl")), prompt: "x", layout: r.layout, baseline: r.baseline, stackRoot: stack });
    } finally {
      r.done();
    }
  };
  const entries = [{ skill: "demo", script: "lint-y", file: "a.txt" }, { skill: "nope", script: "lint-y" }];
  const good = run1("ok\n", entries, [installed]);
  assert.equal(good.find((a) => a.name === "scriptPasses:demo/lint-y a.txt").pass, true);
  const missing = good.find((a) => a.name === "scriptPasses:nope/lint-y");
  assert.equal(missing.pass, false);
  assert.match(missing.detail, /the run has no \.claude\/skills\/nope\/scripts\/lint-y\.mjs\. Fix: /);
  const bad = run1("nope\n", entries, [installed]);
  assert.equal(bad.find((a) => a.name === "scriptPasses:demo/lint-y a.txt").pass, false, "the skill script runs, not scripts/lint-y.mjs");
  assert.match(bad.find((a) => a.name === "scriptPasses:demo/lint-y a.txt").detail, /exit 1: bad: no ok/);
  const notInstalled = run1("ok\n", entries).find((a) => a.name === "scriptPasses:demo/lint-y a.txt");
  assert.equal(notInstalled.pass, false, "the stack copy alone does not count");
  assert.match(notInstalled.detail, /installStack/);
  const edited = run1("nope\n", entries, [{ ...installed, content: "process.exit(0);\n" }]).find((a) => a.name === "scriptPasses:demo/lint-y a.txt");
  assert.equal(edited.pass, false, "an installed copy that the run changed does not count");
  assert.match(edited.detail, /differs from the copy in the stack/);
  const parsed = parseEvalFile(evalText({ ...GOOD, assert: { scriptPasses: [{ skill: "improve-codebase", script: "survey-lint", file: "r.md", args: ["--root", "."] }] } }));
  assert.equal(parsed.checks.assert.scriptPasses[0].skill, "improve-codebase");
});

test("scriptPath: the path of the installed script, and refusals for .., an absolute path, a slash and a symlink out", () => {
  const stack = lintStack();
  const r = repoWithSetup({ gitInit: true });
  try {
    plant(r.layout, { path: ".claude/skills/demo/scripts/lint-y.mjs", content: LINT_Y });
    const p = scriptPath({ skill: "demo", script: "lint-y" }, r.layout, stack);
    assert.equal(p.path, join(r.layout.repo, ".claude", "skills", "demo", "scripts", "lint-y.mjs"));
    assert.equal(scriptPath({ script: "lint-y" }, r.layout, stack).path, join(stack, "scripts", "lint-y.mjs"));
    for (const skill of ["..", "../demo", "/abs", "a/b", "demo/../demo", "", 3]) {
      assert.match(scriptPath({ skill, script: "lint-y" }, r.layout, stack).error, /unsafe skill name/, String(skill));
    }
    for (const script of ["../lint-y", "/abs", "a/b", "eval-run"]) {
      assert.match(scriptPath({ skill: "demo", script }, r.layout, stack).error, /unsafe script name/, script);
    }
    // A symlink that points out of the skill folder is refused, even when the content is equal.
    writeFileSync(join(r.layout.root, "outside.mjs"), LINT_Y);
    mkdirSync(join(r.layout.repo, ".claude", "skills", "link", "scripts"), { recursive: true });
    mkdirSync(join(stack, "skills", "link", "scripts"), { recursive: true });
    writeFileSync(join(stack, "skills", "link", "scripts", "lint-y.mjs"), LINT_Y);
    symlinkSync(join(r.layout.root, "outside.mjs"), join(r.layout.repo, ".claude", "skills", "link", "scripts", "lint-y.mjs"));
    assert.match(scriptPath({ skill: "link", script: "lint-y" }, r.layout, stack).error, /leaves the skill folder/);
  } finally {
    r.done();
  }
  const bad = (sp) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: { scriptPasses: [sp] } })), /scriptPasses/, JSON.stringify(sp));
  for (const skill of ["..", "/abs", "a/b", "../x"]) bad({ skill, script: "lint" });
  for (const script of ["..", "/abs", "a/b"]) bad({ skill: "demo", script });
});

// multi turn
test("runOnce multi-turn: turn 2 resumes the session of turn 1, keeps session persistence, adds the cost", async () => {
  const calls = [];
  const sessions = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
  const r = await runOnce({
    ...base1, configDir: tmp(), checks: { ...SIMPLE, turns: ["second prompt", "third prompt"], assert: { outputMatches: [{ pattern: "alpha", turn: 1 }, { pattern: "beta", turn: 2 }, { pattern: "gamma", turn: 3 }, "alpha", { pattern: "beta", turn: 1 }] } },
    spawn: (cmd, args, o) => {
      calls.push({ args, cwd: o.cwd });
      const n = calls.length;
      return { status: 0, signal: null, stderr: "", error: null, stdout: stream({ session: sessions[0], text: ["alpha", "beta", "gamma"][n - 1], cost: 0.1 * n }) };
    },
  });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.cwd === calls[0].cwd), "same temp repo");
  assert.ok(calls.every((c) => !c.args.includes("--no-session-persistence")));
  assert.ok(!calls[0].args.includes("--resume"));
  assert.equal(calls[1].args[calls[1].args.indexOf("--resume") + 1], sessions[0]);
  assert.equal(calls[2].args[calls[2].args.indexOf("--resume") + 1], sessions[0]);
  assert.deepEqual(calls.map((c) => c.args.at(-1)), ["/start x", "second prompt", "third prompt"]);
  assert.ok(Math.abs(r.costUsd - 0.6) < 1e-9, `cost ${r.costUsd}`);
  assert.equal(r.turnCount, 3);
  const failed = r.asserts.filter((a) => !a.pass).map((a) => a.name);
  assert.deepEqual(failed, ["outputMatches:beta@turn1"]);
  assert.equal(existsSync(calls[0].cwd), false);
});

test("runOnce multi-turn: a turn without a session id is a setup error, a failed turn stops the later turns", async () => {
  const noId = await runOnce({ ...base1, checks: { ...SIMPLE, turns: ["b"] }, spawn: okSpawn(stream({ session: "" }).replace('"session_id":""', '"x":1')) });
  assert.match(noId.setupError, /no session id.*Fix: /);
  let n = 0;
  const stop = await runOnce({ ...base1, checks: { ...SIMPLE, turns: ["b", "c"], assert: { outputMatches: [{ pattern: "x", turn: 2 }] } }, spawn: () => (n++, { status: 1, signal: null, stderr: "", error: null, stdout: stream({ subtype: "error_max_budget_usd" }) }) });
  assert.equal(n, 1);
  assert.equal(stop.pass, false);
  assert.match(stop.asserts.find((a) => a.name === "runCompleted").detail, /did not run/);
  assert.match(stop.asserts.find((a) => a.name === "outputMatches:x@turn2").detail, /did not run/);
});

test("mergeTranscripts: one transcript stays as it is, many are joined and costs add", () => {
  const a = parseTranscript(stream({ text: "one", cost: 0.1, tools: [{ name: "Read" }] }));
  const b = parseTranscript(stream({ text: "two", cost: 0.2, tools: [{ name: "Glob" }], subtype: "error_max_budget_usd" }));
  const single = mergeTranscripts([a]);
  assert.equal(single, a);
  const m = mergeTranscripts([parseTranscript(stream({ text: "one", cost: 0.1, tools: [{ name: "Read" }] })), b]);
  assert.deepEqual(m.toolCalls.map((c) => c.name), ["Read", "Glob"]);
  assert.equal(m.text, "one\n\ntwo");
  assert.equal(m.firstText, "one");
  assert.ok(Math.abs(m.result.costUsd - 0.3) < 1e-9);
  assert.equal(m.result.subtype, "error_max_budget_usd");
});

test("a per-turn assert targets one turn: toolCalled, toolOrder and skillLoaded", async () => {
  const outs = [stream({ tools: [{ name: "Read" }], text: "t1" }), stream({ tools: [{ name: "Write" }], text: "t2", skills: [] })];
  let n = 0;
  const r = await runOnce({
    ...base1, checks: { ...SIMPLE, setup: { gitInit: true }, turns: ["more"], assert: {
      toolCalled: [{ name: "Write", turn: 2 }, { name: "Write", turn: 1 }, "Write"],
      toolNotCalled: [{ name: "Read", turn: 2 }],
      toolOrder: [{ before: "Read", after: "Write" }, { before: "Read", after: "Write", turn: 1 }],
      firstTextMatches: [{ pattern: "t2", turn: 2 }, "t1"],
      skillLoaded: [{ name: "start", turn: 1 }, { name: "start", turn: 2 }],
    } },
    spawn: () => ({ status: 0, signal: null, stderr: "", error: null, stdout: outs[n++] }),
  });
  const res = Object.fromEntries(r.asserts.map((a) => [a.name, a.pass]));
  assert.equal(res["toolCalled:Write~@turn2"], true);
  assert.equal(res["toolCalled:Write~@turn1"], false);
  assert.equal(res["toolCalled:Write"], true);
  assert.equal(res["toolNotCalled:Read~@turn2"], true);
  assert.equal(res["toolOrder:Read>Write"], true);
  assert.equal(res["toolOrder:Read>Write@turn1"], false);
  assert.equal(res["firstTextMatches:t2@turn2"], true);
  assert.equal(res["firstTextMatches:t1"], true);
  assert.equal(res["skillLoaded:start@turn1"], true);
  assert.equal(res["skillLoaded:start@turn2"], false);
});

test("buildPlan: turns multiply the cap, baseline runs add to it, and the set is listed", () => {
  const ev = (checks) => ({ manual: false, rel: "a", checks });
  const p = buildPlan([ev({ budgetUsd: 0.5, turns: ["x", "y"] }), ev({ budgetUsd: 1, baseline: { skill: "s" }, set: "capability" })], { models: ["m"], runs: 2, capUsd: undefined, baseline: true });
  assert.equal(p.totalCapUsd, 0.5 * 3 * 2 + 1 * 1 * 4);
  assert.deepEqual(p.items.map((i) => [i.turnCount, i.baselineRuns, i.set]), [[3, 0, "regression"], [1, 2, "capability"]]);
  assert.equal(buildPlan([ev({ baseline: { skill: "s" } })], { models: [null], runs: 1 }).totalCapUsd, 1, "no --baseline, no extra run");
});

// baseline
test("baseline run: the skill is turned off with skillOverrides, skill asserts are dropped, a visible skill makes the run invalid", async () => {
  const seen = [];
  const checks = { ...SIMPLE, baseline: { skill: "start" }, assert: { skillLoaded: ["start", "other"], outputMatches: ["ok"] } };
  const r = await runOnce({ ...base1, baseline: true, checks, spawn: (c, args) => (seen.push(args), okSpawn(stream({ skills: [] }))()) });
  assert.equal(JSON.parse(seen[0][seen[0].indexOf("--settings") + 1]).skillOverrides.start, "off");
  assert.deepEqual(r.asserts.map((a) => a.name), ["runCompleted", "skillLoaded:other", "outputMatches:ok"]);
  assert.equal(r.baselineInvalid, false);
  const bad = await runOnce({ ...base1, baseline: true, checks, spawn: okSpawn(stream({ skills: ["start"] })) });
  assert.equal(bad.baselineInvalid, true);
  const normal = await runOnce({ ...base1, baseline: false, checks, spawn: (c, args) => (seen.push(args), okSpawn(stream())()) });
  assert.ok(!seen[1].includes("--settings"));
  assert.ok(normal.asserts.some((a) => a.name === "skillLoaded:start"));
  assert.deepEqual(stripSkillAsserts({ skillLoaded: ["a", { name: "b", turn: 1 }], skillNotLoaded: ["b"], noRepoChanges: true }, "b"), { skillLoaded: ["a"], noRepoChanges: true });
});

test("main --baseline: reports with, without and the difference, and a failing baseline never fails the run", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, baseline: { skill: "start" }, assert: { skillLoaded: ["start"], outputMatches: ["real answer"] } }) });
  const outDir = join(tmp(), "out");
  const spawn = (cmd, args) => ({ status: 0, signal: null, stderr: "", error: null, stdout: args.includes("--settings") ? stream({ skills: [], text: "weak" }) : stream({ text: "real answer" }) });
  const r = await run(stack, ["--out", outDir, "--runs", "2", "--baseline", "--claude", process.execPath], spawn);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /Baseline without the skill/);
  assert.match(r.out, /100% \(2\/2\)\s+0% \(0\/2\)\s+\+100 points/);
  const res = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));
  assert.equal(res.runs.length, 4);
  assert.equal(res.summary.length, 1);
  assert.equal(res.baselineSummary[0].diffPoints, 100);
  const plain = await run(stack, ["--runs", "1", "--out", join(tmp(), "o2"), "--claude", process.execPath], spawn);
  assert.doesNotMatch(plain.out, /Baseline without/);
  const dry = await run(stack, ["--dry-run", "--baseline"], () => assert.fail("no run"));
  assert.match(dry.out, /s\/01-a\.md: 1 run\(s\), budget 1 USD each \(1 extra baseline run\(s\) without skill start\)/);
  assert.match(dry.out, /Total budget cap: 2\.00 USD/);
});

test("summarizeBaseline: invalid baseline runs do not count", () => {
  const rec = (baseline, pass, extra = {}) => ({ skill: "s", eval: "e", model: "m", pass, baseline, baselineSkill: baseline ? "k" : undefined, ...extra });
  const [row] = summarizeBaseline([rec(false, true), rec(false, true), rec(true, false), rec(true, true, { baselineInvalid: true })]);
  assert.deepEqual([row.withRuns, row.withoutRuns, row.invalid, row.diffPoints], [2, 1, 1, 100]);
  assert.deepEqual(summarizeBaseline([rec(false, true)]), []);
});

// sets and gate
test("sets and --gate: only a regression eval gates, and the summary shows passes out of runs", async () => {
  const stack = fakeStack({
    "s/01-reg.md": evalText({ ...SIMPLE, assert: { outputMatches: ["never"] } }),
    "s/02-cap.md": evalText({ ...SIMPLE, set: "capability", assert: { outputMatches: ["never"] } }),
  });
  const argv = ["--claude", process.execPath, "--runs", "2"];
  const o = () => ["--out", join(tmp(), "o")];
  const all = await run(stack, [...argv, ...o()], okSpawn(fx("read-only.jsonl")));
  assert.equal(all.code, 1);
  assert.match(all.out, /0\/2/);
  const only = fakeStack({ "s/02-cap.md": evalText({ ...SIMPLE, set: "capability", assert: { outputMatches: ["never"] } }) });
  assert.equal((await run(only, [...argv, ...o()], okSpawn(fx("read-only.jsonl")))).code, 1, "without --gate a capability eval still counts, as before");
  const gated = await run(only, [...argv, "--gate", ...o()], okSpawn(fx("read-only.jsonl")));
  assert.equal(gated.code, 0);
  assert.match(gated.out, /capability/);
  assert.match(gated.out, /no \(not gated\)/);
  const mixed = await run(stack, [...argv, "--gate", ...o()], okSpawn(fx("read-only.jsonl")));
  assert.equal(mixed.code, 1);
  assert.match(mixed.out, /Gate: 1 regression eval\(s\) below the threshold\. 1 capability/);
  const rows = summarize([{ skill: "s", eval: "a", model: "m", set: "capability", pass: false, costUsd: 0, asserts: [] }, { skill: "s", eval: "b", model: "m", pass: true, costUsd: 0, asserts: [] }], 1);
  assert.deepEqual(rows.map((r) => [r.set, r.gated]), [["capability", false], ["regression", true]]);
});

test("parseCli: --baseline, --gate and --keep", () => {
  const o = parseCli([]);
  assert.deepEqual([o.baseline, o.gate, o.keep], [false, false, false]);
  const p = parseCli(["--baseline", "--gate", "--keep"]);
  assert.deepEqual([p.baseline, p.gate, p.keep], [true, true, true]);
});

// cleanup
test("removeSessionData: removes only the session folders of this temp repo and the files of its session ids", () => {
  const cfg = tmp();
  const layout = makeLayout({ base: TEST_BASE });
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const other = join(cfg, "projects", sessionDirName(join(TEST_BASE, "eval-run-OTHER", "repo")));
  const mine = join(cfg, "projects", sessionDirName(layout.repo));
  for (const d of [other, mine, join(cfg, "session-env", id), join(cfg, "file-history", id), join(cfg, "session-env", "dddddddd-dddd-4ddd-8ddd-dddddddddddd")]) mkdirSync(d, { recursive: true });
  const removed = removeSessionData(layout, [id, "../../x"], { configDir: cfg });
  assert.equal(removed.length, 3);
  assert.equal(existsSync(mine), false);
  assert.equal(existsSync(other), true);
  assert.equal(existsSync(join(cfg, "session-env", "dddddddd-dddd-4ddd-8ddd-dddddddddddd")), true);
  assert.equal(sessionDirName("/a/b.c_d"), "-a-b-c-d");
  rmSync(layout.root, { recursive: true, force: true });
});

test("runOnce: multi-turn deletes the session data of the temp repo, --keep keeps the folder", async () => {
  const cfg = tmp();
  const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  let repo;
  await runOnce({ ...base1, configDir: cfg, checks: { ...SIMPLE, turns: ["b"] }, spawn: (c, a, o) => {
    repo = o.cwd;
    mkdirSync(join(cfg, "projects", sessionDirName(repo)), { recursive: true });
    return okSpawn(stream({ session: id }))();
  } });
  assert.deepEqual(readdirSync(join(cfg, "projects")), []);
  let kept;
  const k = await runOnce({ ...base1, keep: true, checks: SIMPLE, spawn: (c, a, o) => ((kept = o.cwd), okSpawn(fx("read-only.jsonl"))()) });
  assert.equal(existsSync(kept), true);
  assert.equal(k.keptAt, join(kept, ".."));
  rmSync(k.keptAt, { recursive: true, force: true });
});

test("runOnce: the temp folder is removed after a timeout, a spawn error, a setup error and a thrown error", async () => {
  const dirs = [];
  const t = await runOnce({ ...base1, checks: SIMPLE, spawn: (c, a, o) => (dirs.push(o.cwd), { status: null, signal: "SIGTERM", stdout: "", stderr: "", error: null, timedOut: true }) });
  assert.equal(t.setupError, null, "a timeout is a failed run, not a setup error");
  assert.deepEqual([t.pass, t.subtype, t.timedOut, t.asserts.map((a) => a.name)], [false, "timeout", true, ["timeout"]]);
  assert.match(t.asserts[0].detail, /timed out after .*Fix: /);
  const e = await runOnce({ ...base1, checks: SIMPLE, spawn: (c, a, o) => (dirs.push(o.cwd), { status: null, signal: null, stdout: "", stderr: "", error: "ENOENT" }) });
  assert.match(e.setupError, /cannot start/);
  await assert.rejects(runOnce({ ...base1, checks: SIMPLE, spawn: (c, a, o) => { dirs.push(o.cwd); throw new Error("boom"); } }), /boom/);
  const s = await runOnce({ ...base1, checks: { ...SIMPLE, setup: { gitInit: true, files: [{ path: "../x", content: "" }] } }, spawn: () => assert.fail("no run") });
  assert.match(s.setupError, /not safe/);
  assert.equal(dirs.length, 3);
  assert.ok(dirs.every((d) => !existsSync(d)));
  assert.deepEqual(readdirSync(TEST_BASE).filter((n) => n.startsWith("eval-run-") && existsSync(join(TEST_BASE, n, "repo"))), []);
});

test("defaultSpawn: a real child that runs too long is killed and reported as timed out", async () => {
  const r = await defaultSpawn(process.execPath, ["-e", "setTimeout(()=>{}, 30000)"], { cwd: TEST_BASE, env: process.env, timeoutMs: 300 });
  assert.equal(r.timedOut, true);
  assert.ok(r.signal);
  const ok = await defaultSpawn(process.execPath, ["-e", "console.log('hi')"], { cwd: TEST_BASE, env: process.env, timeoutMs: 5000 });
  assert.deepEqual([ok.status, ok.stdout.trim(), ok.timedOut], [0, "hi", false]);
  assert.match((await defaultSpawn("/no/such/bin", [], { cwd: TEST_BASE, env: process.env, timeoutMs: 1000 })).error, /ENOENT/);
});

/** Make a copy of the runner in a fake stack, with a fake agent that sleeps. Returns { stack, fake, tmpdir }. */
function sleepyStack() {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, assert: { outputMatches: ["x"] } }) });
  mkdirSync(join(stack, "scripts"));
  writeFileSync(join(stack, "scripts", "eval-run.mjs"), readFileSync(SCRIPT));
  const fake = join(stack, "fake-claude.mjs");
  writeFileSync(fake, "#!/usr/bin/env node\nsetTimeout(() => {}, 60000);\n");
  chmodSync(fake, 0o755);
  const tdir = tmp(); // outside the fake stack, or the runner refuses it
  return { stack, fake, tdir };
}

test("the script removes its temp folder on a real timeout", () => {
  const { stack, fake, tdir } = sleepyStack();
  const r = spawnSync(process.execPath, [join(stack, "scripts", "eval-run.mjs"), "--claude", fake, "--timeout-sec", "0.5", "--out", join(stack, "out")], { env: { ...process.env, TMPDIR: tdir }, encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /failed timeout \(the agent timed out/);
  assert.deepEqual(readdirSync(tdir), []);
});

/**
 * A fake agent binary. It hangs when the prompt holds HANG. Else it prints a short stream-json run.
 * With FAKE_LOG set, it appends a line to that file at the start and at the end of a run:
 * "<start|end|hang> <pid> <cwd> <--max-budget-usd value> <CLAUDE_CODE_DISABLE_AUTO_MEMORY>".
 */
const FAKE_AGENT = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const prompt = args[args.indexOf("--") + 1] ?? "";
const log = (s) => process.env.FAKE_LOG && appendFileSync(process.env.FAKE_LOG, [s, process.pid, process.cwd(), args[args.indexOf("--max-budget-usd") + 1], process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ?? "unset"].join(" ") + "\\n");
if (prompt.includes("HANG")) { log("hang"); setInterval(() => {}, 1000); }
else {
  log("start");
  const sid = "99999999-9999-4999-8999-999999999999";
  const out = [
    { type: "system", subtype: "init", session_id: sid, skills: [] },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "fine " + prompt }] } },
    { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.01, num_turns: 1, session_id: sid },
  ];
  setTimeout(() => { process.stdout.write(out.map((e) => JSON.stringify(e)).join("\\n") + "\\n"); log("end"); }, Number(process.env.FAKE_DELAY_MS ?? 0));
}
`;

/** A fake stack with a copy of the runner, the given evals and the fake agent. Returns { stack, fake, tdir }. */
function fakeAgentStack(evals) {
  const stack = fakeStack(evals);
  mkdirSync(join(stack, "scripts"));
  writeFileSync(join(stack, "scripts", "eval-run.mjs"), readFileSync(SCRIPT));
  const fake = join(stack, "fake-claude.mjs");
  writeFileSync(fake, FAKE_AGENT);
  chmodSync(fake, 0o755);
  return { stack, fake, tdir: tmp() };
}

test("a timeout in one run does not stop the set: the run fails with reason timeout and the next run goes on", () => {
  const ok = { ...SIMPLE, prompt: "plain", setup: { gitInit: true }, assert: { outputMatches: ["fine"] } };
  const { stack, fake, tdir } = fakeAgentStack({ "s/01-hang.md": evalText({ ...ok, prompt: "please HANG" }), "s/02-ok.md": evalText(ok) });
  const out = join(stack, "out");
  const r = spawnSync(process.execPath, [join(stack, "scripts", "eval-run.mjs"), "--claude", fake, "--timeout-sec", "0.5", "--out", out], { env: { ...process.env, TMPDIR: tdir }, encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const res = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
  assert.equal(res.setupError, null);
  assert.deepEqual(res.runs.map((x) => [x.eval, x.pass, x.subtype]), [["01-hang.md", false, "timeout"], ["02-ok.md", true, "success"]]);
  assert.equal(res.runs[0].timedOut, true);
  assert.deepEqual(res.runs[0].asserts.map((a) => a.name), ["timeout"]);
  assert.match(r.stdout, /timeout x1/);
  assert.deepEqual(readdirSync(tdir), [], "both temp folders are deleted");
});

test("the script removes its temp folder on Ctrl+C (SIGINT) and stops the agent", async () => {
  const { stack, fake, tdir } = sleepyStack();
  const child = (await import("node:child_process")).spawn(process.execPath, [join(stack, "scripts", "eval-run.mjs"), "--claude", fake, "--out", join(stack, "out")], { env: { ...process.env, TMPDIR: tdir }, stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !readdirSync(tdir).some((n) => existsSync(join(tdir, n, "repo")))) await new Promise((r) => setTimeout(r, 50));
  assert.ok(readdirSync(tdir).length > 0, "the run made a temp folder");
  child.kill("SIGINT");
  const code = await new Promise((res) => child.on("close", (c) => res(c)));
  assert.equal(code, 130, err);
  assert.match(err, /Stopped by SIGINT/);
  assert.deepEqual(readdirSync(tdir), []);
});

test("--keep leaves the temp folder of a real run", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  const r = await run(stack, ["--keep", "--claude", process.execPath, "--out", join(tmp(), "o")], okSpawn(fx("read-only.jsonl")));
  const m = /kept temp folder: (.+)/.exec(r.out);
  assert.ok(m, r.out);
  assert.equal(existsSync(m[1]), true);
  rmSync(m[1], { recursive: true, force: true });
});

test("the new smoke evals have valid Checks blocks", () => {
  const multi = parseEvalFile(readFileSync(join(ROOT, "evals", "_smoke", "02-multi-turn.md"), "utf8"));
  assert.equal(multi.checks.turns.length, 1);
  const tools = parseEvalFile(readFileSync(join(ROOT, "evals", "_smoke", "03-tools.md"), "utf8"));
  assert.deepEqual(tools.checks.tools, ["Read", "Glob"]);
  assert.deepEqual(networkWritingTools(tools.checks.allowedTools), []);
});

// ---------------------------------------------------------------- memory, setup keys, new asserts, jobs

test("agent env: auto memory is off in every turn of every run, also when the owner forces it on", async () => {
  const seen = [];
  await runOnce({
    ...base1, configDir: tmp(), checks: { ...SIMPLE, turns: ["again"] },
    baseEnv: { PATH: "/a", HOME: "/h", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" },
    spawn: (c, a, o) => (seen.push(o.env), okSpawn(stream())()),
  });
  assert.equal(seen.length, 2);
  for (const env of seen) {
    assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
    assert.equal(env.HOME, "/h", "the login stays reachable");
    assert.equal(env.CLAUDE_CONFIG_DIR, undefined, "the runner does not move the config folder");
  }
  assert.deepEqual({ ...AGENT_ENV }, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
  const e = agentEnv({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0", CMUX_X: "1", KEEP: "k" }, { tmp: "/run/tmp" });
  assert.deepEqual([e.CLAUDE_CODE_DISABLE_AUTO_MEMORY, e.TMPDIR, e.CMUX_X, e.KEEP, e.GIT_CONFIG_GLOBAL], ["1", "/run/tmp", undefined, "k", undefined]);
});

test("prepareSetup origin: a bare repo in the temp folder holds the setup commit as origin/main", () => {
  const { layout, baseline, done } = repoWithSetup({ gitInit: true, origin: true, branch: "work", files: [{ path: "a.txt", content: "1\n" }] });
  try {
    assert.equal(dirname(layout.origin), layout.root, "the bare repo is in the temp folder of the run");
    assert.equal(git(layout.repo, ["rev-parse", "refs/remotes/origin/main"]).out, baseline.head);
    assert.equal(git(layout.origin, ["rev-parse", "refs/heads/main"]).out, baseline.head);
    assert.equal(git(layout.repo, ["rev-parse", "--abbrev-ref", "main@{upstream}"]).out, "origin/main");
    assert.equal(git(layout.repo, ["branch", "--show-current"]).out, "work");
    const r = evaluateAsserts({ noRepoChanges: true }, { transcript: parseTranscript(fx("read-only.jsonl")), prompt: "", layout, baseline });
    assert.equal(r.find((a) => a.name === "noRepoChanges").pass, true);
    git(layout.repo, ["commit", "-q", "--allow-empty", "-m", "next"]);
    assert.ok(git(layout.repo, ["push", "-q", "origin", "work"]).ok, "a push reaches the bare repo");
    assert.equal(git(layout.origin, ["rev-parse", "refs/heads/work"]).out, git(layout.repo, ["rev-parse", "HEAD"]).out);
  } finally {
    done();
  }
  const empty = repoWithSetup({ gitInit: true, commit: false, origin: true });
  try {
    assert.equal(git(empty.layout.repo, ["remote", "get-url", "origin"]).out, empty.layout.origin);
    assert.equal(git(empty.layout.origin, ["rev-parse", "--verify", "--quiet", "refs/heads/main"]).ok, false, "no setup commit, so nothing to push");
  } finally {
    empty.done();
  }
});

test("prepareSetup uncommitted: files written after the setup commit stay uncommitted and do not count as a change of the run", () => {
  const setup = { gitInit: true, files: [{ path: "a.txt", content: "one\n" }], uncommitted: [{ path: "a.txt", content: "two\n" }, { path: "src/new.txt", content: "n\n" }] };
  const { layout, baseline, done } = repoWithSetup(setup);
  try {
    assert.equal(git(layout.repo, ["show", "HEAD:a.txt"]).out, "one");
    assert.equal(readFileSync(join(layout.repo, "a.txt"), "utf8"), "two\n");
    assert.deepEqual(baseline.state.status.split("\n"), [" M a.txt", "?? src/new.txt"]);
    assert.deepEqual(Object.keys(baseline.state.hashes), ["a.txt", "src/new.txt"]);
    assert.deepEqual(workTreeState(layout.repo), baseline.state);
  } finally {
    done();
  }
  const spec = { noRepoChanges: true, onlyFilesChanged: ["docs/**"] };
  const same = check(spec, { setup });
  assert.deepEqual([same.noRepoChanges, same["onlyFilesChanged:docs/**"]], [true, true], "the setup state is the baseline");
  const edited = check(spec, { setup, mutate: (l) => writeFileSync(join(l.repo, "a.txt"), "three\n") });
  assert.deepEqual([edited.noRepoChanges, edited["onlyFilesChanged:docs/**"]], [false, false], "an edit of an uncommitted file counts");
  const added = check(spec, { setup, mutate: (l) => writeFileSync(join(l.repo, "b.txt"), "b") });
  assert.deepEqual([added.noRepoChanges, added["onlyFilesChanged:docs/**"]], [false, false]);
  const bad = (s, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, setup: s })), re);
  bad({ uncommitted: [{ path: "a", content: "" }] }, /gitInit/);
  bad({ gitInit: true, commit: false, uncommitted: [{ path: "a", content: "" }] }, /needs the setup commit/);
  bad({ gitInit: true, uncommitted: [{ path: "../a", content: "" }] }, /relative/);
  bad({ gitInit: true, uncommitted: [{ path: "a" }] }, /uncommitted\[0\]/);
});

/** A stream in the shape of a real run with one subagent: the subagent calls carry the id of the Agent call. */
function subagentStream() {
  const A = "toolu_agent";
  const ev = [
    { type: "system", subtype: "init", session_id: "11111111-1111-4111-8111-111111111111", skills: [] },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: A, name: "Agent", input: { prompt: "review" } }] } },
    { type: "assistant", parent_tool_use_id: A, message: { content: [{ type: "tool_use", id: "s1", name: "Skill", input: { skill: "peer-review" } }] } },
    { type: "assistant", parent_tool_use_id: A, message: { content: [{ type: "tool_use", id: "s2", name: "Read", input: { file_path: "a.txt" } }] } },
    { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: A, content: "done" }] } },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "m2", name: "Read", input: { file_path: "b.txt" } }] } },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "m3", name: "Write", input: { file_path: "report.md" } }] } },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "ok" }] } },
    { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.01, num_turns: 3 },
  ];
  return ev.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

test("parseTranscript keeps parent_tool_use_id: null for the main agent, the Agent call id in a subagent", () => {
  assert.deepEqual(parseTranscript(subagentStream()).toolCalls.map((c) => [c.name, c.parentId]), [["Agent", null], ["Skill", "toolu_agent"], ["Read", "toolu_agent"], ["Read", null], ["Write", null]]);
  assert.ok(parseTranscript(fx("read-only.jsonl")).toolCalls.every((c) => c.parentId === null));
});

test("output asserts read only the text of the main agent, not the text of a subagent", () => {
  const lines = [
    { type: "assistant", parent_tool_use_id: "toolu_agent", message: { content: [{ type: "text", text: "Verdict: approve" }] } },
    { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "I could not finish." }] } },
    { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.01, num_turns: 1 },
  ].map((e) => JSON.stringify(e)).join("\n");
  const t = parseTranscript(lines);
  assert.equal(t.text, "I could not finish.");
  assert.equal(t.firstText, "I could not finish.");
  const r = check({ outputMatches: ["Verdict: approve"], firstTextMatches: ["Verdict"], outputNotMatches: ["approve"] }, { text: lines });
  assert.equal(r["outputMatches:Verdict: approve"], false);
  assert.equal(r["firstTextMatches:Verdict"], false);
  assert.equal(r["outputNotMatches:approve"], true);
});

test("tool asserts refuse an unknown key, such as pattern for inputMatches", () => {
  const bad = (a, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: a })), re);
  bad({ toolCalled: [{ name: "Bash", pattern: "rm -rf" }] }, /toolCalled/);
  bad({ toolNotCalled: [{ name: "Bash", inputmatches: "rm" }] }, /toolNotCalled/);
  bad({ toolOrder: [{ before: { name: "Read", pattern: "x" }, after: "Write" }] }, /toolOrder/);
  bad({ toolCount: [{ name: "Read", min: 1, pattern: "x" }] }, /toolCount/);
  bad({ toolCalled: [{ name: "Read", min: 1 }] }, /toolCalled/);
  parseEvalFile(evalText({ ...GOOD, assert: { toolCalled: [{ name: "Bash", inputMatches: "ls", agent: "main", turn: 1 }] } }));
});

test("assert toolCount: at least, at most and exactly N calls, with input match and agent scope", () => {
  const r = check({ toolCount: [
    { name: "Read", min: 2 }, { name: "Read", max: 1 }, { name: "Read", agent: "main", min: 1, max: 1 }, { name: "Read", agent: "subagent", min: 1, max: 1 },
    { name: "Read", inputMatches: "b\\.txt", min: 1, max: 1 }, { name: "Edit", max: 0 }, { name: "Edit", min: 1 },
    { name: "Skill", agent: "subagent", max: 0 }, { name: "Agent", agent: "subagent", max: 0 },
  ] }, { text: subagentStream() });
  assert.equal(r["toolCount:Read~=2..any"], true);
  assert.equal(r["toolCount:Read~=0..1"], false);
  assert.equal(r["toolCount:Read~[main]=1..1"], true);
  assert.equal(r["toolCount:Read~[subagent]=1..1"], true);
  assert.equal(r["toolCount:Read~b\\.txt=1..1"], true);
  assert.equal(r["toolCount:Edit~=0..0"], true);
  assert.equal(r["toolCount:Edit~=1..any"], false);
  assert.equal(r["toolCount:Skill~[subagent]=0..0"], false, "the reviewer subagent called Skill");
  assert.equal(r["toolCount:Agent~[subagent]=0..0"], true);
  const bad = (a, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: a })), re);
  bad({ toolCount: [{ name: "Read" }] }, /toolCount/);
  bad({ toolCount: [{ name: "Read", min: 3, max: 1 }] }, /toolCount/);
  bad({ toolCount: [{ name: "Read", min: -1 }] }, /toolCount/);
  bad({ toolCount: [{ name: "Read", min: 1.5 }] }, /toolCount/);
  bad({ toolCount: [{ name: "Read", min: 1, turn: 2 }] }, /toolCount/);
  bad({ toolCount: "Read" }, /toolCount/);
  parseEvalFile(evalText({ ...GOOD, assert: { toolCount: [{ name: "Read", agent: "main", inputMatches: "x", min: 0, max: 2 }] } }));
});

test("agent scope: toolCalled, toolNotCalled and toolOrder count only main-agent or only subagent calls", () => {
  const r = check({
    toolNotCalled: [{ name: "Skill", agent: "subagent" }, { name: "Skill", agent: "main" }, { name: "Agent", agent: "subagent" }],
    toolCalled: [{ name: "Write", agent: "subagent" }, { name: "Write", agent: "main" }],
    toolOrder: [
      { before: { name: "Agent", agent: "main" }, after: { name: "Write", inputMatches: "report" } },
      { before: { name: "Read", agent: "main" }, after: { name: "Read", agent: "subagent" } },
      { before: "Read", after: { name: "Read", agent: "main" } },
    ],
  }, { text: subagentStream() });
  assert.equal(r["toolNotCalled:Skill~[subagent]"], false);
  assert.equal(r["toolNotCalled:Skill~[main]"], true);
  assert.equal(r["toolNotCalled:Agent~[subagent]"], true);
  assert.equal(r["toolCalled:Write~[subagent]"], false);
  assert.equal(r["toolCalled:Write~[main]"], true);
  assert.equal(r["toolOrder:Agent~[main]>Write~report"], true, "the subagent runs before the report file is written");
  assert.equal(r["toolOrder:Read~[main]>Read~[subagent]"], false);
  assert.equal(r["toolOrder:Read>Read~[main]"], true);
  assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: { toolCalled: [{ name: "Read", agent: "other" }] } })), /toolCalled/);
  assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: { toolOrder: [{ before: { name: "Read", agent: "sub" }, after: "Write" }] } })), /toolOrder/);
});

test("assert globs in fileExists, fileAbsent and fileMatches, and assert fileNotMatches", () => {
  const mutate = (l) => {
    mkdirSync(join(l.repo, "notebooks"));
    writeFileSync(join(l.repo, "notebooks", "2026-11-25-run.ipynb"), '{"cells": ["cell one"]}');
    mkdirSync(join(l.tmp, "wt-a1b2", "src"), { recursive: true });
  };
  const r = check({
    fileExists: ["notebooks/*.ipynb", "nothing/*.md", "$TMPDIR/wt-*", "$TMPDIR/wt-*/src", "a.txt"],
    fileAbsent: ["notebooks/*.ipynb", "nothing/*.md"],
    fileMatches: [{ path: "notebooks/*.ipynb", pattern: "cell one" }, { path: "notebooks/*.ipynb", pattern: "zzz" }, { path: "none/**", pattern: "." }],
    fileNotMatches: [
      { path: "a.txt", pattern: "bye" }, { path: "a.txt", pattern: "hel+o" }, { path: "nope.txt", pattern: "x" },
      { path: "notebooks/*.ipynb", pattern: "zzz" }, { path: "notebooks/*.ipynb", pattern: "cell" }, { path: "none/*", pattern: "x" },
    ],
  }, { mutate });
  assert.equal(r["fileExists:notebooks/*.ipynb"], true);
  assert.equal(r["fileExists:nothing/*.md"], false);
  assert.equal(r["fileExists:$TMPDIR/wt-*"], true, "a glob matches a folder");
  assert.equal(r["fileExists:$TMPDIR/wt-*/src"], true);
  assert.equal(r["fileExists:a.txt"], true);
  assert.equal(r["fileAbsent:notebooks/*.ipynb"], false);
  assert.equal(r["fileAbsent:nothing/*.md"], true);
  assert.equal(r["fileMatches:notebooks/*.ipynb~cell one"], true);
  assert.equal(r["fileMatches:notebooks/*.ipynb~zzz"], false);
  assert.equal(r["fileMatches:none/**~."], false);
  assert.equal(r["fileNotMatches:a.txt~bye"], true);
  assert.equal(r["fileNotMatches:a.txt~hel+o"], false);
  assert.equal(r["fileNotMatches:nope.txt~x"], false, "a missing file fails");
  assert.equal(r["fileNotMatches:notebooks/*.ipynb~zzz"], true);
  assert.equal(r["fileNotMatches:notebooks/*.ipynb~cell"], false);
  assert.equal(r["fileNotMatches:none/*~x"], false, "a glob with no file fails");
  const bad = (a, re) => assert.throws(() => parseEvalFile(evalText({ ...GOOD, assert: a })), re);
  bad({ fileExists: ["../*.md"] }, /relative/);
  bad({ fileExists: ["$TMPDIR/../*"] }, /relative/);
  bad({ fileMatches: [{ path: "/abs/*", pattern: "x" }] }, /relative/);
  bad({ fileNotMatches: [{ path: "a", pattern: "(" }] }, /bad pattern/);
  bad({ fileNotMatches: [] }, /fileNotMatches/);
  bad({ fileNotMatches: [{ path: "a" }] }, /fileNotMatches/);
});

test("parseCli: --jobs is a whole number of 1 or more, default 1", () => {
  assert.equal(parseCli([]).jobs, 1);
  assert.equal(parseCli(["--jobs", "4"]).jobs, 4);
  for (const v of ["0", "-1", "1.5", "x"]) assert.throws(() => parseCli(["--jobs", v]), UsageError, v);
});

test("main --jobs: up to n runs at once, each in its own temp folder and with its own budget, results in plan order", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText({ ...SIMPLE, budgetUsd: 0.25 }), "s/02-b.md": evalText({ ...SIMPLE, budgetUsd: 0.5 }) });
  const go = async (jobs) => {
    let now = 0;
    let max = 0;
    const seen = [];
    const spawn = async (cmd, args, o) => {
      max = Math.max(max, ++now);
      seen.push({ cwd: o.cwd, budget: Number(args[args.indexOf("--max-budget-usd") + 1]) });
      await new Promise((r) => setTimeout(r, 40));
      now--;
      return OKRUN();
    };
    const outDir = join(tmp(), "out");
    const r = await run(stack, ["--out", outDir, "--runs", "3", "--jobs", String(jobs), "--claude", process.execPath], spawn);
    assert.equal(r.code, 0, r.out + r.err);
    return { max, seen, r, res: JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")) };
  };
  const two = await go(2);
  assert.equal(two.max, 2);
  assert.equal(new Set(two.seen.map((s) => s.cwd)).size, 6, "each run has its own temp folder");
  assert.ok(two.seen.every((s) => !existsSync(s.cwd)));
  assert.deepEqual(two.res.runs.map((x) => `${x.eval}#${x.run}`), ["01-a.md#1", "01-a.md#2", "01-a.md#3", "02-b.md#1", "02-b.md#2", "02-b.md#3"]);
  assert.equal(two.seen.reduce((a, s) => a + s.budget, 0), two.res.totalBudgetCapUsd, "the budgets of the runs add up to the cap");
  assert.equal(two.res.totalBudgetCapUsd, 2.25);
  assert.equal(two.res.jobs, 2);
  assert.match(two.r.out, /Jobs: up to 2 runs at once/);
  assert.equal((await go(1)).max, 1);
  assert.equal((await go(10)).max, 6);
});

test("main --jobs: a setup error starts no new run", async () => {
  const stack = fakeStack({ "s/01-a.md": evalText(SIMPLE) });
  let calls = 0;
  const r = await run(stack, ["--claude", process.execPath, "--runs", "6", "--jobs", "2", "--out", join(tmp(), "o")], async () => {
    calls++;
    await new Promise((res) => setTimeout(res, 10));
    return { status: 1, signal: null, stdout: "", stderr: "Not logged in", error: null };
  });
  assert.equal(r.code, 2);
  assert.equal(calls, 2);
});

test("--jobs with a fake binary: two agents run at once, each in its own folder, with auto memory off", () => {
  const { stack, fake, tdir } = fakeAgentStack({ "s/01-a.md": evalText({ ...SIMPLE, prompt: "plain", setup: { gitInit: true }, assert: { outputMatches: ["fine"] } }) });
  const log = join(tmp(), "agent.log");
  const r = spawnSync(process.execPath, [join(stack, "scripts", "eval-run.mjs"), "--claude", fake, "--runs", "4", "--jobs", "2", "--out", join(stack, "out")], {
    env: { ...process.env, TMPDIR: tdir, FAKE_LOG: log, FAKE_DELAY_MS: "300", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" }, encoding: "utf8", timeout: 30000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = readFileSync(log, "utf8").trim().split("\n").map((l) => l.split(" "));
  let now = 0;
  let max = 0;
  for (const [kind] of lines) max = Math.max(max, (now += kind === "start" ? 1 : -1));
  assert.equal(max, 2);
  const starts = lines.filter((l) => l[0] === "start");
  assert.equal(starts.length, 4);
  assert.equal(new Set(starts.map((l) => l[2])).size, 4, "four temp folders");
  assert.ok(starts.every((l) => l[3] === "1"), "each run keeps its --max-budget-usd");
  assert.ok(starts.every((l) => l[4] === "1"), "auto memory is off in the real child process");
  assert.deepEqual(readdirSync(tdir), []);
});

test("grill 05 and 06 run as multi-turn evals", () => {
  const five = parseEvalFile(readFileSync(join(ROOT, "evals", "grill", "05-summary-feeds-spec.md"), "utf8"));
  const six = parseEvalFile(readFileSync(join(ROOT, "evals", "grill", "06-user-ends-the-questions.md"), "utf8"));
  assert.ok(five.checks.turns.length >= 3 && five.checks.turns.at(-1).startsWith("/spec"));
  assert.deepEqual(six.checks.turns, ["enough, write it up"]);
  for (const e of [five, six]) assert.deepEqual(networkWritingTools(e.checks.allowedTools), []);
});
