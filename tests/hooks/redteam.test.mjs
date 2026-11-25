// Red team checks for hooks/git-policy.mjs and hooks/guard-git.mjs. The command lists live in redteam.cases.mjs.
// Each list entry is a command, or a pair of [command, branch the hook sees].
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateCommand } from "../../hooks/git-policy.mjs";
import { ATTACKS, BENIGN, FOUND_BY_RED_TEAM, KNOWN_OPEN } from "./redteam.cases.mjs";

const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../hooks/guard-git.mjs");

const decide = (command, branch = "feature/x") => evaluateCommand(command, { branchOf: () => branch });
const commandOf = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const wrong = (entries, wanted) => entries.filter((entry) => decide(...(Array.isArray(entry) ? entry : [entry])).allow !== wanted).map(commandOf);
const timed = (command) => {
  const start = process.hrtime.bigint();
  const result = decide(command);
  return { result, ms: Number(process.hrtime.bigint() - start) / 1e6 };
};

describe("red team: lists", () => {
  it("has at least 150 attacks and 80 benign commands, and no command twice", () => {
    assert.ok(ATTACKS.length >= 150, `attacks: ${ATTACKS.length}`);
    assert.ok(BENIGN.length >= 80, `benign: ${BENIGN.length}`);
    const all = [...ATTACKS, ...BENIGN, ...KNOWN_OPEN].map((entry) => JSON.stringify(Array.isArray(entry) ? entry : [entry]));
    assert.equal(new Set(all).size, all.length);
  });

  it("blocks every attack", () => {
    assert.deepEqual(wrong(ATTACKS, false), []);
  });

  it("allows every benign command", () => {
    assert.deepEqual(wrong(BENIGN, true), []);
  });

  it("allows the known open commands, so the header stays true", () => {
    assert.deepEqual(wrong(KNOWN_OPEN, true), []);
  });

  it("keeps every command that had a wrong verdict in the attack or benign list", () => {
    const attacks = new Set(ATTACKS.map(commandOf));
    const benign = new Set(BENIGN.map(commandOf));
    assert.deepEqual(FOUND_BY_RED_TEAM.holes.filter((command) => !attacks.has(command)), []);
    assert.deepEqual(FOUND_BY_RED_TEAM.falseBlocks.filter((command) => !benign.has(command)), []);
  });
});

