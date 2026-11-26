import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.resolve(here, "../../hooks/guard-git.mjs");

// Every temp folder that a test makes. They are removed after the last test.
const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const run = (input, options = {}) =>
  spawnSync("node", [options.hook ?? hook], { input, encoding: "utf8" });

const bash = (command, cwd) =>
  run(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd }));

const git = (cwd, ...args) =>
  spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });

const assertBlocked = (result, pattern) => {
  assert.equal(result.status, 2, `status ${result.status}, stderr: ${result.stderr}`);
  assert.equal(result.stdout, "");
  const lines = result.stderr.trim().split("\n");
  assert.match(lines[0], /^Blocked: /u);
  assert.match(lines[1], /^Why: /u);
  assert.match(lines.at(-1), /^Fix: /u);
  if (pattern) assert.match(result.stderr, pattern);
};

describe("guard-git: input that cannot be read blocks with exit 2", () => {
  for (const [name, input] of [
    ["empty stdin", ""],
    ["whitespace stdin", "  \n"],
    ["text that is not JSON", "not json"],
    ["truncated JSON", '{"tool_input":{"command":"git sta'],
    ["JSON null", "null"],
    ["a JSON array", "[]"],
    ["a JSON string", '"git status"'],
    ["an empty object", "{}"],
    ["no tool_input", '{"tool_name":"Bash"}'],
    ["tool_input without a command", '{"tool_name":"Bash","tool_input":{}}'],
    ["command is a number", '{"tool_name":"Bash","tool_input":{"command":42}}'],
    ["command is an array", '{"tool_name":"Bash","tool_input":{"command":["git","status"]}}'],
    ["command is empty", '{"tool_name":"Bash","tool_input":{"command":""}}'],
    ["command is blank", '{"tool_name":"Bash","tool_input":{"command":"  "}}'],
    ["command at the top level only", '{"command":"git status"}'],
    ["command with an unclosed quote", '{"tool_name":"Bash","tool_input":{"command":"echo \\"x"}}'],
  ]) {
    it(`blocks ${name}`, () => assertBlocked(run(input)));
  }
});

describe("guard-git: failure inside the guard blocks", () => {
  it("blocks when the policy file is missing", () => {
    const dir = tempDir("guard-");
    const copy = path.join(dir, "guard-git.mjs");
    copyFileSync(hook, copy);
    assertBlocked(run(JSON.stringify({ tool_input: { command: "git status" } }), { hook: copy }), /could not be loaded/u);
  });

  it("blocks when the policy file has a syntax error", () => {
    const dir = tempDir("guard-");
    copyFileSync(hook, path.join(dir, "guard-git.mjs"));
    writeFileSync(path.join(dir, "git-policy.mjs"), "export const = ;");
    assertBlocked(run(JSON.stringify({ tool_input: { command: "git status" } }), { hook: path.join(dir, "guard-git.mjs") }));
  });

  it("blocks when the policy throws", () => {
    const dir = tempDir("guard-");
    copyFileSync(hook, path.join(dir, "guard-git.mjs"));
    writeFileSync(
      path.join(dir, "git-policy.mjs"),
      "export const evaluateCommand = () => { throw new Error('boom'); };\nexport const resolveDirs = (b) => b;\n"
    );
    assertBlocked(run(JSON.stringify({ tool_input: { command: "git status" } }), { hook: path.join(dir, "guard-git.mjs") }), /boom/u);
  });
});

