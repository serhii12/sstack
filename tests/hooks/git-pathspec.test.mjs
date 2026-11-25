// Git commands that write a guard file through a pathspec: checkout, restore, rm, mv, clean, reset,
// checkout-index, stash push, apply and am with --directory, and output options.
// The lists live in git-pathspec.cases.mjs. The wrappers come from protected-paths.cases.mjs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCommand } from "../../hooks/git-policy.mjs";
import { WRAPPERS } from "./protected-paths.cases.mjs";
import { ALLOWED, BLOCKED, KNOWN_OPEN } from "./git-pathspec.cases.mjs";

const decide = (command) => evaluateCommand(command, { branchOf: () => "feature/x" });
const wrong = (commands, wanted) => commands.filter((command) => decide(command).allow !== wanted);
const blocks = (commands) => assert.deepEqual(wrong(commands, false), []);
const allows = (commands) => assert.deepEqual(wrong(commands, true), []);

const BASE = [
  "git checkout HEAD -- .stack/check",
  "git restore --staged .githooks/prepare-commit-msg",
  "git rm -r --cached .claude/hooks/guard-git.mjs",
  "git mv x .claude/settings.json",
  "git clean -fd .stack",
  "git reset HEAD~1 -- .githooks",
  "git -C .claude restore settings.json",
];

describe("git pathspec: lists", () => {
  it("has at least 100 blocked and 60 allowed commands, all unique", () => {
    assert.ok(BLOCKED.length >= 100, `blocked: ${BLOCKED.length}`);
    assert.ok(ALLOWED.length >= 60, `allowed: ${ALLOWED.length}`);
    assert.equal(new Set([...ALLOWED, ...BLOCKED]).size, ALLOWED.length + BLOCKED.length);
  });

  it("blocks every command that writes a guard path through git", () => {
    blocks(BLOCKED);
  });

  it("allows every similar command that only reads or names another path", () => {
    allows(ALLOWED);
  });

  it("allows the known limits, so the header stays true", () => {
    allows(KNOWN_OPEN);
  });
});

describe("git pathspec: the three main forms", () => {
  it("blocks git checkout with a guard path, with and without --", () => {
    blocks([
      "git checkout -- .stack/check",
      "git checkout HEAD -- .githooks/prepare-commit-msg",
      "git checkout .claude/hooks/guard-git.mjs",
      "git checkout HEAD~1 -- .claude/settings.json",
    ]);
  });

  it("blocks git restore with every flag mix", () => {
    blocks([
      "git restore .stack/check",
      "git restore --source=HEAD~1 .stack/check",
      "git restore --staged .githooks",
      "git restore --worktree .githooks",
      "git restore --staged --worktree --source=main .claude/settings.json",
    ]);
  });

  it("blocks git rm with -r, --cached and -f", () => {
    blocks(["git rm .stack/check", "git rm -r .githooks", "git rm --cached .stack/check", "git rm -rf .claude/hooks", "git rm -f --cached .claude/settings.json"]);
  });

  it("allows the ordinary forms of the same commands", () => {
    allows([
      "git checkout -- src/x.ts",
      "git checkout feature-branch",
      "git checkout -b new",
      "git restore .",
      "git restore src/",
      "git rm src/old.ts",
      "git rm --cached notes.txt",
    ]);
  });

  it("allows read-only commands that name guard paths", () => {
    allows([
      "git log -- hooks/guard-git.mjs",
      "git log --oneline -- .claude/hooks/guard-git.mjs",
      "git diff hooks/",
      "git diff -- .stack/check",
      "git show HEAD:hooks/guard-git.mjs",
      "git show HEAD:.claude/hooks/guard-git.mjs",
      "git blame .claude/hooks/guard-git.mjs",
      "git status",
    ]);
  });
});

describe("git pathspec: disguises", () => {
  it("blocks each base command inside every wrapper (bash -c, eval, &&, ;, |, $(), heredoc, sudo, env ...)", () => {
    const wrapped = BASE.flatMap((command) => WRAPPERS.map(([, wrap]) => wrap(command)));
    assert.equal(wrapped.length, BASE.length * WRAPPERS.length);
    blocks(wrapped);
    blocks(BASE);
  });

  it("reads git -C and cd as a base for the pathspec, and resolves ..", () => {
    blocks(["git -C .claude restore hooks/guard-git.mjs", "cd .claude && git rm settings.json", "git -C a/.. rm .stack/x", "git -C .stack clean -fd"]);
    allows(["git -C .claude log -- settings.json", "git -C src restore .", "cd docs && git rm old.md"]);
  });

  it("reads quoting, ./, // and case in the path", () => {
    blocks(["git rm './.stack//check'", "git rm .st\"\"ack/check", "git rm $'.stack/check'", "git rm .STACK/check", "git rm .{stack,x}/check"]);
  });

  it("reads an alias that expands to a path writer, set in the same command or an earlier one", () => {
    blocks(["git -c alias.r=restore r .stack/check", "git config alias.zap 'rm -f' && git zap .stack"]);
  });

  it("blocks a work tree that is a guard folder, by flag or by environment", () => {
    blocks(["git --work-tree=.stack checkout -- .", "GIT_WORK_TREE=.githooks git reset --hard", "env GIT_WORK_TREE=.stack git restore ."]);
    allows(["git --work-tree=/tmp/wt checkout -- .", "GIT_WORK_TREE=/tmp/wt git checkout -- ."]);
  });

  it("blocks a command that reads its paths from a file", () => {
    blocks(["git restore --pathspec-from-file=list.txt", "git rm --pathspec-from-file=-"]);
  });
});

describe("git pathspec: verdict", () => {
  it("reports the rule, and the fix says a person must make the change", () => {
    const found = decide("git rm .stack/check");
    assert.equal(found.rule, "protected-path");
    assert.match(found.reason, /guard/u);
    assert.match(found.fix, /A person must make this change/u);
  });

  it("does not change the rule of an earlier check", () => {
    assert.equal(decide("git commit --no-verify -m x").rule, "no-verify");
    assert.equal(decide("rm .stack/check").rule, "protected-path");
  });
});
