// Cases 1 to 28 of `bypasses` and 1 to 18 of `ordinary` are ported from
// packages/core/test/vcs-command-policy.test.ts in joelhooks/rat-stack (MIT, Copyright (c) 2026 Joel Hooks).
// The rest are ours.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCommand, resolveDirs } from "../../hooks/git-policy.mjs";

const onBranch = (name) => ({ branchOf: () => name });
const check = (command, branch = "feature/x") => evaluateCommand(command, onBranch(branch));

const ratBypasses = [
  "git commit --no-verify -m wip",
  "git commit --no-verif -m wip",
  "git push --no-verify",
  "git merge --no-verify feature",
  "cd sub && git commit -m 'wip' --no-verify",
  "/usr/bin/git commit --no-verify",
  "git commit -n -m wip",
  "git commit -nm wip",
  "git commit -anm wip",
  "git commit -m wip -n",
  "git -C . commit -n",
  "git -c core.hooksPath=/dev/null commit -m wip",
  "git -c core.hookspath=/dev/null commit -m wip",
  "git config core.hooksPath .nohooks",
  "git config set core.hooksPath .nohooks",
  "LEFTHOOK=0 git commit -m wip",
  "LEFTHOOK=false git commit -m wip",
  "env LEFTHOOK=0 git commit -m wip",
  "export LEFTHOOK=0",
  "HUSKY=0 git commit -m wip",
  "LEFTHOOK_EXCLUDE=check git commit -m wip",
  "pnpm exec lefthook uninstall",
  "rm -rf .git/hooks",
  "echo exit 0 > .git/hooks/pre-commit",
  "cat noop >> .git/hooks/pre-commit",
  "chmod -x .git/hooks/pre-commit",
  'bash -c "git commit --no-verify"',
  "sh -c 'git commit -n -m wip'",
];

const ratOrdinary = [
  "git status",
  "git commit -m 'add -n flag docs'",
  "git commit -m '--no-verify is banned'",
  "git commit -m wip",
  "git commit -am wip",
  "git commit -F msg.txt -- -n",
  "git commit --message -nope",
  "git commit --author -n -m wip",
  "git log -n 5",
  "git push -n origin main",
  "git add -n .",
  "git config --get core.hooksPath",
  "ls .git/hooks",
  "cat .git/hooks/pre-commit",
  "pnpm check",
  "grep -rn no-verify docs",
  "some-tool --no-verify",
  "LEFTHOOK=1 git commit -m wip",
];


const ourBypasses = [
  // aliases
  "git -c alias.x='commit --no-verify' x -m wip",
  "git -c alias.x='commit -n' x",
  "git -c alias.x='!git commit -n' x",
  "git config alias.ci 'commit --no-verify'",
  "git config --global alias.ci 'commit -n'",
  "git -c alias.p='push --force' p origin feature",
  // eval and nested shells
  'eval "git commit --no-verify -m wip"',
  "eval git commit -n",
  'bash -c "git commit -n"',
  "zsh -c 'git commit --no-verify'",
  "sh -lc 'git commit -n'",
  "bash -c \"bash -c 'git commit -n'\"",
  "bash -c 'eval \"git commit --no-verify\"'",
  "echo hi && bash -c 'git push --force origin x'",
  // wrappers, prefixes, escapes
  "command git commit -n",
  "\\git commit -n",
  "'git' commit -n",
  "g\"i\"t commit -n",
  "FOO=1 BAR=2 git commit --no-verify",
  "FOO=1 LEFTHOOK=0 git commit -m wip",
  "env -i LEFTHOOK=0 git commit -m wip",
  "sudo -u root git commit -n",
  "timeout 30 git commit -n",
  "nice -n 5 git commit -n",
  "env HUSKY=0 pnpm commit",
  "git commit $'--no-verify'",
  "git commit $'\\x2d\\x2dno-verify'",
  "git commit \\\n -n",
  // substitutions
  'echo "$(git commit -n)"',
  "echo `git commit --no-verify`",
  "echo $(git commit -n)",
  // hooksPath
  "git -ccore.hooksPath=/dev/null commit -m wip",
  "git --config-env=core.hooksPath=X commit",
  "git config --global core.hooksPath /dev/null",
  "git config core.hooksPath ''",
  "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit -m x",
  "git -C /repo -c core.hooksPath=/x commit",
  // heredoc fed to a shell
  "bash <<'EOF'\ngit commit -n\nEOF",
  // guard files
  "echo '{}' > .claude/settings.json",
  "rm .githooks/prepare-commit-msg",
  "sed -i s/x/y/ .claude/hooks/guard-git.mjs",
  "chmod -x .githooks/prepare-commit-msg",
  // git -c to protected branches work together with the other rules
  "git -C ../other push --force origin x",
];