describe("guard-git: decisions", () => {
  let repo;
  let feature;

  before(() => {
    repo = tempDir("guard-repo-");
    git(repo, "init", "-q", "-b", "main");
    feature = tempDir("guard-feat-");
    git(feature, "init", "-q", "-b", "feature/x");
    mkdirSync(path.join(repo, "sub"));
  });

  it("allows an ordinary command silently", () => {
    const result = bash("git status && npm run x -- -n", feature);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  it("allows look-alikes", () => {
    for (const command of ["git commit -m 'no --no-verify here'", "git log -n 5", "grep -n x f", "echo '--no-verify'"]) {
      assert.equal(bash(command, feature).status, 0, command);
    }
  });

  it("blocks a bypass with what, why and Fix", () => {
    const result = bash("git commit --no-verify -m x", feature);
    assertBlocked(result, /git commit --no-verify -m x/u);
    assert.match(result.stderr, /skips the git hooks/u);
  });

  it("blocks a commit while on main and allows it on a feature branch", () => {
    assertBlocked(bash("git commit -m x", repo), /main or master/u);
    assert.equal(bash("git commit -m x", feature).status, 0);
  });

  it("blocks a commit on main from a sub directory and through cd", () => {
    assertBlocked(bash("git commit -m x", path.join(repo, "sub")));
    assertBlocked(bash(`cd ${repo} && git commit -m x`, feature));
  });

  it("blocks git -C into a repo that is on main", () => {
    assertBlocked(bash(`git -C ${repo} commit -m x`, feature));
    assertBlocked(bash(`git -C ${repo} push`, feature));
    assert.equal(bash(`git -C ${feature} commit -m x`, repo).status, 0);
  });

  it("blocks force pushes and pushes to main, allows force-with-lease", () => {
    assertBlocked(bash("git push --force origin feature", feature), /force/u);
    assertBlocked(bash("git push -f", feature));
    assertBlocked(bash("git push origin main", feature));
    assertBlocked(bash(`git -C ${feature} push origin master`, feature));
    assert.equal(bash("git push --force-with-lease origin feature", feature).status, 0);
  });

  it("works when the payload has no cwd", () => {
    const result = run(JSON.stringify({ tool_input: { command: "git push origin main" } }));
    assertBlocked(result);
  });

  it("ignores a cwd that is not a repo", () => {
    assert.equal(bash("git commit -m x", tmpdir()).status, 0);
  });

  it("finds the branch through --git-dir", () => {
    assertBlocked(bash(`git --git-dir=${path.join(repo, ".git")} commit -m x`, feature), /main or master/u);
    assert.equal(bash(`git --git-dir=${path.join(feature, ".git")} commit -m x`, repo).status, 0);
  });

  it("blocks a commit on main after git checkout <file>, allows it after git switch", () => {
    assertBlocked(bash("git checkout a.txt && git commit -m x", repo));
    assert.equal(bash(`git switch feature/x && git commit -m x`, repo).status, 0);
  });
});

describe("guard-git: a tag cannot change the branch name", () => {
  it("blocks a commit on main when a tag named main exists", () => {
    const repo = tempDir("guard-tag-");
    git(repo, "init", "-q", "-b", "main");
    git(repo, "commit", "-q", "--allow-empty", "-m", "base");
    // update-ref makes a light tag also where the git config asks for a signed tag.
    assert.equal(git(repo, "update-ref", "refs/tags/main", "HEAD").status, 0);
    for (const command of ["git commit -m x", "git commit -am x", "git commit --dry-run"]) {
      assertBlocked(bash(command, repo), /main or master/u);
    }
  });

  it("allows a commit on a branch named heads/main", () => {
    const repo = tempDir("guard-tag-");
    git(repo, "init", "-q", "-b", "heads/main");
    git(repo, "commit", "-q", "--allow-empty", "-m", "base");
    assert.equal(bash("git commit -m x", repo).status, 0);
  });
});

describe("guard-git: settings template", () => {
  const settings = JSON.parse(readFileSync(path.resolve(here, "../../templates/claude-settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.find((group) => group.matcher === "Bash");
  const handler = entry?.hooks?.[0];

  it("runs the guard on Bash and blocks when the guard cannot run or times out", () => {
    assert.equal(handler.type, "command");
    assert.match(handler.command, /guard-git\.mjs.*\|\| exit 2$/u);
    assert.equal(handler.onFailure, "block");
    assert.ok(Number.isInteger(handler.timeout) && handler.timeout > 0);
  });

  it("denies edits to every guard file", () => {
    for (const rule of ["Edit(/.claude/settings.json)", "Edit(/.claude/hooks/**)", "Edit(/.githooks/**)", "Edit(/.stack/**)", "Edit(/.git/hooks/**)", "Edit(/.git/config)"]) {
      assert.ok(settings.permissions.deny.includes(rule), rule);
    }
  });
});

// The PreToolUse input of Codex CLI 0.172.0 (hooks docs): the Claude Code keys plus turn_id and model.
const codexInput = (command, cwd) =>
  JSON.stringify({
    session_id: "019a0000-0000-7000-8000-000000000000",
    transcript_path: "/tmp/codex/rollout.jsonl",
    cwd,
    hook_event_name: "PreToolUse",
    permission_mode: "default",
    tool_name: "Bash",
    tool_use_id: "call_1",
    tool_input: { command },
    turn_id: "turn_1",
    model: "gpt-5-codex",
  });

describe("guard-git: Codex input shape", () => {
  let main;
  let feature;

  before(() => {
    main = tempDir("guard-codex-main-");
    git(main, "init", "-q", "-b", "main");
    feature = tempDir("guard-codex-feat-");
    git(feature, "init", "-q", "-b", "feature/x");
  });

  it("allows git status silently", () => {
    const result = run(codexInput("git status", feature));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });

  it("blocks --no-verify, a plain force push and a commit on main", () => {
    assertBlocked(run(codexInput("git commit --no-verify -am 'docs: tweak'", feature)), /skips the git hooks/u);
    assertBlocked(run(codexInput("git push --force origin feature/x", feature)), /force/u);
    assertBlocked(run(codexInput("git commit -m x", main)), /main or master/u);
    assert.equal(run(codexInput("git commit -m x", feature)).status, 0);
  });
});

describe("guard-git: Codex hooks template", () => {
  const template = JSON.parse(readFileSync(path.resolve(here, "../../templates/codex-hooks.json"), "utf8"));
  const group = template.hooks?.PreToolUse?.[0];
  const handler = group?.hooks?.[0];

  it("runs the guard on Bash, names itself for /hooks, and blocks when node cannot run", () => {
    assert.equal(template.description, "sstack git guard");
    assert.equal(group.matcher, "^Bash$");
    assert.equal(handler.type, "command");
    assert.equal(handler.statusMessage, "sstack git guard");
    assert.ok(Number.isInteger(handler.timeout) && handler.timeout > 0);
    assert.match(handler.command, /--git-common-dir/u);
    assert.match(handler.command, /\.codex\/hooks\/guard-git\.mjs.*\|\| exit 2$/u);
  });

  // A project with the guard in .codex/hooks/ (not committed), and a linked worktree whose branch has no .codex/.
  const project = () => {
    const repo = tempDir("guard-codex-proj-");
    git(repo, "init", "-q", "-b", "main");
    git(repo, "commit", "-q", "--allow-empty", "-m", "base");
    mkdirSync(path.join(repo, ".codex", "hooks"), { recursive: true });
    for (const f of ["guard-git.mjs", "git-policy.mjs"]) copyFileSync(path.resolve(here, "../../hooks", f), path.join(repo, ".codex", "hooks", f));
    const tree = path.join(tempDir("guard-codex-wt-"), "wt");
    assert.equal(git(repo, "worktree", "add", "-q", "-b", "feature/x", tree).status, 0);
    return { repo, tree };
  };
  const hookRun = (cwd, command) => spawnSync("sh", ["-c", handler.command], { cwd, input: codexInput(command, cwd), encoding: "utf8" });

  it("finds the guard from the main checkout and from a linked worktree that has no .codex/", () => {
    const { repo, tree } = project();
    assert.equal(hookRun(repo, "git status").status, 0, hookRun(repo, "git status").stderr);
    assertBlocked(hookRun(repo, "git commit -m x"), /main or master/u);
    const status = hookRun(tree, "git status");
    assert.equal(status.status, 0, status.stderr);
    assertBlocked(hookRun(tree, "git commit --no-verify -m x"), /skips the git hooks/u);
    assert.equal(hookRun(tree, "git commit -m x").status, 0);
  });
});

describe("guard-git: protected paths are judged by what the command does to them", () => {
  const reported = "ls; cat -n GLOSSARY.md README.md; find . -iname 'glossary*' -not -path './.git/*'";

  it("lets the read-only find that excludes .git through", () => {
    const result = bash(reported, process.cwd());
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
  });

  it("lets a read of .git/config through, and blocks a write to it", () => {
    assert.equal(bash("cat .git/config", process.cwd()).status, 0);
    assertBlocked(bash("echo x >> .git/config", process.cwd()), /protected-path|\.git\/config/u);
    assertBlocked(bash("find .githooks -delete", process.cwd()), /Fix:/u);
  });
});
