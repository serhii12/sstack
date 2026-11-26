#!/usr/bin/env node
// prototype-check: checks that a prototype lives in its throwaway place and was never merged.
//
// The rules come from mattpocock/skills skills/engineering/prototype/SKILL.md and
// docs/engineering/prototype.md (MIT, Copyright (c) 2026 Matt Pocock, see NOTICE in the sstack repo):
// a prototype goes on a `prototype/<name>` branch out of main, the branch is never merged, and the
// question and the verdict are written down. The folder `prototypes/<name>/`, the record
// file and the checks are new code.
//
// Rules, for the prototype <name>:
//   name        <name> is lowercase words joined by dashes
//   branch      the branch `prototype/<name>` exists
//   record      `prototypes/<name>/PROTOTYPE.md` exists on that branch, with a `Question:`,
//               a `Base:`, a `Shape:` (logic or UI), a `Host files:` and a `Verdict:` line
//   host        a logic prototype has `Host files: none`
//   base        the base branch is not a prototype branch
//   scope       every file that the prototype changes, compared with the base, is inside
//               `prototypes/<name>/` or is named on the `Host files:` line
//   merged      the base branch and the current checkout do not contain the commits of the
//               prototype branch. The check uses the oldest commit of the branch that touches
//               `prototypes/<name>/`, so a later commit on the branch cannot hide a merge
//   base-clean  the base branch and the current checkout have no `prototypes/<name>/` folder,
//               committed or not
//
// A copy of a prototype file into real code is not a problem. As in Matt Pocock's skill, the
// tested logic of a prototype can be folded into the real code, through `/build` with tests.
// An earlier version failed every such copy. The owner did not ask for that check, and it is gone.
// Pushing the prototype branch is not a problem either.
//
// When the prototype branch is checked out, the check reads the working tree, so files that
// are not committed yet count. Otherwise it reads the tip of the branch.
// The script runs only git commands that read. It changes nothing.
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/prototype/scripts/prototype-check.mjs <name> [--base <branch>]
// In the stack repo it is skills/prototype/scripts/prototype-check.mjs.
// Without --base, the base is the `Base:` line of PROTOTYPE.md, then `main`, then `master`.
//
// Exit codes:
//   0  the prototype passes every rule
//   1  a rule is broken
//   2  usage error
//   3  git cannot run here, or the base branch does not exist

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/prototype/scripts/prototype-check.mjs <name> [--base <branch>]";
export const EXIT = { OK: 0, PROBLEMS: 1, USAGE: 2, GIT: 3 };
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const key = (name) => new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*)?${name}:(?:\\*\\*)?[ \\t]*(.*?)\\s*$`, "im");
export const FIELDS = { question: key("Question"), base: key("Base"), shape: key("Shape"), host: key("Host files"), verdict: key("Verdict") };

export class GitError extends Error {}

function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new GitError(`Cannot run git (${r.error.code ?? r.error.message})`);
  if (r.status !== 0 && !allowFail) throw new GitError(`\`git ${args.join(" ")}\` failed: ${(r.stderr || "").trim().split("\n")[0]}`);
  return r;
}