const ourOrdinary = [
  "git commit -m 'git commit --no-verify'",
  'git commit -m "do not use --no-verify or -n"',
  "git commit -m \"don't skip hooks\"",
  "git commit -m 'fix: handle eval \"x\" and bash -c'",
  'git commit -m "$(cat <<\'EOF\'\nfix: stop using git commit -n\n\ngit push --force is blocked now.\nEOF\n)"',
  "echo '--no-verify'",
  'echo "run git commit --no-verify to skip"',
  "echo '$(git commit -n)'",
  "echo LEFTHOOK=0",
  "grep LEFTHOOK=0 README.md",
  "git log -n 5",
  "git log --oneline -n 20",
  "git log -n5 --author=me",
  "git diff -n",
  "git show -n 1",
  "git stash -n",
  "git branch -n",
  "git clean -n",
  "git rm -n file",
  "git add -n -- src",
  "git remote add -n origin url",
  "grep -n foo file.txt",
  "grep -rn --include='*.md' no-verify .",
  "npm run x -- -n",
  "npm run test -- --no-verify",
  "pnpm exec vitest -n",
  "cargo test -- -n",
  "tail -n 20 log.txt",
  "head -n 5 file",
  "sort -n numbers.txt",
  "xargs -n 1 echo",
  "echo hello # git commit -n",
  "git commit -m wip # --no-verify",
  "git config --get core.hooksPath",
  "git config --list",
  "git config --unset user.name",
  "git config user.name bob",
  "git config alias.st status",
  "git -c alias.st=status st",
  "git -c user.name=x commit -m ok",
  "git -c color.ui=always log",
  "ls .claude/hooks",
  "cat .claude/settings.json",
  "cat .githooks/prepare-commit-msg",
  "git add .githooks/prepare-commit-msg",
  "echo x > notes/githooks.txt",
  "env FOO=1 node script.mjs",
  "command -v git",
  "timeout 5 sleep 1",
  "bash -c 'echo hi'",
  "bash script.sh",
  "eval \"echo hi\"",
  "git status && git diff",
  "export PATH=$PATH:/x",
  "node --test tests/hooks/",
  "git push --force-with-lease origin feature",
  "git push --force-with-lease=feature:abc origin feature",
  "git push -u origin feature/main-menu",
  "git push origin main-fix",
  "git push origin feature",
  "git push origin HEAD",
  "git push --tags",
  "git push origin refs/heads/feature",
  "git push origin v1.0.0",
  "git push -C",
];

const failures = (commands, wanted, branch) =>
  commands.filter((command) => check(command, branch).allow !== wanted);

describe("git-policy: ported from rat", () => {
  it("has the full rat lists", () => {
    assert.equal(ratBypasses.length, 28);
    assert.equal(ratOrdinary.length, 18);
  });

  it("blocks all 28 rat bypass strings", () => {
    assert.deepEqual(failures(ratBypasses, false), []);
  });

  it("allows all 18 rat look-alikes", () => {
    assert.deepEqual(failures(ratOrdinary, true), []);
  });

  it("never blocks a commit for the words in its message", () => {
    const words = ["-n", "--no-verify", "git commit -n", "'; rm -rf", "$(x)", "\\", "a b c", "LEFTHOOK=0", "#", "eval"];
    for (const word of words) {
      const quoted = `'${word.replaceAll("'", "'\\''")}'`;
      if (word.includes("$(")) continue;
      assert.equal(check(`git commit -m ${quoted}`).allow, true, word);
    }
  });

  it("blocks a bypass whatever the commit message says", () => {
    for (const word of ["hello", "-n", "it's fine", "a;b", "x y z"]) {
      const quoted = `'${word.replaceAll("'", "'\\''")}'`;
      for (const command of [
        `git commit -n -m ${quoted}`,
        `git commit -m ${quoted} --no-verify`,
        `LEFTHOOK=0 git commit -m ${quoted}`,
        `bash -c ${`'git commit -nm ${quoted.replaceAll("'", "'\\''")}'`}`,
      ]) {
        assert.equal(check(command).allow, false, command);
      }
    }
  });
});

