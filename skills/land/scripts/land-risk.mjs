#!/usr/bin/env node
// land-risk: computes the risk level of a change from the files that it touches.
//
// The agent never picks the level. This script does, from two inputs:
//   1. the changed paths: from git (`--base` and `--head`), or from a list (`--paths`)
//   2. the config `.stack/risk.json`: read from the BASE ref with `git show <base>:.stack/risk.json`,
//      never from the head, so a change cannot lower its own risk. `--config <file>` is for tests.
//
// Rules, per path (land-lib.mjs has the code):
//   path-not-plain       a path with `..`, `.`, an empty part, a backslash or a control character is high
//   builtin:*            the fences are high: CI workflow files, the hook folders (.githooks/, .husky/),
//                        .claude/, .agents/, .codex/, .stack/ with the risk config, and CODEOWNERS. The
//                        config cannot lower them. Case, a dot or space at the end of a name and hidden
//                        characters do not matter.
//   config:<level>:<glob> the first matching glob of the config, checked high, then medium, then low.
//                        High and medium globs ignore case. Low globs need the exact case.
//   unmatched            a path that matches no rule is medium
// If the base has no `.stack/risk.json`, the default config of land-lib.mjs applies (`configFound` is
// false): manifests, lockfiles and agent instruction files are high, docs and Markdown are low.
// A config with an error gives level high with the rule `config-error`. The gate stops on such a config.
// A rename counts both the old and the new path. No changed file at all is high (no-changed-files).
// The level of the change is the highest level of its paths. The rule of the first such path decides.
// Only a high level needs a person. Low and medium merge when the other gates pass.
//
// New code. Idea: kcd-skills skills/autopilot/scripts/ship-pr.mjs (MIT, Copyright (c) 2026
// Kent C. Dodds) has risk tiers, but the agent picks the tier there. Here the files pick it.
//
// Usage (from the project root):
//   node .claude/skills/land/scripts/land-risk.mjs [--base <ref>] [--head <ref>] [--repo <dir>]
//   node .claude/skills/land/scripts/land-risk.mjs --paths <file|-> --config <file>
// `--base` defaults to origin/HEAD, then origin/main, then origin/master.
// Output: one JSON object: level, rule, path, paths (per level), reasons, base, configFound, configErrors.
// Exit 0 the level was computed (any level). Exit 2 usage or read error.

import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, computeRisk, git, msg, parseConfigText } from "./land-lib.mjs";

const USAGE =
  "Usage: node .claude/skills/land/scripts/land-risk.mjs [--base <ref>] [--head <ref>] [--repo <dir>]\n" +
  "       node .claude/skills/land/scripts/land-risk.mjs --paths <file|-> --config <file>";

export class UsageError extends Error {}

/** Parse `git diff --name-status -z` output. A rename or copy gives both paths. */
export function parseNameStatus(out) {
  const parts = out.split("\0");
  const paths = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i];
    if (!status) {
      i++;
      continue;
    }
    if (/^[RC]/.test(status)) {
      paths.push(parts[i + 1], parts[i + 2]);
      i += 3;
    } else {
      paths.push(parts[i + 1]);
      i += 2;
    }
  }
  return paths.filter((p) => typeof p === "string" && p !== "");
}

/** Find the default base ref: origin/HEAD, then origin/main, then origin/master. */
export function defaultBase(dir) {
  const sym = git(dir, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (sym.ok && sym.out.trim()) return sym.out.trim();
  for (const c of ["origin/main", "origin/master"]) {
    if (git(dir, ["rev-parse", "--verify", "--quiet", `${c}^{commit}`]).ok) return c;
  }
  throw new UsageError(msg("no base ref found (tried origin/HEAD, origin/main and origin/master)", "run git fetch origin, or pass --base <default branch ref>"));
}

/** The risk for a parsed config. A config with an error cannot lower anything: the level is high. */
function withConfig(paths, cfg) {
  const risk = computeRisk(paths, cfg.config);
  const bad = cfg.errors.length > 0;
  return { ...risk, ...(bad ? { level: "high", rule: "config-error", path: CONFIG_PATH } : {}), configFound: cfg.found, configErrors: cfg.errors };
}

/** Risk from git: the paths of merge-base(base, head)..head, and the config from the base ref. */
export function riskFromGit({ dir = ".", base, head = "HEAD" } = {}) {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new UsageError(msg(`not a git repository: ${resolve(dir)}`, "run the script inside the repo, or pass --repo <dir>"));
  const root = top.out.trim();
  const b = base ?? defaultBase(root);
  for (const ref of [b, head]) {
    if (!git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).ok) throw new UsageError(msg(`the ref ${ref} is not a commit`, "pass a branch or commit that exists"));
  }
  const mb = git(root, ["merge-base", b, head]);
  if (!mb.ok) throw new UsageError(msg(`${b} and ${head} share no history`, "pass the default branch of this repo as --base"));
  const diff = git(root, ["diff", "--name-status", "-z", "-M", "-C", mb.out.trim(), head, "--"]);
  if (!diff.ok) throw new UsageError(msg(`git diff failed (${diff.err})`, "run git status and fix what it reports"));
  const shown = git(root, ["show", `${b}:${CONFIG_PATH}`]);
  const cfg = parseConfigText(shown.ok ? shown.out : null);
  return { ...withConfig(parseNameStatus(diff.out), cfg), base: b };
}

/** Risk from a list of paths (one per line) and a config file. For tests and for other hosts. */
export function riskFromLists({ pathsText, configText }) {
  const paths = pathsText.split(/\r?\n/).filter((l) => l !== "");
  const cfg = parseConfigText(configText);
  return { ...withConfig(paths, cfg), base: null };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(msg(`${a} needs a value`, USAGE.split("\n")[0]));
      return v;
    };
    if (a === "--base") o.base = val();
    else if (a === "--head") o.head = val();
    else if (a === "--repo") o.repo = val();
    else if (a === "--paths") o.paths = val();
    else if (a === "--config") o.config = val();
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new UsageError(msg(`unknown argument ${a}`, "use only the arguments in the usage line"));
  }
  if ((o.paths === undefined) !== (o.config === undefined)) throw new UsageError(msg("--paths and --config go together", "pass both, or neither"));
  if (o.paths !== undefined && (o.base || o.head)) throw new UsageError(msg("--paths cannot go with --base or --head", "pick one input"));
  return o;
}

export function main(argv, { out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n") } = {}) {
  let o;
  try {
    o = parseArgs(argv);
    if (o.help) {
      out(USAGE);
      return 0;
    }
    let result;
    if (o.paths !== undefined) {
      const pathsText = readFileSync(o.paths === "-" ? 0 : o.paths, "utf8");
      const configText = readFileSync(o.config, "utf8");
      result = riskFromLists({ pathsText, configText });
    } else {
      result = riskFromGit({ dir: o.repo ?? ".", base: o.base, head: o.head ?? "HEAD" });
    }
    out(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    if (e instanceof UsageError || e.code === "ENOENT") {
      err(`land-risk: ${e instanceof UsageError ? e.message : msg(`cannot read ${e.path}`, "check the path")}`);
      return 2;
    }
    throw e;
  }
}

/** True when this file is the script that node started. Compares real paths, so a symlink to it still runs. */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv.slice(2));
}