const branchExists = (cwd, b) => git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`], { allowFail: true }).status === 0;
const zsplit = (s) => s.split("\0").filter(Boolean);

/** Parse the record file. Returns { question, base, host: string[], verdict, missing: string[] }. */
export function parseRecord(text) {
  const out = { missing: [] };
  for (const [k, re] of Object.entries(FIELDS)) {
    const m = text.match(re);
    if (!m) out.missing.push(k);
    out[k] = m ? m[1].replace(/`/g, "").trim() : null;
  }
  out.shape = out.shape ? out.shape.toLowerCase() : out.shape;
  const host = out.host ?? "";
  out.host = /^none\.?$/i.test(host) || host === "" ? [] : host.split(",").map((s) => s.trim().replace(/^\.\//, "")).filter(Boolean);
  return out;
}

export function check(name, { cwd = process.cwd(), base: baseArg } = {}) {
  const problems = [];
  const add = (rule, message, fix) => problems.push({ rule, message, fix });
  const top = git(cwd, ["rev-parse", "--show-toplevel"]).stdout.trim();
  const branch = `prototype/${name}`;
  const dir = `prototypes/${name}/`;
  const recordPath = `${dir}PROTOTYPE.md`;

  if (!branchExists(top, branch)) {
    add("branch", `The branch \`${branch}\` does not exist`, `run \`git switch -c ${branch}\` from a clean checkout before you write the prototype.`);
  }
  const current = git(top, ["branch", "--show-current"]).stdout.trim();
  const onBranch = current === branch;

  let record = null;
  if (onBranch) {
    const p = join(top, recordPath);
    if (existsSync(p)) record = readFileSync(p, "utf8");
  } else if (problems.length === 0) {
    const r = git(top, ["show", `${branch}:${recordPath}`], { allowFail: true });
    if (r.status === 0) record = r.stdout;
  }
  let rec = { host: [], base: null, missing: [] };
  if (record === null) {
    if (problems.length === 0) add("record", `\`${recordPath}\` is missing on \`${branch}\``, "write it first, with the `Question:`, `Base:`, `Shape:`, `Host files:` and `Verdict:` lines from SKILL.md.");
  } else {
    rec = parseRecord(record);
    for (const k of ["question", "base", "shape", "verdict"]) {
      if (rec[k] === "" && !rec.missing.includes(k)) rec.missing.push(k);
    }
    if (rec.missing.length) {
      const names = { question: "Question:", base: "Base:", shape: "Shape:", host: "Host files:", verdict: "Verdict:" };
      add("record", `\`${recordPath}\` has no value for ${rec.missing.map((k) => `\`${names[k]}\``).join(", ")}`, "fill in each line. Write `Shape: logic` or `Shape: UI`, `Host files: none` when the prototype edits no product file, and `Verdict: open` until the user judges it.");
    } else if (rec.shape !== "logic" && rec.shape !== "ui") {
      add("record", `\`Shape: ${rec.shape}\` in \`${recordPath}\` is not logic or UI`, "write `Shape: logic` or `Shape: UI`.");
    } else if (rec.shape === "logic" && rec.host.length > 0) {
      add("host", `The prototype is a logic prototype and names host files (${rec.host.join(", ")})`, "a logic prototype changes no product file. Write `Host files: none`, or change `Shape:` to UI if the prototype is a screen.");
    }
  }

  let base = baseArg ?? rec.base ?? null;
  if (!base) base = branchExists(top, "main") ? "main" : branchExists(top, "master") ? "master" : null;
  if (!base) throw new GitError("No base branch: there is no `main` or `master`, and no `--base` or `Base:` line");
  if (!branchExists(top, base)) throw new GitError(`The base branch \`${base}\` does not exist`);
  if (base.startsWith("prototype/")) {
    add("base", `The base \`${base}\` is a prototype branch`, "start the prototype from the branch where the real work lives, such as `main`, and write it on the `Base:` line.");
    return { name, branch, base, problems };
  }

  // Where the prototype must not appear: the base, and the checkout that the user is on.
  // The full ref, so that a tag with the name of the base cannot stand in for the branch.
  const baseRef = `refs/heads/${base}`;
  const targets = [{ label: `The base \`${base}\``, ref: baseRef }];
  if (!onBranch && current !== base) {
    const head = git(top, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFail: true });
    if (head.status === 0 && head.stdout.trim() !== git(top, ["rev-parse", baseRef]).stdout.trim()) {
      targets.push({ label: `The checkout of ${current ? `\`${current}\`` : "a detached HEAD"}`, ref: "HEAD" });
    }
  }

  if (branchExists(top, branch)) {
    const mb = git(top, ["merge-base", baseRef, branch]).stdout.trim();
    let changed;
    if (onBranch) {
      changed = new Set([
        ...zsplit(git(top, ["diff", "--no-renames", "--name-only", "-z", mb]).stdout),
        ...zsplit(git(top, ["ls-files", "--others", "--exclude-standard", "-z"]).stdout),
      ]);
    } else {
      changed = new Set(zsplit(git(top, ["diff", "--no-renames", "--name-only", "-z", mb, branch]).stdout));
    }
    const host = new Set(rec.host);
    for (const f of [...changed].sort()) {
      if (f.startsWith(dir) || host.has(f)) continue;
      add("scope", `\`${f}\` changed outside \`${dir}\` and is not on the \`Host files:\` line`, `move it into \`${dir}\`, undo the change, or add it to \`Host files:\` if the prototype must edit that page.`);
    }

    const first = git(top, ["rev-list", "--reverse", branch, "--", dir]).stdout.split("\n")[0];
    for (const t of targets) {
      const ancestor = first !== "" && git(top, ["merge-base", "--is-ancestor", first, t.ref], { allowFail: true }).status === 0;
      if (ancestor) {
        add("merged", `${t.label} contains the commits of \`${branch}\``, `revert the merge in a pull request. The prototype branch is never merged. To keep its tested logic, copy that module into a task branch with \`/build\`, with tests.`);
      }
    }
  }

  for (const t of targets) {
    const inTarget = zsplit(git(top, ["ls-tree", "-r", "--name-only", "-z", t.ref, "--", dir]).stdout);
    if (inTarget.length) {
      add("base-clean", `${t.label} has ${inTarget.length} file(s) under \`${dir}\``, `remove \`${dir}\` from it in a pull request. The prototype lives only on \`${branch}\`.`);
    }
  }
  if (!onBranch) {
    const dirty = zsplit(git(top, ["status", "--porcelain", "-z", "--untracked-files=all", "--", dir]).stdout);
    if (dirty.length) {
      add("base-clean", `The checkout of ${current ? `\`${current}\`` : "a detached HEAD"} has prototype files that are not committed under \`${dir}\``, `run \`git switch ${branch}\` and keep the files there. Write prototype files only on \`${branch}\`.`);
    }
  }
  return { name, branch, base, problems };
}