describe("git-policy: our bypass cases", () => {
  it("blocks every one", () => {
    assert.deepEqual(failures(ourBypasses, false), []);
  });

  it("names the rule for alias bypasses", () => {
    assert.equal(check("git -c alias.x='commit -n' x").rule, "alias-bypass");
    assert.equal(check("git config alias.ci 'commit --no-verify'").rule, "alias-bypass");
  });
});

describe("git-policy: look-alikes", () => {
  it("allows every one", () => {
    assert.deepEqual(failures(ourOrdinary, true), []);
  });
});

describe("git-policy: unreadable input", () => {
  it("blocks missing, empty and non-string commands", () => {
    for (const value of [undefined, null, "", "   \n", 42, {}, []]) {
      const result = evaluateCommand(value);
      assert.equal(result.allow, false);
      assert.equal(result.rule, "no-command");
    }
  });

  it("blocks an unclosed quote", () => {
    assert.equal(check("git commit -m 'oops").rule, "unparseable-command");
    assert.equal(check('echo "oops').allow, false);
  });

  it("blocks nesting that is too deep", () => {
    let command = "git commit -n";
    for (let level = 0; level < 12; level += 1) command = `eval '${command.replaceAll("'", "'\\''")}'`;
    assert.equal(check(command).allow, false);
  });

  it("gives every block a rule, a reason and a fix", () => {
    const result = check("git commit -n");
    assert.equal(result.allow, false);
    assert.ok(result.rule && result.reason && result.fix);
  });
});

describe("git-policy: commits on main or master", () => {
  it("blocks a commit on main and master", () => {
    for (const branch of ["main", "master"]) {
      assert.equal(check("git commit -m wip", branch).rule, "commit-on-protected-branch");
      assert.equal(check("git commit -am wip", branch).allow, false);
      assert.equal(check("git commit --amend --no-edit", branch).allow, false);
      assert.equal(check("git add . && git commit -m wip", branch).allow, false);
      assert.equal(check("command git commit -m wip", branch).allow, false);
      assert.equal(check("bash -c 'git commit -m wip'", branch).allow, false);
      assert.equal(check("eval 'git commit -m wip'", branch).allow, false);
    }
  });

  it("allows a commit on other branches and when the branch is unknown", () => {
    assert.equal(check("git commit -m wip", "feature/main").allow, true);
    assert.equal(check("git commit -m wip", "maintenance").allow, true);
    assert.equal(check("git commit -m wip", "mainline").allow, true);
    assert.equal(check("git commit -m wip", null).allow, true);
    assert.equal(evaluateCommand("git commit -m wip").allow, true);
  });

  it("allows other git commands on main", () => {
    for (const command of ["git status", "git log -n 3", "git diff", "git pull", "git switch -c feat", "git add ."]) {
      assert.equal(check(command, "main").allow, true, command);
    }
  });

  it("follows git -C and cd to the right directory", () => {
    const seen = [];
    const ctx = { branchOf: (dirs) => (seen.push(dirs), dirs.includes("other") ? "main" : "feature") };
    assert.equal(evaluateCommand("git -C other commit -m x", ctx).allow, false);
    assert.equal(evaluateCommand("git -C ok commit -m x", ctx).allow, true);
    assert.equal(evaluateCommand("cd other && git commit -m x", ctx).allow, false);
    assert.deepEqual(seen[0], ["other"]);
  });

  it("sees a branch switch earlier in the same command", () => {
    assert.equal(check("git switch main && git commit -m x", "feature").allow, false);
    assert.equal(check("git checkout master; git commit -m x", "feature").allow, false);
    assert.equal(check("git switch -c feat && git commit -m x", "main").allow, true);
    assert.equal(check("git checkout -b feat && git commit -m x", "main").allow, true);
    assert.equal(check("git switch feature && git commit -m x", "main").allow, true);
  });
});