describe("red team: no-verify and hook switches", () => {
  it("reads -u and -S as flags with a value, not as -n", () => {
    for (const command of ["git commit -uno -m x", "git commit -unormal -m x", "git commit -m x -S", "git commit -Sn -m x"]) {
      assert.equal(decide(command).allow, true, command);
    }
    for (const command of ["git commit -nS", "git commit -an -m x", "git commit -m x -qn"]) assert.equal(decide(command).rule, "no-verify", command);
  });

  it("treats --no-verify as data in search and show commands, and as a flag elsewhere", () => {
    for (const command of ["git grep -e --no-verify", "git log --grep=--no-verify", "git show --no-verify"]) {
      assert.equal(decide(command).allow, true, command);
    }
    for (const command of ["git push --no-verify", "git merge --no-verify x", "git rebase --no-verify main", "git pull --no-verify"]) {
      assert.equal(decide(command).rule, "no-verify", command);
    }
  });

  it("blocks HUSKY_SKIP_HOOKS and allows it set to 0", () => {
    assert.equal(decide("HUSKY_SKIP_HOOKS=1 git commit -m x").rule, "hook-env");
    assert.equal(decide("env HUSKY_SKIP_HOOKS=true git commit -m x").rule, "hook-env");
    assert.equal(decide("HUSKY_SKIP_HOOKS=0 git commit -m x").allow, true);
  });

  it("blocks include.path and includeIf in -c, --config-env and git config, and allows reads", () => {
    for (const command of ["git -c include.path=x commit", "git --config-env=include.path=X commit", "git config --add include.path x", "git config includeIf.gitdir:/p.path x"]) {
      assert.equal(decide(command).rule, "hooks-path", command);
    }
    for (const command of ["git config --get include.path", "git config includeIf.gitdir:/p.path"]) assert.equal(decide(command).allow, true, command);
  });

  it("gives the arguments after a shell alias to the alias text", () => {
    assert.equal(decide("git -c alias.x='!git commit' x -n").rule, "alias-bypass");
    assert.equal(decide("git -c alias.x='!git commit \"$@\"' x -n").rule, "alias-bypass");
    assert.equal(decide("git -c alias.x='!git push origin' x main").rule, "alias-bypass");
    assert.equal(decide("git -c alias.x='!echo hi' x there").allow, true);
  });

  it("finds git behind more wrappers, a command lookup, a string runner and the function keyword", () => {
    for (const command of ["arch -arm64 git commit -n", "xcrun git commit -n", "flock /tmp/l git commit -n", "watch -n1 'git commit -n'", "ssh h 'git push -f'", "timeout .5 git commit -n", "$(command -v git) commit -n", "`which git` commit -n", "function f { git commit -n; }; f"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["watch git status", "ssh host 'git status'", "arch -arm64 brew install git", "$(command -v git) status", "which -a git"]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("reads git commands in the quoted strings of interpreter code and in heredocs for an interpreter", () => {
    assert.equal(decide("python3 -c \"import subprocess; subprocess.run(['git','commit','-n'])\"").rule, "no-verify");
    assert.equal(decide("node -e \"execSync('git push origin main')\"").rule, "push-protected-branch");
    assert.equal(decide("python3 <<'PY'\nimport subprocess\nsubprocess.run(['git','push','-f'])\nPY").rule, "force-push");
    assert.equal(decide("python3 <<'PY'\nimport os\nos.remove('.githooks/pre-commit')\nPY").rule, "protected-path");
    assert.equal(decide("python3 -c \"subprocess.run(['git','status'])\"").allow, true);
    assert.equal(decide("python3 <<'PY'\nprint(1)\nPY").allow, true);
  });
});

describe("red team: branches and pushes", () => {
  it("reads --no-dry-run as the end of a dry run, in push, rm and clean", () => {
    assert.equal(decide("git push --dry-run --no-dry-run origin main").rule, "push-protected-branch");
    assert.equal(decide("git push -n --no-dry-run -f origin x").rule, "force-push");
    assert.equal(decide("git push --dry-run origin main").allow, true);
    assert.equal(decide("git rm -n --no-dry-run .stack/x").rule, "protected-path");
    assert.equal(decide("git rm -n .stack/x").allow, true);
    assert.equal(decide("git clean -n --no-dry-run -f .stack").rule, "protected-path");
  });

  it("reads main and master without regard to case", () => {
    assert.equal(decide("git push origin HEAD:MAIN").rule, "push-protected-branch");
    assert.equal(decide("git update-ref refs/heads/Main abc").rule, "commit-on-protected-branch");
    assert.equal(decide("git commit -m x", "Main").rule, "commit-on-protected-branch");
    assert.equal(decide("git checkout MAIN && git commit -m x").rule, "commit-on-protected-branch");
  });

  it("blocks the commands that move main without a commit", () => {
    for (const command of ["git update-ref refs/heads/main HEAD", "echo 'update refs/heads/main x' | git update-ref --stdin", "git branch -f main HEAD", "git branch --force master origin/x", "git branch -M main", "git branch -m old main", "git branch -fq main HEAD~1"]) {
      assert.equal(decide(command).rule, "commit-on-protected-branch", command);
    }
    assert.equal(decide("git update-ref HEAD abc", "main").rule, "commit-on-protected-branch");
    for (const command of ["git branch -f feature main", "git branch -c main feature", "git branch -m old new", "git branch -a", "git branch -vv", "git branch --contains main", "git update-ref HEAD abc", "git update-ref refs/heads/feature/x HEAD"]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("follows symbolic-ref, a rename and a new work tree to main for a later commit in the same command", () => {
    for (const command of ["git symbolic-ref HEAD refs/heads/main && git commit -m x", "git branch -m main && git commit -m x", "git worktree add ../w main && git -C ../w commit -m x", "git worktree add -b main ../w && cd ../w && git commit -m x", "git worktree add ../w -B master && cd ../w; git commit -m x"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["git symbolic-ref HEAD refs/heads/feature && git commit -m x", "git worktree add ../w feature && git -C ../w commit -m x", "git worktree add ../w -b x main && git -C ../w commit -m y", "git worktree add ../w main && git commit -m x"]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("does not treat git checkout <rev> -- <path> as a switch to main", () => {
    assert.equal(decide("git checkout main -- src/file.ts && git commit -m x").allow, true);
    assert.equal(decide("git checkout main src/a.ts && git commit -m x").allow, true);
    assert.equal(decide("git checkout main && git commit -m x").rule, "commit-on-protected-branch");
    assert.equal(decide("git checkout -q main && git commit -m x").rule, "commit-on-protected-branch");
  });

  it("gives GIT_DIR to the branch lookup as a folder", () => {
    const seen = [];
    evaluateCommand("GIT_DIR=/tmp/other/.git git commit -m x", { branchOf: (dirs) => (seen.push(dirs), "main") });
    assert.deepEqual(seen, [["/tmp/other/.git"]]);
    assert.equal(evaluateCommand("env GIT_DIR=/x/.git git commit -m y", { branchOf: () => "main" }).allow, false);
  });
});

describe("red team: protected paths", () => {
  it("writes through >& and &>>", () => {
    for (const command of ["echo x >& .stack/check", "echo x >&.stack/check", "echo x &>> .githooks/pre-commit"]) assert.equal(decide(command).allow, false, command);
    for (const command of ["echo x >& /tmp/o", "ls >&/dev/null", "echo x >&2", "ls > /tmp/o 2>&1"]) assert.equal(decide(command).allow, true, command);
  });

  it("follows cd for every program, not only git", () => {
    for (const command of ["cd .stack && rm check", "cd .claude && rm settings.json", "cd .git && rm -rf hooks", "cd .git && echo x > config", "cd .claude/hooks && cp /tmp/e guard-git.mjs", "cd .stack && rm -rf .", "cd .githooks && dd of=pre-commit", "cd .. && cd .stack && rm check", "pushd .githooks; rm pre-commit", "(cd .githooks && rm pre-commit)", "cd .githooks\nrm pre-commit", "cd .stack && truncate -s0 check"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["cd .git && cat config", "cd .claude && echo x > notes.md", "cd .git && rm -f index.lock", "cd .stack && ls -la", "cd .githooks && cp pre-commit /tmp/", "cd src && rm hooks.log", "cd .claude/agents && rm old.md"]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("blocks removing, moving or recursive chmod of the whole .git or .claude folder, and allows nested .git folders", () => {
    for (const command of ["rm -rf .git", "rm -rf .claude", "rm -rf ./.claude/", "rm -rf ../.git", 'rm -rf "$PWD/.git"', "mv .git .git.bak", "mv .claude /tmp/c", "chmod -R 000 .git", "rm -rf .git/.", "rm -rf .CLAUDE"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["rm -rf pkg/.git", "rm -rf node_modules/pkg/.git", "mv notes.md .claude/", "mv a .claude/agents/", "chmod -R u+w .gitignore", "rm -rf .github", "rm -rf .claudeignore", "rm .gitattributes"]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("blocks a link to a guard path and a write to a ref or HEAD file of main", () => {
    for (const command of ["ln -s .stack /tmp/l", "ln .stack/check /tmp/h", "echo abc > .git/refs/heads/main", "echo x > .git/HEAD", "cp x .git/packed-refs"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["ln -s ../shared/a.ts src/a.ts", "cat .git/HEAD", "echo ref > .git/refs/heads/feature", "cp x .git/packed-refs.bak"]) assert.equal(decide(command).allow, true, command);
  });

  it("does not block a file whose name only starts with a guard name", () => {
    for (const command of ["echo x > .claude/settings.json.md", "cp a .claude/settings.json.bak", "echo x > .git/config.bak"]) assert.equal(decide(command).allow, true, command);
    assert.equal(decide("echo x > .claude/settings.json").allow, false);
  });

  it("joins a substitution to its word", () => {
    for (const command of ["rm -rf $(git rev-parse --show-toplevel)/.githooks", "rm -rf `git rev-parse --show-toplevel`/.stack", "cp x $(git rev-parse --show-toplevel)/.githooks/", "git push $(git remote) main"]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["rm $(git ls-files -o)", "cp $(ls .stack/*.md | head -1) docs/", "echo $(cat .stack/enforcement.md) > out"]) assert.equal(decide(command).allow, true, command);
  });

  it("reads output options and the names of the interpreter programs", () => {
    for (const command of ["curl -o .githooks/x u", "curl -sSo .githooks/x u", "curl --output=.githooks/x u", "wget -qO .githooks/x u", "wget -P .githooks u", "unzip x.zip -d .githooks", "unzip x.zip -d.githooks", "sort -o.stack/x in", "sort x --output=.stack/x", "ditto /tmp/e .stack", "gsed -i s/a/b/ .stack/x", "perl -0777pi -e s/a/b/ .stack/x", "ruby -pi -e x .stack/x", "perl5.34 -pi -e x .stack/x", "python3.12 -c \"open('.stack/x','w')\"", "nodejs -e \"rm('.stack/x')\"", "lua -e \"os.remove('.stack/x')\""]) {
      assert.equal(decide(command).allow, false, command);
    }
    for (const command of ["curl -o out.json https://x", "curl -sS https://x -o /tmp/x", "wget -O /tmp/x u", "unzip x.zip -d build", "sort -o /tmp/x in", "gsed -i s/a/b/ src/a.ts", "ruby -pi -e x src/a.rb", "python3.12 -c \"print(1)\""]) {
      assert.equal(decide(command).allow, true, command);
    }
  });

  it("reads brace sequences and big brace words", () => {
    assert.equal(decide("rm -rf .{s..s}tack").allow, false);
    assert.equal(decide("rm {a,.stack}{/,/}{/,/}{/,/}{/,/}{/,/}{/,/}{/,/}{x,x}/check").allow, false);
    // 2 to the power of 13 is more than 4096 variants, so the word is read for the guard name only.
    assert.equal(decide(`rm ${"{a,b}".repeat(13)}/.stack/check`).allow, false);
    assert.equal(decide(`rm ${"{a,b}".repeat(13)}/data`).allow, true);
    assert.equal(decide("touch file{1..1000}.txt").allow, true);
    assert.equal(decide("rm {a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}x").allow, true);
  });
});

describe("red team: limits and speed", () => {
  it("blocks a null byte and a command over 256 KB", () => {
    assert.equal(decide("git status\0; git commit -n").rule, "unparseable-command");
    assert.equal(decide("echo a\0b").allow, false);
    assert.equal(decide(`echo ${"a".repeat(300 * 1024)}`).rule, "command-too-long");
    assert.equal(decide(`echo ${"a".repeat(200 * 1024)}`).allow, true);
  });

  it("blocks more than 256 cd words and nests that are too deep", () => {
    assert.equal(decide("cd a;".repeat(300) + "ls").allow, false);
    assert.equal(decide("$(".repeat(20) + "ls" + ")".repeat(20)).rule, "unparseable-command");
  });

  it("checks a 10000 character benign command in well under a second", () => {
    const { result, ms } = timed("git log --oneline -5 && echo hello world; ".repeat(250).slice(0, 10000));
    assert.equal(result.allow, true);
    assert.ok(ms < 500, `took ${ms} ms`);
  });

  for (const [name, command] of [
    ["thousands of &&", "echo ok && ".repeat(20000)],
    ["80000 nested $(", "$(".repeat(80000)],
    ["80000 nested $((", "$((".repeat(80000)],
    ["300 cd words and a rm", "cd a;".repeat(20000) + "rm x"],
    ["40 brace groups", `rm ${"{a,b}".repeat(40)}`],
    ["400 brace groups", `rm ${"{a,b}".repeat(400)}`],
    ["brace nest 1000", `rm ${"{a,".repeat(1000)}${"}".repeat(1000)}`],
    ["a brace word of 200 KB", `rm {${"a,".repeat(100000)}b}`],
    ["50000 eval words", `${"eval ".repeat(50000)}ls`],
    ["20000 git status", "git status;".repeat(20000)],
    ["10000 git push", "git push origin feat;".repeat(10000)],
    ["20000 heredocs", "cat <<A\n".repeat(20000)],
    ["100000 quotes", "'".repeat(100000)],
    ["100000 open parentheses", "(".repeat(100000)],
    ["30000 code strings", `python3 -c "${"'git x' ".repeat(20000)}"`],
    ["a 200 KB path", `rm ${"a/".repeat(100000)}.stack`],
  ]) {
    it(`checks ${name} in under one second`, () => {
      const { ms } = timed(command);
      assert.ok(ms < 1000, `took ${ms} ms`);
    });
  }
});

describe("red team: guard-git fails closed", () => {
  const send = (input, env = {}) => spawnSync("node", [hook], { input, encoding: "utf8", timeout: 20000, env: { ...process.env, ...env }, maxBuffer: 1 << 26 });
  const payload = (command) => JSON.stringify({ tool_input: { command } });
  const blocked = (result, pattern) => {
    assert.equal(result.status, 2, `status ${result.status}, stderr: ${result.stderr.slice(0, 300)}`);
    assert.match(result.stderr, /^Blocked: .*\nWhy: .*\nFix: /u);
    if (pattern) assert.match(result.stderr, pattern);
  };

  it("blocks a null byte in the command", () => {
    blocked(send(payload("echo a\0b")), /null byte/u);
    blocked(send(payload("git status\0; git commit -n")), /null byte/u);
  });

  it("blocks a command of 1 MB with a message that says why", () => {
    blocked(send(payload(`echo ${"a".repeat(1024 * 1024)}`)), /256 KB/u);
    blocked(send(payload("echo ok && ".repeat(95000) + "git commit -n")), /256 KB/u);
  });

  it("blocks hook input of more than 4 MB without parsing it", () => {
    blocked(send(payload(`echo ${"a".repeat(5 * 1024 * 1024)}`)), /4 MB/u);
  });

  it("blocks an invalid byte sequence and a null byte in the raw input", () => {
    blocked(send(Buffer.from([0x7b, 0xff, 0xfe, 0x7d])));
    blocked(send(`${payload("git status")}\0`));
  });

  it("blocks when stdin never closes, and does not hang", async () => {
    const child = spawn("node", [hook], { env: { ...process.env, GUARD_GIT_WATCHDOG_MS: "400" }, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const code = await new Promise((resolve) => child.on("close", resolve));
    assert.equal(code, 2);
    assert.match(stderr, /did not end within/u);
  });

  it("blocks the unclosed quote and deep nesting at the hook level, and allows a plain command", () => {
    blocked(send(payload('echo "x')), /echo/u);
    blocked(send(payload("$(".repeat(5000) + "git commit -n" + ")".repeat(5000))));
    assert.equal(send(payload("git status")).status, 0);
  });
});