export function formatProblem(p) {
  return `${p.rule}  ${p.message}. Fix: ${p.fix}`;
}

export function run(argv, { cwd = process.cwd() } = {}) {
  const out = [];
  const err = [];
  let name;
  let base;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") return { code: EXIT.OK, out: [USAGE], err };
    if (a === "--base") {
      base = argv[++i];
      if (!base || base.startsWith("-")) {
        err.push("--base needs a branch name. Fix: run with `--base main`.", USAGE);
        return { code: EXIT.USAGE, out, err };
      }
      continue;
    }
    if (a.startsWith("-")) {
      err.push(`Unknown option ${a}. Fix: use only \`--base <branch>\`.`, USAGE);
      return { code: EXIT.USAGE, out, err };
    }
    if (name !== undefined) {
      err.push("Too many arguments. Fix: pass one prototype name.", USAGE);
      return { code: EXIT.USAGE, out, err };
    }
    name = a;
  }
  if (name === undefined) {
    err.push("No prototype name. Fix: pass the name, such as `refund-states`.", USAGE);
    return { code: EXIT.USAGE, out, err };
  }
  if (!NAME.test(name)) {
    err.push(`The name \`${name}\` is not lowercase words joined by dashes. Fix: use a name such as \`refund-states\`.`, USAGE);
    return { code: EXIT.USAGE, out, err };
  }
  let r;
  try {
    r = check(name, { cwd, base });
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    err.push(`${e.message}. Fix: run the check from the project root of a git repo, and pass \`--base <branch>\` if the base is not \`main\`.`);
    return { code: EXIT.GIT, out, err };
  }
  for (const p of r.problems) out.push(formatProblem(p));
  out.push(`Prototype ${r.branch} checked against ${r.base}, ${r.problems.length} problem(s).`);
  return { code: r.problems.length === 0 ? EXIT.OK : EXIT.PROBLEMS, out, err };
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
  const r = run(process.argv.slice(2));
  for (const l of r.out) console.log(l);
  for (const l of r.err) console.error(`prototype-check: ${l}`);
  process.exitCode = r.code;
}