describe("git-policy: pushes", () => {
  it("blocks force pushes", () => {
    for (const command of [
      "git push --force",
      "git push -f",
      "git push -f origin feature",
      "git push origin feature --force",
      "git push -fu origin feature",
      "git push -uf origin feature",
      "git push origin +feature",
      "git push origin +HEAD:feature",
      "git push --force --force-with-lease origin feature",
      "git push --force-with-lease -f origin feature",
      "git -C repo push --force origin feature",
      "git -C repo push -f",
      "command git push --force",
      "bash -c 'git push -f'",
    ]) {
      assert.equal(check(command).rule, "force-push", command);
    }
  });

  it("allows force-with-lease", () => {
    for (const command of [
      "git push --force-with-lease",
      "git push --force-with-lease origin feature",
      "git push --force-with-lease=feature origin feature",
      "git push --force-with-lease --force-if-includes origin feature",
      "git push -u --force-with-lease origin feature",
    ]) {
      assert.equal(check(command).allow, true, command);
    }
  });

  it("blocks direct pushes to main and master", () => {
    for (const command of [
      "git push origin main",
      "git push origin master",
      "git push -u origin main",
      "git push origin HEAD:main",
      "git push origin HEAD:refs/heads/main",
      "git push origin feature:main",
      "git push origin refs/heads/main",
      "git push origin main:main",
      "git push origin feature main",
      "git push origin :main",
      "git push --delete origin main",
      "git push --all",
      "git push --mirror",
      "git push --force-with-lease origin main",
      "git -C ../repo push origin main",
      "git -C ../repo -c user.name=x push origin master",
      "git --no-pager -C . push origin main",
      "cd repo && git push origin main",
      "git push --repo=origin main",
      "env FOO=1 git push origin main",
      "git push origin main --tags",
    ]) {
      assert.equal(check(command).rule, "push-protected-branch", command);
    }
  });

  it("blocks a bare push while on main", () => {
    for (const command of ["git push", "git push origin", "git push origin HEAD", "git push -u origin HEAD", "git -C d push"]) {
      assert.equal(check(command, "main").rule, "push-protected-branch", command);
    }
  });

  it("allows a bare push on a feature branch and tag pushes on main", () => {
    assert.equal(check("git push", "feature").allow, true);
    assert.equal(check("git push origin HEAD", "feature").allow, true);
    assert.equal(check("git push --tags", "main").allow, true);
    assert.equal(check("git push origin v1.2.3", "main").allow, true);
  });

  it("uses the directory of git -C for a bare push", () => {
    const ctx = { branchOf: (dirs) => (dirs.includes("m") ? "main" : "feature") };
    assert.equal(evaluateCommand("git -C m push", ctx).allow, false);
    assert.equal(evaluateCommand("git -C f push", ctx).allow, true);
  });
});

// Holes found in an adversarial review. Each `it` name starts with "review:" and a short tag,
// so a planted bug can be checked with --test-name-pattern.
const blocks = (commands, branch) => assert.deepEqual(failures(commands, false, branch), []);
const allows = (commands, branch) => assert.deepEqual(failures(commands, true, branch), []);

