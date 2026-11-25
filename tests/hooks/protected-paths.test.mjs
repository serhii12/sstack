// Protected paths: a command that only reads, lists, excludes or mentions .git/hooks, .git/config, .githooks,
// .stack, .claude/settings.json or .claude/hooks runs. A command that writes, removes or re-modes one is blocked.
// The lists live in protected-paths.cases.mjs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCommand } from "../../hooks/git-policy.mjs";
import { ALLOWED, BASE_WRITES, BLOCKED, WRAPPERS } from "./protected-paths.cases.mjs";

const decide = (command) => evaluateCommand(command, { branchOf: () => "feature/x" });
const wrong = (commands, wanted) => commands.filter((command) => decide(command).allow !== wanted);
const blocks = (commands) => assert.deepEqual(wrong(commands, false), []);
const allows = (commands) => assert.deepEqual(wrong(commands, true), []);

describe("protected paths: lists", () => {
  it("has at least 40 allowed and 30 blocked commands, and every one is unique", () => {
    assert.ok(ALLOWED.length >= 40, `allowed: ${ALLOWED.length}`);
    assert.ok(BLOCKED.length >= 30, `blocked: ${BLOCKED.length}`);
    assert.equal(new Set([...ALLOWED, ...BLOCKED]).size, ALLOWED.length + BLOCKED.length);
  });

  it("allows every read-only or unrelated command that mentions a protected path", () => {
    allows(ALLOWED);
  });

  it("blocks every write, removal, mode change and unclassifiable command", () => {
    blocks(BLOCKED);
  });

  it("blocks every base write inside every wrapper (bash -c, eval, &&, ;, ||, |, newline, $(), heredoc ...)", () => {
    const wrapped = BASE_WRITES.flatMap((command) => WRAPPERS.map(([, wrap]) => wrap(command)));
    assert.equal(wrapped.length, BASE_WRITES.length * WRAPPERS.length);
    blocks(wrapped);
  });

  it("blocks each base write when the same command is not wrapped", () => {
    blocks(BASE_WRITES);
  });

  it("reports the rule that was broken", () => {
    assert.equal(decide("echo x > .git/hooks/pre-commit").rule, "hooks-dir");
    assert.equal(decide("find .git/hooks -delete").rule, "hooks-dir");
    assert.equal(decide("rm .stack/check").rule, "protected-path");
    assert.equal(decide("tar xf a.tar -C .githooks").rule, "protected-path");
    assert.equal(decide("git config core.hooksPath /x").rule, "hooks-path");
  });
});

describe("protected paths: find", () => {
  it("allows a path that is only excluded, even when find deletes", () => {
    allows([
      "find . -name '*.tmp' -not -path './.git/*' -delete",
      "find . ! -path './.git/hooks/*' -name '*.tmp' -delete",
      "find . -not -path './.stack/*' -exec rm {} +",
      "find . -path ./.git/hooks -prune -o -type f -exec cat {} +",
    ]);
  });

  it("blocks a path that is selected, or an exclusion that does not apply", () => {
    blocks([
      "find . -path './.git/hooks/*' -delete",
      "find . ! -path ./x -o -path './.git/hooks/*' -delete",
      "find . -path ./.git/hooks -prune -exec rm -rf {} +",
      // -delete implies -depth, so -prune does not protect anything
      "find . -path ./.git/hooks -prune -o -type f -delete",
      "find .stack -exec ./tool {} \\;",
      "find .githooks -fprint /tmp/x -delete",
      "find -L .stack -delete",
    ]);
  });

  it("allows find that only reads under a protected path, and -exec of a reader", () => {
    allows(["find .stack -type f -print", "find .git/hooks -exec cat {} +", "find .githooks -exec grep -l x {} \\;"]);
  });
});

describe("protected paths: tar and copy tools", () => {
  it("tar: list and create elsewhere read, extract and write into a protected path blocks", () => {
    allows(["tar tf .stack/a.tar", "tar xf .stack/a.tar -C /tmp/out", "tar -czf /tmp/a.tgz .stack .githooks", "tar --exclude=.stack -xf a.tar"]);
    blocks(["tar xf a.tar .stack/check", "tar -xf a.tar -C .githooks", "tar xf a.tar --directory .githooks", "tar -rf .stack/a.tar x", "tar -xC.stack -f a.tar", "tar --delete -f .stack/a.tar x"]);
  });

  it("rsync, cp, install: only the destination counts, and exclude values are not destinations. ln names every operand", () => {
    allows([
      "rsync -a . /tmp/y/ --exclude .stack",
      "rsync -a --exclude-from .stack/ignore . /tmp/y/",
      "cp .stack/a .stack/b /tmp/dir/",
      "cp -t /tmp/dir .stack/a",
      "install .stack/a /tmp/b",
    ]);
    blocks(["cp -rt .githooks x", "cp x .stack/ -v", "rsync -a --exclude x src .stack/", "install -d .githooks", "ln -s x .stack/a", "mv .stack/a /tmp/b"]);
    // A link to a guard path lets a later write go through the link, so a guard path as the source is blocked too.
    blocks(["ln -s .stack/a /tmp/link", "ln -s .stack /tmp/l", "ln .githooks/pre-commit /tmp/h"]);
  });

  it("dd: only of= is a destination", () => {
    allows(["dd if=.stack/a of=/tmp/b"]);
    blocks(["dd of=.stack/a", "dd if=/tmp/b of=.git/config bs=1"]);
  });
});

describe("protected paths: editors and code", () => {
  it("sed, perl and awk read unless they edit in place or carry a code string that names the path", () => {
    allows(["sed -n 1p .stack/a", "perl -MList::Util -ne 'print' .stack/a", "awk 1 .stack/a", "sed -e p .git/hooks/pre-commit"]);
    blocks(["sed -ni p .stack/a", "perl -pie s/a/b/ .stack/a", "awk -i inplace 1 .stack/a", "perl -e 'unlink q(.stack/a)'", "awk 'BEGIN{print 1 > \".stack/a\"}'"]);
  });

  it("an interpreter with a script file may name a guard file as an argument, but not .git/hooks", () => {
    allows(["node scripts/show.mjs .claude/settings.json", "python3 tools/x.py .stack/risk.json", "./.stack/check"]);
    blocks(["node scripts/show.mjs .git/hooks", "python3 tools/x.py .git/hooks/pre-commit"]);
  });

  it("a variable that holds .git/hooks, and cd into it, stay blocked because later writes cannot be seen", () => {
    blocks(["H=.git/hooks; rm -rf $H/pre-commit", "cd .git/hooks && rm pre-commit", "pushd .git/hooks"]);
  });
});

describe("protected paths: redirects", () => {
  it("a redirect into a protected path blocks whatever the program, and a redirect from one allows", () => {
    blocks([
      "cat a > .stack/x",
      "echo hi 2>.stack/x",
      "echo hi &>.stack/x",
      "echo hi >'.git/hooks/pre-commit'",
      "ls >> .githooks/x",
      "cat <<EOF > .claude/settings.json\n{}\nEOF",
      "true >| .git/config",
    ]);
    allows(["cat < .stack/x > /tmp/out", "wc -l < .githooks/prepare-commit-msg", "grep x .git/config > /tmp/out"]);
  });
});
