import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.resolve(here, "../../templates/githooks/prepare-commit-msg");

const git = (cwd, ...args) =>
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

const writeCheck = (repo, code) => {
  writeFileSync(path.join(repo, ".stack/check"), `#!/bin/sh\necho CHECK-RAN\nexit ${code}\n`);
  chmodSync(path.join(repo, ".stack/check"), 0o755);
};

describe("prepare-commit-msg template", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "pcm-"));
    git(repo, "init", "-q", "-b", "feature");
    mkdirSync(path.join(repo, ".githooks"));
    mkdirSync(path.join(repo, ".stack"));
    copyFileSync(hook, path.join(repo, ".githooks/prepare-commit-msg"));
    chmodSync(path.join(repo, ".githooks/prepare-commit-msg"), 0o755);
    git(repo, "config", "core.hooksPath", ".githooks");
    writeFileSync(path.join(repo, "a"), "a\n");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  const commit = (...flags) => git(repo, "commit", "-q", "--allow-empty", ...flags, "-m", "x");

  it("refuses when the check fails, also with -n and --no-verify", () => {
    writeCheck(repo, 1);
    git(repo, "add", "-A");
    for (const flags of [[], ["-n"], ["--no-verify"]]) {
      const result = commit(...flags);
      assert.notEqual(result.status, 0, flags.join(" "));
      assert.match(result.stderr, /CHECK-RAN/u);
      assert.match(result.stderr, /Commit refused\..*Fix: /u);
    }
  });

  it("commits when the check passes", () => {
    writeCheck(repo, 0);
    git(repo, "add", "-A");
    assert.equal(commit().status, 0);
  });

  it("refuses when a tracked check is deleted or not executable", () => {
    writeCheck(repo, 0);
    git(repo, "add", "-A");
    assert.equal(commit().status, 0);

    chmodSync(path.join(repo, ".stack/check"), 0o644);
    assert.match(commit().stderr, /cannot run/u);
    assert.notEqual(commit().status, 0);

    rmSync(path.join(repo, ".stack/check"));
    assert.notEqual(commit().status, 0);

    git(repo, "rm", "-q", "--cached", ".stack/check");
    assert.notEqual(commit().status, 0, "still in HEAD");
  });

  it("warns and commits when the repo never had a check", () => {
    git(repo, "add", "a");
    const result = commit();
    assert.equal(result.status, 0);
    assert.match(result.stderr, /no \.stack\/check/u);
  });
});