describe("git-policy: review fixes", () => {
  it("review:ansi decodes \\u, \\U and \\c escapes in $'..'", () => {
    blocks(["git commit $'\\u002d\\u002dno-verify' -m x", "git commit $'\\U0000002dn' -m x", "git $'\\u0063ommit' -n"]);
  });

  it("review:heredoc ignores << inside quotes, comments and $((..))", () => {
    blocks([
      'echo "<<EOF"\ngit push --force origin x\nEOF',
      "echo '<<EOF'\ngit commit -n -m x\nEOF",
      "# <<EOF\ngit commit -n -m x\nEOF",
      "echo $((1<<y))\ngit commit -n -m x\ny",
    ]);
    allows(["git log --grep='<<EOF'", "x=$((2<<3)); echo $x"]);
  });

  it("review:heredoc-subst checks $(..) in an unquoted heredoc body", () => {
    blocks(["cat <<EOF\n$(git commit -n -m x)\nEOF"]);
    allows(["cat <<'EOF'\n$(git commit -n -m x)\nEOF"]);
  });

  it("review:program sees =git, globbed git paths and git-<command>", () => {
    blocks([
      "=git commit -n -m x",
      "/usr/bin/gi? commit -n -m x",
      '"$(git --exec-path)/git-commit" -n -m x',
      "/opt/homebrew/opt/git/libexec/git-core/git-push origin main",
    ]);
    allows(["[ -f x ] && echo yes", "[[ -n $x ]] && git status", "git-lfs pull"]);
  });

  it("review:globals reads --config-env as a separate word and --attr-source's value", () => {
    blocks(["git --config-env core.hooksPath=HOME commit -m x", "git --config-env alias.x=X x", "git --attr-source HEAD commit -n -m x"]);
  });

  it("review:unset blocks unsetting core.hooksPath and removing [core]", () => {
    blocks([
      "git config --unset core.hooksPath",
      "git config --unset-all core.hooksPath",
      "git config unset core.hooksPath",
      "git config --global --remove-section core",
      "git config --rename-section core old",
    ]);
    allows(["git config --unset user.name", "git config --get core.hooksPath", "git config --remove-section alias"]);
  });

  it("review:envconfig blocks aliases set through GIT_CONFIG_KEY_n and GIT_CONFIG_PARAMETERS", () => {
    blocks([
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.ci GIT_CONFIG_VALUE_0='commit -n' git ci -m x",
      "GIT_CONFIG_PARAMETERS=\"'alias.ci=commit -n'\" git ci",
    ]);
    allows(["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=x git commit -m x"]);
  });

  it("review:aliascase matches alias names without case", () => {
    blocks(["git -c alias.X='commit -n' x -m y", "git -c alias.ci='commit -n' CI"]);
  });

  it("review:paths protects .git/config and .stack, and code strings that name guard files", () => {
    blocks([
      "echo '[core] hooksPath = /dev/null' >> .git/config",
      "sed -i '' 's/githooks/nohooks/' .git/config",
      "echo 'exit 0' > .stack/check",
      "rm .stack/check",
      "chmod -x .stack/check",
      "python3 -c \"open('.claude/settings.json','w').write('{}')\"",
      "node -e \"require('fs').writeFileSync('.githooks/prepare-commit-msg','')\"",
      "sed 's/a/b/w .claude/settings.json' x",
      "dd if=/dev/null of=.githooks/prepare-commit-msg",
      "jq . x | sponge .claude/settings.json",
    ]);
    allows([
      "sed -n '1,20p' .claude/settings.json",
      "cat .git/config",
      "grep -n hooksPath .git/config",
      "./.stack/check",
      "node -e \"console.log(require('./package.json').name)\"",
      "node scripts/build.mjs .claude/settings.json",
    ]);
  });

  it("review:globpath sees globs and doubled slashes that reach .git/hooks or guard files", () => {
    blocks(["rm -rf .git//hooks", "rm -rf .git/./hooks", "rm -rf .git/hook*", "rm .claude/sett*.json", "rm -rf .githook?", "rm -rf .*"]);
    allows(["rm -rf *", "rm -rf ./build/*", "ls .git/h*"]);
  });

  it("review:copy checks only the destination of cp, install, ln and rsync", () => {
    blocks(["cp /dev/null .githooks/prepare-commit-msg", "cp -t .githooks evil", "ln -sf /dev/null .claude/hooks/guard-git.mjs"]);
    allows(["cp .githooks/prepare-commit-msg /tmp/backup", "rsync -a .claude/hooks/ /tmp/hooks-copy/"]);
  });

  it("review:mention allows commit messages and echo text that mention .git/hooks", () => {
    allows(["git commit -m 'docs: explain .git/hooks'", "echo 'never edit .git/hooks'"]);
    blocks(["echo exit 0 > .git/hooks/pre-commit", "git show HEAD:x > .git/hooks/pre-commit"]);
  });

  it("review:plumbing blocks git commit-tree and update-ref on main or master", () => {
    blocks([
      "git commit-tree -m x HEAD^{tree}",
      'git update-ref refs/heads/feature "$(git commit-tree -p HEAD -m x HEAD^{tree})"',
      "git update-ref refs/heads/main HEAD",
    ]);
    allows(["git update-ref -d refs/heads/old", "git update-ref refs/heads/feature/x HEAD"]);
  });

  it("review:refspec blocks heads/main, pattern refspecs and remote.*.push to main", () => {
    blocks([
      "git push origin feature:heads/main",
      "git push origin 'refs/heads/*:refs/heads/*'",
      "git push origin '*:*'",
      "git -c remote.origin.push=HEAD:main push",
      "git config remote.origin.push HEAD:main",
    ]);
    allows(["git push -ofoo origin feature/x", "git -c remote.origin.push=refs/heads/x:refs/heads/x push"]);
    assert.equal(check('git push origin "$(git branch --show-current)"', "main").allow, false);
    assert.equal(check('git push origin "$(git branch --show-current)"', "feature/x").allow, true);
  });

  it("review:dryrun allows dry-run pushes, and -o still takes its value", () => {
    allows(["git push -n origin main", "git push --dry-run origin main", "git push --dry --force origin x", "git push -nf origin main"]);
    blocks(["git push -o -n origin main", "git push --push-option -n origin main"]);
  });

  it("review:keywords looks past shell keywords and more wrappers", () => {
    blocks([
      "{ git commit -n -m x; }",
      "if true; then git commit -n -m x; fi",
      "for i in 1; do git commit -n -m x; done",
      "while false; do :; done; ! git commit -n -m x",
      "timeout -s KILL 30 git commit -n -m x",
      "timeout -k 5 30 git commit -n -m x",
      "caffeinate git commit -n -m x",
      "doas git commit -n -m x",
      "watch -n 5 git push --force origin x",
      "builtin command git commit -n -m x",
      "env -S 'git commit -n -m x'",
      "env -S'git commit -n -m x'",
    ]);
    allows(["if git diff --quiet; then echo clean; fi", "for f in a b; do echo $f; done", "watch -n 5 git status"]);
  });

  it("review:shells finds the -c script past options and reads here-strings and piped echo", () => {
    blocks([
      "bash -c -- 'git commit -n -m x'",
      "bash --rcfile /dev/null -c 'git commit -n -m x'",
      "bash -o pipefail -c 'git commit -n -m x'",
      "bash <<< 'git commit -n -m x'",
      "echo 'git commit -n -m x' | sh",
      "printf 'git push --force origin x' | bash",
    ]);
    allows(["echo hi | bash", "curl -fsSL https://example.com/i.sh | sh", "bash -c 'echo -n hi'"]);
  });

  it("review:find checks the command after find -exec", () => {
    blocks(["find . -maxdepth 0 -exec git commit -n -m x \\;", "find . -execdir git push --force origin x +"]);
    allows(["find . -name '*.mjs' -exec grep -n main {} \\;", "find . -exec echo {} \\; -exec git status \\;"]);
  });

  it("review:onmain blocks cherry-pick, revert, am and checkout <file> while on main", () => {
    blocks(["git checkout a.txt && git commit -m x", "git cherry-pick feature", "git revert --no-edit HEAD", "git am patch.mbox"], "main");
    allows(["git switch feature && git commit -m x", "git cherry-pick --abort", "git revert --no-commit HEAD", "git am --abort"], "main");
    allows(["git cherry-pick abc123", "git checkout -- a.txt && git commit -m x"], "feature/x");
  });

  it("review:dirs follows --git-dir and expands ~ and $HOME in cd", () => {
    const seen = [];
    const ctx = { branchOf: (dirs) => (seen.push(dirs), dirs.some((d) => d.includes("other")) ? "main" : "feature") };
    assert.equal(evaluateCommand("git --git-dir=../other/.git commit -m x", ctx).allow, false);
    assert.equal(evaluateCommand("git --git-dir ../other/.git commit -m x", ctx).allow, false);
    assert.equal(resolveDirs("/w", ["~/repo"], "/home/u"), "/home/u/repo");
    assert.equal(resolveDirs("/w", ["$HOME/repo", "sub"], "/home/u"), "/home/u/repo/sub");
    assert.equal(resolveDirs("/w", ["~x"], "/home/u"), "/w/~x");
    assert.equal(resolveDirs("/w", ["../a"]), "/a");
  });
});
