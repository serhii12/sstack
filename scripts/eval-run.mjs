#!/usr/bin/env node
// eval-run: runs the evals of this stack against a real agent binary and gives a pass rate.
//
// For each eval, each model and each run, the script:
//   1. makes a fresh temp folder outside every git repo,
//   2. prepares the setup from the `## Checks` block of the eval file,
//   3. runs `claude -p` headless with the project skills, hooks and deny rules,
//   4. reads the stream-json output and checks every assert,
//   5. deletes the temp folder.
//
// The format of an eval file is in evals/README.md.
//
// Usage: node scripts/eval-run.mjs [--skill <name>] [--eval <file>] [--runs N] [--models a,b]
//          [--budget-usd n] [--min-pass-rate r] [--out <dir>] [--claude <path>]
//          [--timeout-sec n] [--jobs n] [--allow-network] [--dry-run] [--baseline] [--gate] [--keep]
// Exit 0 every eval meets its threshold, 1 an eval does not, 2 usage or setup error.
// With --gate, only a "regression" eval below the threshold gives exit 1.
//
// The script never pushes and never runs `gh`. It never passes a flag that turns off hooks
// or skips permissions. The functions that hold logic are pure and are exported for tests.

import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync, closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync,
  realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const STACK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export class UsageError extends Error {}

// ---------------------------------------------------------------------------
// 1. Parse an eval file
// ---------------------------------------------------------------------------

const SETUP_KEYS = ["files", "gitInit", "installStack", "origin", "branch", "githooks", "commit", "uncommitted"];
const CHECK_KEYS = [
  "setup", "prompt", "allowedTools", "budgetUsd", "assert",
  "tools", "disallowedTools", "turns", "baseline", "set", "permissionMode",
];
const ASSERT_KEYS = [
  "skillLoaded", "skillNotLoaded", "toolCalled", "toolNotCalled", "outputMatches", "outputNotMatches",
  "fileExists", "fileAbsent", "fileMatches", "fileNotMatches", "gitBranchExists", "gitCommitCountOn",
  "hookBlocked", "hookNotBlocked", "noRepoChanges",
  "toolOrder", "toolCount", "firstTextMatches", "fileMatchesGlob", "onlyFilesChanged", "gitWorktreeExists", "scriptPasses",
];
/** The `agent` field of a tool spec: count only the calls of the main agent, or only the calls inside a subagent. */
export const AGENT_SCOPES = ["main", "subagent"];
/** The folder in the temp repo where the installer puts the skills. */
const INSTALLED_SKILLS = [".claude", "skills"];
export const DEFAULT_BUDGET_USD = 1;
export const EVAL_SETS = ["regression", "capability"];
export const DEFAULT_SET = "regression";
// `bypassPermissions` is never in this list. An eval can never skip permission checks.
export const PERMISSION_MODES = ["default", "acceptEdits", "dontAsk"];

// Text that must never reach the command line of the agent. Each item turns off hooks or permission checks.
export const FORBIDDEN_TEXT = ["disableAllHooks", "--bare", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "bypassPermissions"];

/** Return the first forbidden text that a string holds, or null. The test is case-insensitive. */
export function forbiddenText(s) {
  const low = String(s).toLowerCase();
  return FORBIDDEN_TEXT.find((f) => low.includes(f.toLowerCase())) ?? null;
}

/** Turn "pat" or "/pat/flags" into a RegExp. Throws on a bad pattern. */
export function toRegExp(s) {
  if (typeof s !== "string" || s === "") throw new Error("a pattern must be a non-empty string");
  const m = /^\/(.+)\/([a-z]*)$/s.exec(s);
  return m ? new RegExp(m[1], m[2]) : new RegExp(s);
}

/** Find the JSON text of the Checks block. Returns null when the file has no `## Checks` heading. */
export function extractChecksBlock(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Checks\s*$/.test(l));
  if (start === -1) return null;
  let end = lines.length;
  let fence = null;
  let body = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (fence === null && /^##\s/.test(l)) {
      end = i;
      break;
    }
    if (fence === null && /^```json\s*$/.test(l)) fence = [];
    else if (fence !== null && /^```\s*$/.test(l)) {
      body = fence.join("\n");
      break;
    } else if (fence !== null) fence.push(l);
  }
  if (body === null) throw new Error(`the "## Checks" heading (line ${start + 1}) has no closed json block before line ${end + 1}`);
  return body;
}

function isStringList(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x !== "");
}

/** Return a list of problems with a checks object. An empty list means valid. */
export function validateChecks(c) {
  const errs = [];
  if (c === null || typeof c !== "object" || Array.isArray(c)) return ["the Checks block must be a JSON object"];
  for (const k of Object.keys(c)) if (!CHECK_KEYS.includes(k)) errs.push(`unknown key "${k}"`);
  if (typeof c.prompt !== "string" || c.prompt.trim() === "") errs.push('"prompt" must be a non-empty string');
  if (!isStringList(c.allowedTools)) errs.push('"allowedTools" must be a non-empty list of strings');
  else if (c.allowedTools.some((t) => t.includes(","))) errs.push('"allowedTools" entries must not contain a comma');
  if (c.budgetUsd !== undefined && !(typeof c.budgetUsd === "number" && c.budgetUsd > 0)) errs.push('"budgetUsd" must be a number above 0');
  errs.push(...validateRunFields(c));
  if (c.setup !== undefined) errs.push(...validateSetup(c.setup));
  const nTurns = Array.isArray(c.turns) ? c.turns.length + 1 : 1;
  if (c.assert === undefined || c.assert === null || typeof c.assert !== "object" || Array.isArray(c.assert)) errs.push('"assert" must be an object');
  else errs.push(...validateAsserts(c.assert, nTurns));
  if (c.setup?.installStack && !c.setup?.gitInit) errs.push('"installStack" needs "gitInit": true');
  return errs;
}

/** Check the optional run fields: tools, disallowedTools, turns, baseline, set, permissionMode. */
function validateRunFields(c) {
  const errs = [];
  for (const k of ["allowedTools", "tools", "disallowedTools"]) {
    if (!Array.isArray(c[k])) continue;
    for (const t of c[k]) {
      const bad = typeof t === "string" ? forbiddenText(t) : null;
      if (bad) errs.push(`"${k}" holds forbidden text "${bad}". Fix: remove it. An eval can never turn off hooks or permission checks.`);
    }
  }
  for (const k of ["tools", "disallowedTools"]) {
    if (c[k] === undefined) continue;
    const okList = Array.isArray(c[k]) && c[k].every((x) => typeof x === "string" && x !== "" && !x.includes(","));
    if (!okList) errs.push(`"${k}" must be a list of strings with no comma. Fix: write one tool name in each entry.`);
    else if (k === "disallowedTools" && c[k].length === 0) errs.push('"disallowedTools" must not be empty. Fix: remove the key or name a tool.');
  }
  if (c.turns !== undefined) {
    if (!Array.isArray(c.turns) || c.turns.length === 0 || c.turns.some((x) => typeof x !== "string" || x.trim() === "")) {
      errs.push('"turns" must be a non-empty list of non-empty prompts. Fix: write one follow-up prompt in each entry.');
    }
  }
  if (c.baseline !== undefined) {
    const b = c.baseline;
    if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some((k) => k !== "skill") || typeof b.skill !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(b.skill)) {
      errs.push('"baseline" must be {"skill": "<name>"}. Fix: give the name of the skill folder.');
    } else if (forbiddenText(b.skill)) errs.push('"baseline.skill" holds forbidden text. Fix: give the name of a skill.');
  }
  if (c.set !== undefined && !EVAL_SETS.includes(c.set)) errs.push(`"set" must be one of ${EVAL_SETS.join(", ")}. Fix: use "regression" or "capability".`);
  if (c.permissionMode !== undefined && !PERMISSION_MODES.includes(c.permissionMode)) {
    errs.push(`"permissionMode" must be one of ${PERMISSION_MODES.join(", ")}. Fix: use one of these values. The runner never allows bypassPermissions.`);
  }
  return errs;
}

function validateSetup(s) {
  const errs = [];
  if (s === null || typeof s !== "object" || Array.isArray(s)) return ['"setup" must be an object'];
  for (const k of Object.keys(s)) if (!SETUP_KEYS.includes(k)) errs.push(`setup: unknown key "${k}"`);
  for (const k of ["gitInit", "installStack", "origin", "githooks", "commit"]) {
    if (s[k] !== undefined && typeof s[k] !== "boolean") errs.push(`setup.${k} must be true or false`);
  }
  if (s.branch !== undefined && !(typeof s.branch === "string" && /^[A-Za-z0-9._\/-]+$/.test(s.branch) && !s.branch.startsWith("-"))) {
    errs.push("setup.branch must be a safe branch name");
  }
  for (const k of ["files", "uncommitted"]) {
    if (s[k] === undefined) continue;
    if (!Array.isArray(s[k])) errs.push(`setup.${k} must be a list`);
    else {
      s[k].forEach((f, i) => {
        if (!f || typeof f.path !== "string" || typeof f.content !== "string") errs.push(`setup.${k}[${i}] needs string "path" and "content"`);
        else if (!isSafeRelPath(f.path)) errs.push(`setup.${k}[${i}].path must be relative and stay inside the repo`);
      });
    }
  }
  if ((s.branch || s.origin || s.githooks || s.commit || s.uncommitted) && !s.gitInit) errs.push('setup: "branch", "origin", "githooks", "commit" and "uncommitted" need "gitInit": true');
  if (s.uncommitted && s.commit === false) errs.push('setup: "uncommitted" needs the setup commit. Fix: remove "commit": false, or put the files in "files".');
  return errs;
}

export function isSafeRelPath(p) {
  if (typeof p !== "string" || p === "" || isAbsolute(p) || p.includes("\0")) return false;
  return !p.split(/[\\/]/).includes("..");
}

function validateAsserts(a, nTurns = 1) {
  const errs = [];
  for (const k of Object.keys(a)) if (!ASSERT_KEYS.includes(k)) errs.push(`assert: unknown key "${k}"`);
  if (Object.keys(a).length === 0) errs.push('"assert" has no checks');
  for (const k of ["fileExists", "fileAbsent", "gitBranchExists"]) {
    if (a[k] !== undefined && !isStringList(a[k])) errs.push(`assert.${k} must be a non-empty list of strings`);
  }
  for (const k of ["skillLoaded", "skillNotLoaded"]) {
    if (a[k] === undefined) continue;
    if (!Array.isArray(a[k]) || a[k].length === 0) errs.push(`assert.${k} must be a non-empty list of strings`);
    else {
      for (const e of a[k]) {
        if (typeof e === "string" && e !== "") continue;
        if (e && typeof e === "object" && typeof e.name === "string" && e.name !== "" && validTurn(e.turn, nTurns)) continue;
        errs.push(`assert.${k} entries must be a skill name or {name, turn}${turnHint(nTurns)}`);
      }
    }
  }
  for (const k of ["outputMatches", "outputNotMatches", "firstTextMatches"]) {
    if (a[k] === undefined) continue;
    if (!Array.isArray(a[k]) || a[k].length === 0) errs.push(`assert.${k} must be a non-empty list of patterns`);
    else {
      for (const e of a[k]) {
        if (typeof e === "string" && e !== "") tryRegExp(e, `assert.${k}`, errs);
        else if (e && typeof e === "object" && typeof e.pattern === "string" && e.pattern !== "" && validTurn(e.turn, nTurns)) tryRegExp(e.pattern, `assert.${k}`, errs);
        else errs.push(`assert.${k} entries must be a pattern or {pattern, turn}${turnHint(nTurns)}`);
      }
    }
  }
  for (const k of ["toolCalled", "toolNotCalled"]) {
    if (a[k] === undefined) continue;
    if (!Array.isArray(a[k]) || a[k].length === 0) errs.push(`assert.${k} must be a non-empty list`);
    else for (const t of a[k]) if (!validToolSpec(t, k, errs, nTurns, true)) errs.push(`assert.${k} entries must be a tool name or {name, inputMatches, turn}${turnHint(nTurns)}`);
  }
  if (a.toolOrder !== undefined) {
    if (!Array.isArray(a.toolOrder) || a.toolOrder.length === 0) errs.push("assert.toolOrder must be a non-empty list");
    else {
      for (const e of a.toolOrder) {
        const ok = e && typeof e === "object" && !Array.isArray(e) && Object.keys(e).every((k) => ["before", "after", "turn"].includes(k)) &&
          validToolSpec(e.before, "toolOrder", errs, nTurns, false) && validToolSpec(e.after, "toolOrder", errs, nTurns, false) && validTurn(e.turn, nTurns);
        if (!ok) errs.push(`assert.toolOrder entries must be {before, after, turn} where before and after are a tool name or {name, inputMatches, agent}${turnHint(nTurns)}`);
      }
    }
  }
  if (a.toolCount !== undefined) {
    if (!Array.isArray(a.toolCount) || a.toolCount.length === 0) errs.push("assert.toolCount must be a non-empty list");
    else {
      const okNum = (n) => n === undefined || (Number.isInteger(n) && n >= 0);
      for (const e of a.toolCount) {
        const ok = e && typeof e === "object" && !Array.isArray(e) && validToolSpec(e, "toolCount", errs, nTurns, true) &&
          (e.min !== undefined || e.max !== undefined) && okNum(e.min) && okNum(e.max) && (e.min === undefined || e.max === undefined || e.min <= e.max);
        if (!ok) errs.push(`assert.toolCount entries must be {name, inputMatches, agent, turn, min, max}. Fix: give "min", "max" or both as whole numbers, with min not above max${turnHint(nTurns)}`);
      }
    }
  }
  for (const k of ["fileMatchesGlob", "onlyFilesChanged"]) {
    if (a[k] === undefined) continue;
    if (!isStringList(a[k])) errs.push(`assert.${k} must be a non-empty list of globs`);
    else if (a[k].some((g) => !isSafeGlob(g))) errs.push(`assert.${k} globs must be relative and stay inside the repo`);
  }
  if (a.gitWorktreeExists !== undefined && a.gitWorktreeExists !== true && !isStringList(a.gitWorktreeExists)) {
    errs.push("assert.gitWorktreeExists must be true or a non-empty list of branch names");
  }
  if (a.scriptPasses !== undefined) {
    if (!Array.isArray(a.scriptPasses) || a.scriptPasses.length === 0) errs.push("assert.scriptPasses must be a non-empty list");
    else {
      for (const e of a.scriptPasses) {
        const ok = e && typeof e === "object" && !Array.isArray(e) && Object.keys(e).every((k) => ["skill", "script", "file", "args"].includes(k)) &&
          (e.skill === undefined || (typeof e.skill === "string" && SCRIPT_NAME.test(e.skill))) &&
          typeof e.script === "string" && SCRIPT_NAME.test(e.script) && e.script !== "eval-run" &&
          (e.file === undefined || (typeof e.file === "string" && isSafeAssertPath(e.file))) &&
          (e.args === undefined || (Array.isArray(e.args) && e.args.every((x) => typeof x === "string" && !forbiddenText(x))));
        if (!ok) errs.push('assert.scriptPasses entries must be {skill, script, file, args}. Fix: "script" is a name in scripts/ (not eval-run), or in skills/<skill>/scripts/ when "skill" is set. "skill" is a skill folder name. "file" is a relative path, "args" is a list of strings.');
      }
    }
  }
  for (const k of ["fileExists", "fileAbsent"]) {
    if (isStringList(a[k]) && a[k].some((p) => !isSafeAssertPath(p))) errs.push(`assert.${k} paths must be relative or start with $TMPDIR/`);
  }
  for (const k of ["fileMatches", "fileNotMatches"]) {
    if (a[k] === undefined) continue;
    if (!Array.isArray(a[k]) || a[k].length === 0) errs.push(`assert.${k} must be a non-empty list`);
    else {
      for (const f of a[k]) {
        if (!f || typeof f.path !== "string" || typeof f.pattern !== "string") errs.push(`assert.${k} entries need string path and pattern`);
        else {
          if (!isSafeAssertPath(f.path)) errs.push(`assert.${k} paths must be relative or start with $TMPDIR/`);
          tryRegExp(f.pattern, `assert.${k}`, errs);
        }
      }
    }
  }
  if (a.gitCommitCountOn !== undefined) {
    const g = a.gitCommitCountOn;
    if (!g || typeof g !== "object" || Array.isArray(g) || Object.keys(g).length === 0) errs.push("assert.gitCommitCountOn must map a branch to a count");
    else {
      for (const [b, v] of Object.entries(g)) {
        const okNum = (n) => Number.isInteger(n) && n >= 0;
        const ok = okNum(v) || (v && typeof v === "object" && (v.min !== undefined || v.max !== undefined) && [v.min, v.max].every((n) => n === undefined || okNum(n)));
        if (!ok) errs.push(`assert.gitCommitCountOn.${b} must be a whole number or {min, max}`);
      }
    }
  }
  if (a.hookBlocked !== undefined && a.hookBlocked !== true && typeof a.hookBlocked !== "string") errs.push("assert.hookBlocked must be true or a pattern");
  else if (typeof a.hookBlocked === "string") tryRegExp(a.hookBlocked, "assert.hookBlocked", errs);
  for (const k of ["hookNotBlocked", "noRepoChanges"]) {
    if (a[k] !== undefined && a[k] !== true) errs.push(`assert.${k} must be true`);
  }
  return errs;
}

const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]*$/;

function validTurn(turn, nTurns) {
  return turn === undefined || (Number.isInteger(turn) && turn >= 1 && turn <= nTurns);
}

function turnHint(nTurns) {
  return nTurns > 1 ? `. "turn" is a whole number from 1 to ${nTurns}` : '. "turn" must be 1 because the eval has no "turns"';
}

function validToolSpec(t, k, errs, nTurns, allowTurn) {
  if (typeof t === "string") return t !== "";
  if (!t || typeof t !== "object" || Array.isArray(t) || typeof t.name !== "string" || t.name === "") return false;
  if (t.inputMatches !== undefined && typeof t.inputMatches !== "string") return false;
  if (t.agent !== undefined && !AGENT_SCOPES.includes(t.agent)) return false;
  if (!allowTurn && t.turn !== undefined) return false;
  if (!validTurn(t.turn, nTurns)) return false;
  if (t.inputMatches !== undefined) tryRegExp(t.inputMatches, `assert.${k}`, errs);
  return true;
}

/** A glob is relative, has no `..` part and holds only normal path characters. */
export function isSafeGlob(g) {
  return typeof g === "string" && g !== "" && isSafeRelPath(g.replace(/[*?{},]/g, "x")) && !g.includes("\\");
}

/** True when a path of an assert holds a glob character. Such a path matches every file and folder that fits the glob. */
export function hasGlob(p) {
  return /[*?{]/.test(p);
}

function isSafeAssertPath(p) {
  const rel = p.startsWith("$TMPDIR/") ? p.slice(8) : p;
  return hasGlob(rel) ? isSafeGlob(rel) : isSafeRelPath(rel);
}

function tryRegExp(p, where, errs) {
  try {
    toRegExp(p);
  } catch (e) {
    errs.push(`${where}: bad pattern ${JSON.stringify(p)} (${e.message})`);
  }
}

/**
 * Parse one eval file.
 * Returns { title, manual: true } when there is no Checks block.
 * Returns { title, manual: false, checks } when the block is valid.
 * Throws an Error with a list of problems when the block is bad.
 */
export function parseEvalFile(text) {
  const title = (/^#\s+(.+)$/m.exec(text) || [])[1] ?? "";
  const raw = extractChecksBlock(text);
  if (raw === null) return { title, manual: true, checks: null };
  let checks;
  try {
    checks = JSON.parse(raw);
  } catch (e) {
    throw new Error(`the Checks block is not valid JSON: ${e.message}`);
  }
  const errs = validateChecks(checks);
  if (errs.length) throw new Error(`the Checks block is not valid:\n  - ${errs.join("\n  - ")}`);
  return { title, manual: false, checks };
}

// ---------------------------------------------------------------------------
// 2. Find evals
// ---------------------------------------------------------------------------

/** List eval files as { skill, file, rel, path }. An eval file is NN-name.md in evals/<skill>/. */
export function discoverEvals(evalsDir, { skill, evalFile } = {}) {
  const out = [];
  for (const d of readdirSync(evalsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory()) continue;
    if (skill && d.name !== skill) continue;
    for (const f of readdirSync(join(evalsDir, d.name)).sort()) {
      if (!/^\d\d-.+\.md$/.test(f)) continue;
      const rel = `${d.name}/${f}`;
      if (evalFile && !(rel === evalFile || f === evalFile || rel.endsWith(`/${evalFile}`) || resolve(evalFile) === join(evalsDir, rel))) continue;
      out.push({ skill: d.name, file: f, rel, path: join(evalsDir, rel) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Network guard
// ---------------------------------------------------------------------------

const NETWORK_BASH = /\b(gh|curl|wget|ssh|scp|rsync|nc|ncat|telnet|ftp|sftp)\b|git\s+(push|remote)|npm\s+publish|\bpip\s+install\b/;

/** Return the tools in the list that can write to the network. */
export function networkWritingTools(allowedTools) {
  return allowedTools.filter((t) => {
    if (t === "Bash") return true; // unrestricted shell
    if (t === "WebFetch" || t === "WebSearch" || t.startsWith("WebFetch(") || t.startsWith("WebSearch(")) return true;
    if (t.startsWith("mcp__")) return true;
    if (t.startsWith("Bash(")) return NETWORK_BASH.test(t);
    return false;
  });
}

// ---------------------------------------------------------------------------
// 4. Build the command line
// ---------------------------------------------------------------------------

/**
 * Flags that this script must never pass. A test checks the command against this list.
 * Each name is a real flag of `claude --help`. `--settings` and `--permission-mode` are not here,
 * because the script passes them in one fixed form (see `assertSafeArgs`).
 * Hooks have no off flag. The route to turn them off is the settings value `disableAllHooks`,
 * and `--bare` and `--safe-mode` also skip them. `FORBIDDEN_TEXT` covers these.
 */
export const FORBIDDEN_FLAGS = [
  "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--bare", "--safe-mode",
  "--setting-sources=user", "--add-dir",
];

/**
 * Refuse a command line that could turn off hooks or permission checks.
 * It checks every argument except the prompt (the value after `-p`).
 * Throws a UsageError of the form "<what failed>. Fix: <what to do>."
 */
export function assertSafeArgs(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-p") {
      i++; // the prompt is free text
      continue;
    }
    const a = String(args[i]);
    const flag = a.split("=")[0];
    if (FORBIDDEN_FLAGS.includes(a) || FORBIDDEN_FLAGS.includes(flag)) {
      throw new UsageError(`The command has the flag ${flag}, which the runner never passes. Fix: remove it.`);
    }
    const bad = forbiddenText(a);
    if (bad) throw new UsageError(`An argument holds "${bad}", which turns off hooks or permission checks. Fix: remove it from the eval or from the extra arguments.`);
    if (args[i - 1] === "--setting-sources" && a !== "project") throw new UsageError(`--setting-sources must be "project", not "${a}". Fix: use project settings only.`);
    if (args[i - 1] === "--permission-mode" && !PERMISSION_MODES.includes(a)) throw new UsageError(`--permission-mode "${a}" is not allowed. Fix: use one of ${PERMISSION_MODES.join(", ")}.`);
  }
}

/** The `--settings` value that turns one skill off for a baseline run. */
export function baselineSettings(skill) {
  return JSON.stringify({ skillOverrides: { [skill]: "off" } });
}

export function buildCommand({
  claudePath, prompt, model, allowedTools, budgetUsd, allowNetwork = false,
  tools, disallowedTools, permissionMode, resumeId, persistSession = false, baselineSkill, extraArgs = [],
}) {
  const args = [
    "-p", prompt,
    "--setting-sources", "project",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--output-format", "stream-json", "--verbose", "--include-hook-events",
  ];
  if (!persistSession) args.push("--no-session-persistence");
  if (resumeId) args.push("--resume", resumeId);
  args.push("--max-budget-usd", String(budgetUsd));
  if (model) args.push("--model", model);
  args.push("--allowedTools", allowedTools.join(","));
  if (tools !== undefined) args.push("--tools", tools.join(","));
  const deny = [...(allowNetwork ? [] : ["Bash(gh:*)", "Bash(curl:*)", "Bash(wget:*)", "Bash(ssh:*)"]), ...(disallowedTools ?? [])];
  if (deny.length) args.push("--disallowedTools", deny.join(","));
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (baselineSkill) args.push("--settings", baselineSettings(baselineSkill));
  args.push(...extraArgs);
  assertSafeArgs(args);
  return { cmd: claudePath, args };
}

/**
 * True when a file is a wrapper and not the real binary.
 * A wrapper starts with a `#!` line, or its real path sits under a `cmux-cli-shims` folder.
 * The terminal app of the owner puts such a wrapper on PATH. It adds the settings of the owner to the run.
 */
export function isWrapper(p) {
  let real = p;
  try {
    real = realpathSync(p);
  } catch {
    /* use the path as it is */
  }
  if (real.split(sep).includes("cmux-cli-shims")) return true;
  let fd;
  try {
    fd = openSync(real, "r");
    const buf = Buffer.alloc(2);
    const n = readSync(fd, buf, 0, 2, 0);
    return n === 2 && buf.toString("latin1") === "#!";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Find a real claude binary on PATH (a shell function does not count).
 * A wrapper is skipped. Each skipped wrapper goes into `skipped` when the caller passes an array.
 */
export function findClaude({ pathEnv = process.env.PATH ?? "", home = homedir(), skipped = [] } = {}) {
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  dirs.push(join(home, ".local", "bin"));
  for (const d of dirs) {
    const p = join(d, "claude");
    try {
      if (statSync(p).isFile()) {
        accessSync(p, constants.X_OK);
        if (isWrapper(p)) {
          skipped.push(p);
          continue;
        }
        return p;
      }
    } catch {
      /* try the next folder */
    }
  }
  return null;
}

/**
 * Pick the claude binary. Order: `--claude`, then `CLAUDE_BIN`, then PATH.
 * Returns { path, source } or { error }. An error text has the form "<what failed>. Fix: <what to do>."
 */
export function resolveClaude({ flag, env = process.env, pathEnv = env.PATH ?? "", home = homedir() } = {}) {
  const explicit = (value, source) => {
    if (existsSync(value) && statSync(value).isFile()) return { path: value, source };
    return { error: `The path from ${source} is not a file: ${value}. Fix: give the path of the real claude binary.` };
  };
  if (flag) return explicit(flag, "--claude");
  if (env.CLAUDE_BIN) return explicit(env.CLAUDE_BIN, "CLAUDE_BIN");
  const skipped = [];
  const path = findClaude({ pathEnv, home, skipped });
  if (path) return { path, source: "PATH" };
  if (skipped.length) {
    return { error: `Every claude on PATH is a wrapper script (${skipped.join(", ")}). A wrapper adds the settings of the owner, so the run is not isolated. Fix: pass --claude <path> or set CLAUDE_BIN to the real binary.` };
  }
  return { error: "No claude binary is on PATH. A shell function does not count. Fix: pass --claude <path> or set CLAUDE_BIN to the real binary." };
}

/**
 * The environment for the agent. It removes the variables of the terminal app of the owner (`CMUX_*`).
 * It also removes the folders of the `cmux-cli-shims` wrappers from PATH, so a `claude` call inside the run reaches the real binary.
 */
export function childEnv(base) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!k.startsWith("CMUX_")) env[k] = v;
  if (env.PATH) env.PATH = env.PATH.split(delimiter).filter((d) => !d.split(sep).includes("cmux-cli-shims")).join(delimiter);
  return env;
}

/**
 * Variables that the runner sets for every agent run. They win over the same names in the environment of the owner.
 * Auto memory writes notes to `<config dir>/projects/<repo>/memory/`, and the config dir is under the real home folder.
 * Docs (code.claude.com/docs/en/env-vars): "Set to `1` to disable auto memory. ... When disabled, Claude does not
 * create or load auto memory files." The value `0` forces auto memory on, so the runner always writes `1`.
 * The runner does not move `CLAUDE_CONFIG_DIR`: a fresh config folder has no login, and the run fails with an API error.
 */
export const AGENT_ENV = Object.freeze({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });

/** The full environment of one agent run: `childEnv`, the fixed git identity, `TMPDIR` of the run and `AGENT_ENV`. */
export function agentEnv(base, layout) {
  const env = { ...childEnv(base), ...GIT_ENV, TMPDIR: layout.tmp, ...AGENT_ENV };
  delete env.GIT_CONFIG_GLOBAL; // the agent keeps the user git config; only the identity is fixed
  delete env.GIT_CONFIG_NOSYSTEM;
  return env;
}

// ---------------------------------------------------------------------------
// 5. Parse a stream-json transcript
// ---------------------------------------------------------------------------

/**
 * Read stream-json text. Returns:
 *  init            the system init event or null
 *  sessionId       the session id from the init or result event, or null
 *  toolCalls       [{ id, name, input, parentId }] parentId is null for the main agent and the Agent call id in a subagent
 *  hooks           [{ event, name, exitCode, outcome, output }] from hook_response events
 *  hookFailBlocks  [{ event, name, reason, output }] a hook with "onFailure": "block" that failed or timed out.
 *                  The tool result says so: `<event>:<tool> hook error: [cmd]: failed; blocking because onFailure is "block"`.
 *                  The hook_response event of such a hook can show exit code 1 (a failure) or 1 with outcome
 *                  "cancelled" (a timeout), so the exit code alone does not show the block.
 *  text            all assistant text, joined with a blank line
 *  firstText       the first assistant text block, or ""
 *  result          { subtype, isError, costUsd, turns, text } or null
 *  denials         permission denials from the result event
 *  badLines        count of lines that are not JSON
 */
export function parseTranscript(text) {
  const t = { init: null, sessionId: null, toolCalls: [], hooks: [], hookFailBlocks: [], text: "", firstText: "", result: null, denials: [], badLines: 0 };
  const texts = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      t.badLines++;
      continue;
    }
    if (!ev || typeof ev !== "object") continue;
    if (ev.type === "system" && ev.subtype === "init") {
      t.init = ev;
      if (typeof ev.session_id === "string") t.sessionId = ev.session_id;
    } else if (ev.type === "system" && ev.subtype === "hook_response") {
      t.hooks.push({ event: ev.hook_event ?? "", name: ev.hook_name ?? "", exitCode: ev.exit_code ?? null, outcome: ev.outcome ?? "", output: String(ev.output ?? ev.stderr ?? "") });
    } else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        // `parent_tool_use_id` is null for the main agent. Inside a subagent it is the id of the Agent tool call.
        if (b.type === "tool_use") t.toolCalls.push({ id: b.id, name: b.name, input: b.input ?? {}, parentId: typeof ev.parent_tool_use_id === "string" ? ev.parent_tool_use_id : null });
        else if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
      }
    } else if (ev.type === "user" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b?.type !== "tool_result") continue;
        const body = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x) => x?.text ?? "").join("\n") : "";
        const m = /^(\w+):(\S+) hook error: \[[\s\S]*?\]: ([^\n;]*); blocking because onFailure is "block"/.exec(body);
        if (m) t.hookFailBlocks.push({ event: m[1], name: `${m[1]}:${m[2]}`, reason: m[3].trim(), output: body });
      }
    } else if (ev.type === "result") {
      t.result = { subtype: ev.subtype ?? "", isError: Boolean(ev.is_error), costUsd: Number(ev.total_cost_usd ?? 0), turns: Number(ev.num_turns ?? 0), text: String(ev.result ?? "") };
      t.denials = Array.isArray(ev.permission_denials) ? ev.permission_denials : [];
      if (typeof ev.session_id === "string" && !t.sessionId) t.sessionId = ev.session_id;
    }
  }
  t.text = texts.join("\n\n");
  t.firstText = texts[0] ?? "";
  return t;
}

/**
 * Join the transcripts of the turns of one run. The result has the same shape as one transcript:
 * tool calls, hooks and text are joined, and the cost and the turn count are added.
 * `turnList` keeps the single transcripts for the asserts that name a turn.
 * One transcript gives the same object back, with a `turnList` of one.
 */
export function mergeTranscripts(list) {
  if (list.length === 1) return Object.assign(list[0], { turnList: list });
  const m = {
    init: list[0]?.init ?? null,
    sessionId: list.find((x) => x.sessionId)?.sessionId ?? null,
    toolCalls: list.flatMap((x) => x.toolCalls),
    hooks: list.flatMap((x) => x.hooks),
    hookFailBlocks: list.flatMap((x) => x.hookFailBlocks),
    text: list.map((x) => x.text).filter(Boolean).join("\n\n"),
    firstText: list[0]?.firstText ?? "",
    denials: list.flatMap((x) => x.denials),
    badLines: list.reduce((a, x) => a + x.badLines, 0),
    turnList: list,
    result: null,
  };
  const results = list.map((x) => x.result);
  if (results.every(Boolean)) {
    const bad = results.find((r) => r.subtype !== "success" || r.isError);
    m.result = {
      subtype: bad ? bad.subtype : "success", isError: results.some((r) => r.isError),
      costUsd: results.reduce((a, r) => a + r.costUsd, 0), turns: results.reduce((a, r) => a + r.turns, 0), text: results[results.length - 1].text,
    };
  }
  return m;
}

/** The hooks that blocked a tool: a PreToolUse hook with exit code 2, or a failed hook with "onFailure": "block". */
export function hookBlocks(t) {
  const exit2 = t.hooks.filter((h) => h.event === "PreToolUse" && h.exitCode === 2).map((h) => ({ name: h.name, output: h.output, kind: "exit2" }));
  const failed = (t.hookFailBlocks ?? []).filter((h) => h.event === "PreToolUse").map((h) => ({ name: h.name, output: h.output, kind: `onFailure (${h.reason})` }));
  return [...exit2, ...failed];
}

/**
 * Skills that loaded. The Skill tool call is one proof. A typed `/name` at the start of the prompt
 * is the other: the stream shows no tool call for it, so the name counts when the init event lists it.
 */
export function loadedSkills(transcript, prompt) {
  const set = new Set();
  for (const c of transcript.toolCalls) {
    if (c.name === "Skill" && typeof c.input?.skill === "string") set.add(normalizeSkill(c.input.skill));
  }
  const m = /^\s*\/([A-Za-z0-9:_-]+)/.exec(prompt ?? "");
  if (m) {
    const name = normalizeSkill(m[1]);
    const known = transcript.init?.skills;
    if (Array.isArray(known) && known.includes(name)) set.add(name);
  }
  return set;
}

function normalizeSkill(s) {
  return s.replace(/^\//, "").split(":").pop();
}

// ---------------------------------------------------------------------------
// 6. Git helpers and asserts
// ---------------------------------------------------------------------------

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "eval-run", GIT_AUTHOR_EMAIL: "eval-run@example.invalid",
  GIT_COMMITTER_NAME: "eval-run", GIT_COMMITTER_EMAIL: "eval-run@example.invalid",
  GIT_TERMINAL_PROMPT: "0",
};

export function git(cwd, args) {
  const r = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env: { ...process.env, ...GIT_ENV }, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function resolveAssertPath(layout, p) {
  const base = p.startsWith("$TMPDIR/") ? layout.tmp : layout.repo;
  const rel = p.startsWith("$TMPDIR/") ? p.slice(8) : p;
  const full = resolve(base, rel);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

function toolText(input) {
  return typeof input?.command === "string" ? input.command : JSON.stringify(input ?? {});
}

function toolMatches(call, spec) {
  const name = typeof spec === "string" ? spec : spec.name;
  if (call.name !== name) return false;
  if (typeof spec === "string") return true;
  const sub = call.parentId !== null && call.parentId !== undefined;
  if (spec.agent === "main" && sub) return false;
  if (spec.agent === "subagent" && !sub) return false;
  if (spec.inputMatches === undefined) return true;
  return toRegExp(spec.inputMatches).test(toolText(call.input));
}

function specLabel(spec) {
  return typeof spec === "string" ? spec : `${spec.name}~${spec.inputMatches ?? ""}${spec.agent ? `[${spec.agent}]` : ""}`;
}

/** Files and folders under `base` as relative paths with `/`. `.git` and `node_modules` are not searched. Symlinks are not followed. */
function listEntries(base, { dirs = false } = {}) {
  const out = [];
  const walk = (dir, prefix) => {
    let list;
    try {
      list = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of list) {
      if (d.name === ".git" || d.name === "node_modules") continue;
      if (d.isDirectory()) {
        if (dirs) out.push(`${prefix}${d.name}`);
        walk(join(dir, d.name), `${prefix}${d.name}/`);
      } else out.push(`${prefix}${d.name}`);
    }
  };
  walk(base, "");
  return out.sort();
}

/**
 * The paths that an assert path names. A plain path gives itself when it exists. A glob gives every file and folder
 * that it matches, under the repo or under `$TMPDIR`. Each item is { rel, full, isFile }.
 */
function assertTargets(layout, p) {
  if (!hasGlob(p)) {
    const full = resolveAssertPath(layout, p);
    if (full === null || !existsSync(full)) return [];
    return [{ rel: p, full, isFile: statSync(full).isFile() }];
  }
  const inTmp = p.startsWith("$TMPDIR/");
  const base = inTmp ? layout.tmp : layout.repo;
  const re = globToRegExp(inTmp ? p.slice(8) : p);
  return listEntries(base, { dirs: true }).filter((r) => re.test(r)).map((r) => {
    const full = join(base, ...r.split("/"));
    return { rel: r, full, isFile: statSync(full).isFile() };
  });
}

/** Read a file for a content assert. Returns { text } or { error }. */
function readTarget(t) {
  try {
    return { text: readFileSync(t.full, "utf8") };
  } catch (e) {
    return { error: e.message };
  }
}

/** Turn a glob into a RegExp. `**` matches any folders, `*` and `?` stay inside one path part, `{a,b}` is a choice. */
export function globToRegExp(glob) {
  let re = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      depth++;
      re += "(?:";
    } else if (c === "}" && depth > 0) {
      depth--;
      re += ")";
    } else if (c === "," && depth > 0) re += "|";
    else re += c.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
  }
  if (depth > 0) re += ")".repeat(depth);
  return new RegExp(`^${re}$`);
}

const matchesAnyGlob = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

/** Every file of the repo as a relative path with `/`, without `.git` and `node_modules`. */
function listRepoFiles(repo) {
  return listEntries(repo);
}

/** A short hash of a file in the repo, or "missing". */
function fileHash(repo, rel) {
  try {
    return createHash("sha256").update(readFileSync(join(repo, ...rel.split("/")))).digest("hex").slice(0, 16);
  } catch {
    return "missing";
  }
}

/**
 * The state of the work tree that `git status` cannot show in full: the status lines, and a hash of each file that
 * has a change against HEAD. Two equal states mean that no uncommitted file changed. Returns { ok, status, hashes }.
 */
export function workTreeState(repo) {
  // `-z` keeps the leading space of the status code and gives paths without quotes.
  const r = spawnSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd: repo, env: { ...process.env, ...GIT_ENV }, encoding: "utf8" });
  if (r.status !== 0) return { ok: false, status: "", hashes: {} };
  const tokens = (r.stdout ?? "").split("\0").filter(Boolean);
  const lines = [];
  const hashes = {};
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i].slice(0, 2);
    const rel = tokens[i].slice(3);
    if (code[0] === "R" || code[0] === "C") i++; // the next token is the old path
    lines.push(`${code} ${rel}`);
    hashes[rel] = fileHash(repo, rel);
  }
  return { ok: true, status: lines.join("\n"), hashes };
}

/**
 * Files changed since the setup commit: tracked changes (also committed ones) and new files that git does not ignore.
 * A file from `setup.uncommitted` that still has its setup content does not count as a change.
 */
function changedFiles(repo, baseline) {
  const tracked = git(repo, ["diff", "--name-only", "--no-renames", baseline.head]);
  const fresh = git(repo, ["ls-files", "--others", "--exclude-standard"]);
  if (!tracked.ok) return { ok: false, err: tracked.err, files: [] };
  const lines = (x) => x.split("\n").filter(Boolean);
  const setupDirty = baseline.state?.hashes ?? {};
  const files = [...new Set([...lines(tracked.out), ...lines(fresh.out)])].filter((f) => !(f in setupDirty && setupDirty[f] === fileHash(repo, f)));
  return { ok: true, err: "", files: files.sort() };
}

function worktreeBranches(repo) {
  const r = git(repo, ["worktree", "list", "--porcelain"]);
  if (!r.ok) return { ok: false, count: 0, branches: [] };
  const blocks = r.out.split(/\n\s*\n/).filter(Boolean);
  const branches = blocks.map((b) => (/^branch refs\/heads\/(.+)$/m.exec(b) || [])[1]).filter(Boolean);
  return { ok: true, count: blocks.length, branches };
}

/**
 * Find the script of a `scriptPasses` entry. Returns { path } or { error }.
 * Without `skill`: `scripts/<script>.mjs` of the stack.
 * With `skill`: `.claude/skills/<skill>/scripts/<script>.mjs`, the copy that the installer put in the temp repo of the run.
 * The installed copy must stay inside its skill folder (no `..`, no absolute path, no symlink out)
 * and must be equal to `skills/<skill>/scripts/<script>.mjs` of the stack, so an agent cannot edit the check.
 */
export function scriptPath(e, layout, stackRoot = STACK_ROOT) {
  if (typeof e.script !== "string" || !SCRIPT_NAME.test(e.script) || e.script === "eval-run") return { error: `unsafe script name ${JSON.stringify(e.script)}` };
  if (e.skill === undefined) {
    const p = join(stackRoot, "scripts", `${e.script}.mjs`);
    return existsSync(p) ? { path: p } : { error: `the stack has no scripts/${e.script}.mjs` };
  }
  if (typeof e.skill !== "string" || !SCRIPT_NAME.test(e.skill)) return { error: `unsafe skill name ${JSON.stringify(e.skill)}` };
  const rel = [...INSTALLED_SKILLS, e.skill, "scripts", `${e.script}.mjs`].join("/");
  const skillDir = join(layout.repo, ...INSTALLED_SKILLS, e.skill);
  const installed = join(skillDir, "scripts", `${e.script}.mjs`);
  const source = join(stackRoot, "skills", e.skill, "scripts", `${e.script}.mjs`);
  if (!existsSync(installed)) return { error: `the run has no ${rel}. Fix: set "setup.installStack": true, and check that the stack has skills/${e.skill}/scripts/${e.script}.mjs` };
  let real;
  try {
    real = realpathSync(installed);
    if (!isInside(real, realpathSync(skillDir)) || !statSync(real).isFile()) return { error: `${rel} leaves the skill folder` };
  } catch (err) {
    return { error: `cannot read ${rel}: ${err.message}` };
  }
  if (!existsSync(source)) return { error: `the stack has no skills/${e.skill}/scripts/${e.script}.mjs` };
  if (!readFileSync(real).equals(readFileSync(source))) return { error: `${rel} differs from the copy in the stack. The run changed the check` };
  return { path: real };
}

/** The view of a transcript for one turn. No turn gives the joined transcript. A turn that did not run gives null. */
function turnView(t, turn) {
  if (turn === undefined) return t;
  if (t.turnList) return t.turnList[turn - 1] ?? null;
  return turn === 1 ? t : null;
}

const at = (turn) => (turn === undefined ? "" : `@turn${turn}`);
const asObj = (e, key) => (typeof e === "string" ? { [key]: e } : e);

/**
 * Run every assert. `ctx` = { transcript, prompt, prompts, layout: { repo, tmp }, baseline: { head, branches } | null, stackRoot }.
 * `prompts` lists the prompt of each turn. It defaults to [prompt].
 * Returns [{ name, pass, detail }]. The first item is the built-in check that the run finished.
 */
export function evaluateAsserts(assertSpec, ctx) {
  const { transcript: t, layout } = ctx;
  const prompts = ctx.prompts ?? [ctx.prompt];
  const out = [];
  const add = (name, pass, detail = "") => out.push({ name, pass: Boolean(pass), detail });
  const noTurn = (name, turn) => add(name, false, `turn ${turn} did not run`);

  const turnList = t.turnList ?? [t];
  const bad = [];
  turnList.forEach((x, i) => {
    const r = x.result;
    const ok = r && r.subtype === "success" && !r.isError;
    if (!ok) bad.push(`${turnList.length > 1 ? `turn ${i + 1}: ` : ""}${r ? `result subtype "${r.subtype}"` : "no result event in the stream"}`);
  });
  if (turnList.length < (ctx.turnCount ?? 1)) bad.push(`turn ${turnList.length + 1} did not run`);
  add("runCompleted", bad.length === 0, bad.join("; "));

  const loadedOf = (turn) => {
    const v = turnView(t, turn);
    if (!v) return null;
    if (turn !== undefined) return loadedSkills(v, prompts[turn - 1]);
    const all = new Set();
    turnList.forEach((x, i) => loadedSkills(x, prompts[i]).forEach((s) => all.add(s)));
    return all;
  };
  for (const [key, want] of [["skillLoaded", true], ["skillNotLoaded", false]]) {
    for (const e of assertSpec[key] ?? []) {
      const { name, turn } = asObj(e, "name");
      const loaded = loadedOf(turn);
      if (!loaded) noTurn(`${key}:${name}${at(turn)}`, turn);
      else add(`${key}:${name}${at(turn)}`, loaded.has(name) === want, `loaded: ${[...loaded].join(", ") || "none"}`);
    }
  }

  const callsOf = (turn) => turnView(t, turn)?.toolCalls;
  const callList = (calls) => `calls: ${calls.map((c) => c.name).join(", ") || "none"}`;
  for (const [key, want] of [["toolCalled", true], ["toolNotCalled", false]]) {
    for (const spec of assertSpec[key] ?? []) {
      const turn = typeof spec === "string" ? undefined : spec.turn;
      const calls = callsOf(turn);
      if (!calls) noTurn(`${key}:${specLabel(spec)}${at(turn)}`, turn);
      else add(`${key}:${specLabel(spec)}${at(turn)}`, calls.some((c) => toolMatches(c, spec)) === want, callList(calls));
    }
  }
  for (const e of assertSpec.toolOrder ?? []) {
    const name = `toolOrder:${specLabel(e.before)}>${specLabel(e.after)}${at(e.turn)}`;
    const calls = callsOf(e.turn);
    if (!calls) {
      noTurn(name, e.turn);
      continue;
    }
    const first = (spec) => calls.findIndex((c) => toolMatches(c, spec));
    const i = first(e.before);
    const j = first(e.after);
    const why = i === -1 ? "the first tool call never happened" : j === -1 ? "the second tool call never happened" : "";
    add(name, i !== -1 && j !== -1 && i < j, why || `first at call ${i + 1}, second at call ${j + 1}`);
  }
  for (const e of assertSpec.toolCount ?? []) {
    const name = `toolCount:${specLabel(e)}${at(e.turn)}=${e.min ?? 0}..${e.max ?? "any"}`;
    const calls = callsOf(e.turn);
    if (!calls) {
      noTurn(name, e.turn);
      continue;
    }
    const n = calls.filter((c) => toolMatches(c, e)).length;
    add(name, (e.min === undefined || n >= e.min) && (e.max === undefined || n <= e.max), `count: ${n}`);
  }

  const textOf = (turn) => turnView(t, turn)?.text;
  for (const [key, want] of [["outputMatches", true], ["outputNotMatches", false]]) {
    for (const e of assertSpec[key] ?? []) {
      const { pattern, turn } = asObj(e, "pattern");
      const txt = textOf(turn);
      if (txt === undefined) noTurn(`${key}:${pattern}${at(turn)}`, turn);
      else add(`${key}:${pattern}${at(turn)}`, toRegExp(pattern).test(txt) === want);
    }
  }
  for (const e of assertSpec.firstTextMatches ?? []) {
    const { pattern, turn } = asObj(e, "pattern");
    const v = turnView(t, turn);
    if (!v) noTurn(`firstTextMatches:${pattern}${at(turn)}`, turn);
    else add(`firstTextMatches:${pattern}${at(turn)}`, v.firstText !== "" && toRegExp(pattern).test(v.firstText), v.firstText === "" ? "no assistant text" : "");
  }

  // A path with a glob character matches files and folders. See `assertTargets`.
  const hits = (p) => (hasGlob(p) ? ` (${assertTargets(layout, p).length} match(es))` : "");
  for (const p of assertSpec.fileExists ?? []) {
    if (!hasGlob(p) && resolveAssertPath(layout, p) === null) add(`fileExists:${p}`, false, "path leaves the repo");
    else add(`fileExists:${p}`, assertTargets(layout, p).length > 0, hits(p).trim());
  }
  for (const p of assertSpec.fileAbsent ?? []) {
    if (!hasGlob(p) && resolveAssertPath(layout, p) === null) add(`fileAbsent:${p}`, false, "path leaves the repo");
    else add(`fileAbsent:${p}`, assertTargets(layout, p).length === 0, hits(p).trim());
  }
  // fileMatches: one file that the path names holds the pattern. fileNotMatches: at least one file, and no file holds it.
  for (const [key, want] of [["fileMatches", true], ["fileNotMatches", false]]) {
    for (const { path: p, pattern } of assertSpec[key] ?? []) {
      const files = assertTargets(layout, p).filter((t) => t.isFile);
      const re = toRegExp(pattern);
      let pass = false;
      let detail = hasGlob(p) ? "no file matches the glob" : "file missing";
      if (files.length) {
        const read = files.map((t) => ({ t, ...readTarget(t) }));
        const bad = read.find((x) => x.error);
        const found = read.filter((x) => !x.error && re.test(x.text)).map((x) => x.t.rel);
        if (want) {
          pass = found.length > 0;
          detail = pass ? (hasGlob(p) ? `found in ${found[0]}` : "") : bad ? `cannot read: ${bad.error}` : "pattern not found";
        } else {
          pass = found.length === 0 && !bad;
          detail = bad ? `cannot read: ${bad.error}` : found.length ? `pattern found in ${found.slice(0, 3).join(", ")}` : `checked ${files.length} file(s)`;
        }
      }
      add(`${key}:${p}~${pattern}`, pass, detail);
    }
  }
  if (assertSpec.fileMatchesGlob) {
    const files = listRepoFiles(layout.repo);
    for (const g of assertSpec.fileMatchesGlob) {
      const hit = files.filter((f) => globToRegExp(g).test(f));
      add(`fileMatchesGlob:${g}`, hit.length > 0, hit.length ? `${hit.length} file(s)` : "no file matches");
    }
  }
  if (assertSpec.onlyFilesChanged) {
    const ch = ctx.baseline ? changedFiles(layout.repo, ctx.baseline) : { ok: false, err: 'the eval needs "setup.gitInit" to compare files', files: [] };
    const outside = ch.files.filter((f) => !matchesAnyGlob(f, assertSpec.onlyFilesChanged));
    add(`onlyFilesChanged:${assertSpec.onlyFilesChanged.join(",")}`, ch.ok && outside.length === 0,
      !ch.ok ? ch.err : outside.length ? `outside the globs: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? ", ..." : ""}` : `changed: ${ch.files.length}`);
  }

  for (const b of assertSpec.gitBranchExists ?? []) {
    add(`gitBranchExists:${b}`, git(layout.repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`]).ok);
  }
  for (const [b, want] of Object.entries(assertSpec.gitCommitCountOn ?? {})) {
    const base = ctx.baseline?.head;
    const rr = base ? git(layout.repo, ["rev-list", "--count", `${base}..refs/heads/${b}`]) : { ok: false, out: "", err: "no baseline commit" };
    const n = rr.ok ? Number(rr.out) : NaN;
    const range = typeof want === "number" ? { min: want, max: want } : want;
    const pass = rr.ok && (range.min === undefined || n >= range.min) && (range.max === undefined || n <= range.max);
    add(`gitCommitCountOn:${b}=${typeof want === "number" ? want : JSON.stringify(want)}`, pass, rr.ok ? `new commits: ${n}` : rr.err || "branch missing");
  }
  if (assertSpec.gitWorktreeExists !== undefined) {
    const w = worktreeBranches(layout.repo);
    if (assertSpec.gitWorktreeExists === true) add("gitWorktreeExists", w.ok && w.count > 1, `worktrees: ${w.count}`);
    else for (const b of assertSpec.gitWorktreeExists) add(`gitWorktreeExists:${b}`, w.ok && w.branches.includes(b), `worktree branches: ${w.branches.join(", ") || "none"}`);
  }

  for (const e of assertSpec.scriptPasses ?? []) {
    const name = `scriptPasses:${e.skill ? `${e.skill}/` : ""}${e.script}${e.file ? ` ${e.file}` : ""}`;
    const found = scriptPath(e, layout, ctx.stackRoot ?? STACK_ROOT);
    const script = found.path;
    const file = e.file ? resolveAssertPath(layout, e.file) : null;
    if (found.error) add(name, false, found.error);
    else if (e.file && (file === null || !existsSync(file))) add(name, false, `file missing: ${e.file}`);
    else {
      const r = spawnSync(process.execPath, [script, ...(file ? [file] : []), ...(e.args ?? [])], { cwd: layout.repo, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
      const first = ((r.stderr || r.stdout || "").trim().split("\n")[0] ?? "").slice(0, 200);
      add(name, r.status === 0, `exit ${r.status ?? r.signal}${r.status === 0 || !first ? "" : `: ${first}`}`);
    }
  }

  const blocks = hookBlocks(t);
  if (assertSpec.hookBlocked !== undefined) {
    const re = typeof assertSpec.hookBlocked === "string" ? toRegExp(assertSpec.hookBlocked) : null;
    const hit = blocks.filter((h) => !re || re.test(h.output));
    add(`hookBlocked${re ? ":" + assertSpec.hookBlocked : ""}`, hit.length > 0, `PreToolUse blocks: ${blocks.length}`);
  }
  if (assertSpec.hookNotBlocked) add("hookNotBlocked", blocks.length === 0, `PreToolUse blocks: ${blocks.length}`);

  if (assertSpec.noRepoChanges) {
    // The work tree must look as it did after the setup. Without `setup.uncommitted` that is a clean `git status`.
    const now = workTreeState(layout.repo);
    const head = git(layout.repo, ["rev-parse", "HEAD"]);
    const branches = git(layout.repo, ["for-each-ref", "--format=%(refname)", "refs/heads"]).out;
    const b = ctx.baseline;
    const was = b?.state ?? { status: "", hashes: {} };
    const same = b ? head.out === b.head && branches === b.branches : true;
    const newLines = now.status.split("\n").filter((l) => l && !was.status.split("\n").includes(l));
    const edited = Object.keys(was.hashes).filter((f) => now.hashes[f] !== was.hashes[f]);
    const clean = now.ok && now.status === was.status && edited.length === 0;
    const detail = newLines.length ? `status: ${newLines.slice(0, 3).join("; ")}` : edited.length ? `changed after the setup: ${edited.slice(0, 3).join(", ")}` : now.status !== was.status ? "git status changed" : same ? "" : "HEAD or branches changed";
    add("noRepoChanges", clean && same, detail);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Prepare a temp repo
// ---------------------------------------------------------------------------

/** Make the folder layout for one run. The root is outside every git repo. */
export function makeLayout({ stackRoot = STACK_ROOT, base = tmpdir() } = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(base), "eval-run-")));
  if (isInside(root, stackRoot) || hasGitAbove(root)) {
    rmSync(root, { recursive: true, force: true });
    throw new UsageError(`temp folder ${root} is inside a git repo or the stack repo; set TMPDIR to a folder outside every repo`);
  }
  const layout = { root, repo: join(root, "repo"), tmp: join(root, "tmp"), origin: join(root, "origin.git") };
  mkdirSync(layout.repo);
  mkdirSync(layout.tmp);
  return layout;
}

function isInside(p, dir) {
  const rel = relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hasGitAbove(p) {
  let d = p;
  for (;;) {
    if (existsSync(join(d, ".git"))) return true;
    const up = dirname(d);
    if (up === d) return false;
    d = up;
  }
}

/**
 * Prepare the repo from the setup block. The steps run in this order: gitInit, installStack, files, commit,
 * origin (a bare repo in the temp folder, with the setup commit pushed to `main`), branch, githooks, uncommitted.
 * Returns the baseline { head, branches, state } or null without git. `state` is `workTreeState` after the setup.
 */
export function prepareSetup(setup, layout, { stackRoot = STACK_ROOT } = {}) {
  const s = setup ?? {};
  const must = (r, what) => {
    if (!r.ok) throw new Error(`setup step failed: ${what}: ${r.err}`);
    return r;
  };
  const write = (list) => {
    for (const f of list ?? []) {
      if (!isSafeRelPath(f.path)) throw new Error(`setup file path is not safe: ${f.path}`);
      const full = join(layout.repo, f.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, f.content);
    }
  };
  if (s.gitInit) must(git(layout.repo, ["init", "-q", "-b", "main"]), "git init");
  if (s.installStack) {
    const r = spawnSync(process.execPath, [join(stackRoot, "scripts", "install.mjs"), layout.repo], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`setup step failed: install: ${(r.stderr || r.stdout || "").trim()}`);
  }
  write(s.files);
  if (!s.gitInit) return null;
  if (s.commit !== false) {
    must(git(layout.repo, ["add", "-A"]), "git add");
    must(git(layout.repo, ["commit", "-q", "--allow-empty", "-m", "eval setup"]), "git commit");
  }
  if (s.origin) {
    // The bare repo is inside the temp folder of the run, so a push never leaves the machine.
    if (!isInside(layout.origin, layout.root)) throw new Error(`setup step failed: origin ${layout.origin} is outside the temp folder`);
    must(git(layout.root, ["init", "-q", "--bare", "-b", "main", layout.origin]), "git init --bare");
    must(git(layout.repo, ["remote", "add", "origin", layout.origin]), "git remote add");
    if (git(layout.repo, ["rev-parse", "--verify", "--quiet", "refs/heads/main"]).ok) {
      must(git(layout.repo, ["push", "-q", "-u", "origin", "main"]), "git push origin main");
    }
  }
  if (s.branch) must(git(layout.repo, ["switch", "-q", "-c", s.branch]), "git switch");
  if (s.githooks) must(git(layout.repo, ["config", "core.hooksPath", ".githooks"]), "git config");
  write(s.uncommitted);
  const head = git(layout.repo, ["rev-parse", "HEAD"]);
  const branches = git(layout.repo, ["for-each-ref", "--format=%(refname)", "refs/heads"]).out;
  return head.ok ? { head: head.out, branches, state: workTreeState(layout.repo) } : null;
}

// ---------------------------------------------------------------------------
// 8. Run one eval once
// ---------------------------------------------------------------------------

// Everything the script must clean up on exit: temp folders and running agents.
const live = { runs: new Set(), children: new Set() };

/** The name that Claude Code gives to the session folder of a working folder: every character that is not a letter or digit becomes "-". */
export function sessionDirName(p) {
  return p.replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * Delete the session data that belongs to a temp repo. Claude Code keeps a session in
 * `<config dir>/projects/<working folder with "-" for each odd character>/`, and a few files
 * named by the session id in `session-env/` and `file-history/`.
 * The temp folder has a random name, so the match is exact and cannot hit another project.
 * Returns the paths that it deleted. It does not touch `history.jsonl`, which holds one line for each prompt of every project.
 */
export function removeSessionData(layout, sessionIds = [], { configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude") } = {}) {
  const removed = [];
  const rootKey = sessionDirName(layout.root);
  for (const dir of [layout.repo, layout.tmp]) {
    const name = sessionDirName(dir);
    if (!name.startsWith(rootKey) || name === rootKey) continue;
    const p = join(configDir, "projects", name);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      removed.push(p);
    }
  }
  for (const id of sessionIds) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    for (const sub of ["session-env", "file-history"]) {
      const p = join(configDir, sub, id);
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
        removed.push(p);
      }
    }
  }
  return removed;
}

function cleanupRun(run) {
  try {
    if (!run.keep) {
      removeSessionData(run.layout, run.sessionIds, { configDir: run.configDir });
      rmSync(run.layout.root, { recursive: true, force: true });
    }
  } catch {
    /* a cleanup error must not hide the real result */
  }
  live.runs.delete(run);
}

/** Remove every live temp folder and stop every running agent. The signal handlers and the exit handler call this. */
export function cleanupAll() {
  for (const c of live.children) {
    try {
      c.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  live.children.clear();
  for (const run of [...live.runs]) cleanupRun(run);
}

/**
 * Make Ctrl+C, a kill and a normal exit remove the temp folders. The signal handler works because
 * the agent runs in an async child process, so the event loop is free to see the signal.
 */
export function installSignalCleanup(proc = process, onSignal = (code) => proc.exit(code)) {
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
    proc.on(sig, () => {
      const n = live.runs.size;
      cleanupAll();
      process.stderr.write(`Stopped by ${sig}. ${n} temp folder(s) removed.\n`);
      onSignal(code);
    });
  }
  proc.on("exit", cleanupAll);
}

/** Run the agent as an async child process. Resolves with { status, signal, stdout, stderr, error, timedOut }. */
export function defaultSpawn(cmd, args, { cwd, env, timeoutMs }) {
  return new Promise((resolveRun) => {
    const out = [];
    const err = [];
    let child;
    let settled = false;
    let timedOut = false;
    let timer;
    let killTimer;
    let graceTimer;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      if (child) live.children.delete(child);
      resolveRun({ status: null, signal: null, error: null, ...extra, timedOut, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    };
    try {
      child = nodeSpawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      finish({ error: String(e.message) });
      return;
    }
    live.children.add(child);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => finish({ error: String(e.message) }));
    // `close` waits for the pipes. A grandchild can hold a pipe open, so `exit` starts a short grace time.
    child.on("exit", (status, signal) => {
      graceTimer = setTimeout(() => finish({ status, signal }), 2000);
    });
    child.on("close", (status, signal) => finish({ status, signal }));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);
  });
}

const failedRun = (setupError, stream = "") => ({ pass: false, asserts: [], costUsd: 0, turns: 0, subtype: "", setupError, stream, turnCount: 0, sessionIds: [] });

/** Remove the asserts that name the skill that a baseline run turns off. They cannot pass without the skill. */
export function stripSkillAsserts(spec, skill) {
  const out = { ...spec };
  for (const k of ["skillLoaded", "skillNotLoaded"]) {
    if (!out[k]) continue;
    const keep = out[k].filter((e) => (typeof e === "string" ? e : e.name) !== skill);
    if (keep.length) out[k] = keep;
    else delete out[k];
  }
  return out;
}

/**
 * One run. Returns { pass, asserts, costUsd, turns, subtype, setupError, stream, turnCount, sessionIds, keptAt, baselineInvalid, timedOut }.
 * `setupError` is set when the run could not start. The caller treats it as exit code 2.
 * A timeout is not a setup error: the run fails with the assert `timeout` and the subtype "timeout".
 * The eval can have follow-up prompts in `checks.turns`. Each one runs with `--resume <session id>` in the same temp repo.
 * `budgetUsd` applies to each turn. `costUsd` is the total of all turns.
 * With `baseline` the skill named in `checks.baseline.skill` is turned off (`skillOverrides`) and the asserts of that skill are dropped.
 * The temp folder is removed on every exit path unless `keep` is true.
 */
export async function runOnce({
  checks, model, claudePath, budgetUsd, allowNetwork, timeoutMs, stackRoot = STACK_ROOT, base, spawn = defaultSpawn,
  baseEnv = process.env, keep = false, baseline = false, configDir,
}) {
  let layout;
  try {
    layout = makeLayout({ stackRoot, base });
  } catch (e) {
    return failedRun(e.message);
  }
  const sessionIds = [];
  const entry = { layout, keep, sessionIds, configDir };
  live.runs.add(entry);
  try {
    let repoBaseline;
    try {
      repoBaseline = prepareSetup(checks.setup, layout, { stackRoot });
    } catch (e) {
      return failedRun(e.message);
    }
    const prompts = [checks.prompt, ...(checks.turns ?? [])];
    const multi = prompts.length > 1;
    const skillOff = baseline ? checks.baseline?.skill : undefined;
    const env = agentEnv(baseEnv, layout);
    const transcripts = [];
    const streams = [];
    let sessionId = null;
    let killed = "";
    for (let i = 0; i < prompts.length; i++) {
      let cmdLine;
      try {
        cmdLine = buildCommand({
          claudePath, prompt: prompts[i], model, allowedTools: checks.allowedTools, budgetUsd, allowNetwork,
          tools: checks.tools, disallowedTools: checks.disallowedTools, permissionMode: checks.permissionMode,
          resumeId: i > 0 ? sessionId : undefined, persistSession: multi, baselineSkill: skillOff,
        });
      } catch (e) {
        return failedRun(e.message);
      }
      const { cmd, args } = cmdLine;
      const run = await spawn(cmd, args, { cwd: layout.repo, env, timeoutMs });
      if (run.error) return failedRun(`cannot start ${cmd}: ${run.error}`, streams.join("\n"));
      if (run.timedOut) {
        // A timeout is a failed run, not a setup error. The caller records it and goes on with the next run.
        const partial = parseTranscript(run.stdout);
        if (partial.sessionId && !sessionIds.includes(partial.sessionId)) sessionIds.push(partial.sessionId);
        const done = transcripts.reduce((a, x) => ({ cost: a.cost + (x.result?.costUsd ?? 0), turns: a.turns + (x.result?.turns ?? 0) }), { cost: 0, turns: 0 });
        const why = `the agent timed out after ${timeoutMs / 1000} s${multi ? ` in turn ${i + 1}` : ""}. Fix: raise --timeout-sec or shorten the eval.`;
        return {
          pass: false, asserts: [{ name: "timeout", pass: false, detail: why }], costUsd: done.cost, turns: done.turns, subtype: "timeout",
          setupError: null, timedOut: true, stream: [...streams, run.stdout].join("\n"), turnCount: transcripts.length + 1,
          sessionIds: [...sessionIds], keptAt: keep ? layout.root : null, baselineInvalid: false,
        };
      }
      const transcript = parseTranscript(run.stdout);
      if (!transcript.init && !transcript.result) {
        const why = run.signal ? `killed by ${run.signal} (timeout?)` : (run.stderr || run.stdout || "no output").trim().slice(0, 300);
        return failedRun(`the agent gave no stream${multi ? ` in turn ${i + 1}` : ""} (exit ${run.status}): ${why}`, [...streams, run.stdout].join("\n"));
      }
      transcripts.push(transcript);
      streams.push(run.stdout);
      if (run.signal) killed = run.signal;
      if (transcript.sessionId && !sessionIds.includes(transcript.sessionId)) sessionIds.push(transcript.sessionId);
      sessionId = transcript.sessionId ?? sessionId;
      const r = transcript.result;
      if (i < prompts.length - 1) {
        if (!sessionId) return failedRun(`turn ${i + 1} gave no session id, so turn ${i + 2} cannot resume. Fix: check that the agent binary is a real claude with stream-json output.`, streams.join("\n"));
        if (!r || r.subtype !== "success" || r.isError) break; // later turns would not mean anything
      }
    }
    const merged = mergeTranscripts(transcripts);
    const spec = skillOff ? stripSkillAsserts(checks.assert, skillOff) : checks.assert;
    const asserts = evaluateAsserts(spec, { transcript: merged, prompt: checks.prompt, prompts, turnCount: prompts.length, layout, baseline: repoBaseline, stackRoot });
    if (killed) asserts.find((a) => a.name === "runCompleted").detail += `; killed by ${killed}`;
    const baselineInvalid = Boolean(skillOff && Array.isArray(merged.init?.skills) && merged.init.skills.includes(skillOff));
    return {
      pass: asserts.every((a) => a.pass),
      asserts,
      costUsd: merged.result?.costUsd ?? transcripts.reduce((a, x) => a + (x.result?.costUsd ?? 0), 0),
      turns: merged.result?.turns ?? transcripts.reduce((a, x) => a + (x.result?.turns ?? 0), 0),
      subtype: merged.result?.subtype ?? transcripts.find((x) => x.result)?.result.subtype ?? "none",
      setupError: null,
      stream: streams.join("\n"),
      turnCount: transcripts.length,
      sessionIds: [...sessionIds],
      keptAt: keep ? layout.root : null,
      baselineInvalid,
    };
  } finally {
    cleanupRun(entry);
  }
}

// ---------------------------------------------------------------------------
// 9. Plan, summary and report
// ---------------------------------------------------------------------------

/** Per-run budget: the eval value (default 1 USD), lowered by --budget-usd when given. */
export function runBudget(checks, capUsd) {
  const own = checks.budgetUsd ?? DEFAULT_BUDGET_USD;
  return capUsd === undefined ? own : Math.min(own, capUsd);
}

/**
 * The plan. For each eval that can run: `turnCount` (the prompt plus the follow-ups), `runCount`,
 * and `baselineRuns` (the extra runs without the skill, only with `baseline: true` and an eval that has a `baseline` field).
 * The budget applies to each turn, so the cap of an eval is budget x turns x runs, and the baseline runs add to it.
 */
export function buildPlan(evals, { models, runs, capUsd, baseline = false }) {
  const items = [];
  let total = 0;
  for (const e of evals) {
    if (e.manual) {
      items.push({ ...e, runnable: false });
      continue;
    }
    const budget = runBudget(e.checks, capUsd);
    const n = models.length * runs;
    const turnCount = 1 + (e.checks.turns?.length ?? 0);
    const baselineRuns = baseline && e.checks.baseline ? n : 0;
    total += budget * turnCount * (n + baselineRuns);
    items.push({ ...e, runnable: true, budget, runCount: n, turnCount, baselineRuns, set: e.checks.set ?? DEFAULT_SET });
  }
  return { items, totalCapUsd: total };
}

/** Group run results into one row per eval and model. A baseline record never counts here. */
export function summarize(records, minPassRate) {
  const rows = new Map();
  for (const rec of records) {
    if (rec.baseline) continue;
    const key = `${rec.skill}\0${rec.eval}\0${rec.model}`;
    if (!rows.has(key)) rows.set(key, { skill: rec.skill, eval: rec.eval, model: rec.model, set: rec.set ?? DEFAULT_SET, runs: 0, passes: 0, failed: new Map(), costUsd: 0 });
    const row = rows.get(key);
    row.runs++;
    row.costUsd += rec.costUsd;
    if (rec.pass) row.passes++;
    for (const a of rec.asserts) if (!a.pass) row.failed.set(a.name, (row.failed.get(a.name) ?? 0) + 1);
  }
  return [...rows.values()].map((r) => {
    const rate = r.runs ? r.passes / r.runs : 0;
    return { ...r, failed: Object.fromEntries(r.failed), passRate: rate, meets: rate >= minPassRate, gated: r.set === DEFAULT_SET };
  });
}

/**
 * Compare the runs with the skill and the runs without it, for each eval and model that has baseline runs.
 * A baseline run that still showed the skill is invalid and does not count.
 * The difference is in percentage points (with minus without).
 */
export function summarizeBaseline(records) {
  const rows = new Map();
  const row = (rec) => {
    const key = `${rec.skill}\0${rec.eval}\0${rec.model}`;
    if (!rows.has(key)) rows.set(key, { skill: rec.skill, eval: rec.eval, model: rec.model, baselineSkill: "", withRuns: 0, withPasses: 0, withoutRuns: 0, withoutPasses: 0, invalid: 0 });
    return rows.get(key);
  };
  const hasBaseline = new Set(records.filter((r) => r.baseline).map((r) => `${r.skill}\0${r.eval}\0${r.model}`));
  for (const rec of records) {
    const key = `${rec.skill}\0${rec.eval}\0${rec.model}`;
    if (!hasBaseline.has(key)) continue;
    const r = row(rec);
    if (!rec.baseline) {
      r.withRuns++;
      if (rec.pass) r.withPasses++;
    } else {
      r.baselineSkill = rec.baselineSkill ?? r.baselineSkill;
      if (rec.baselineInvalid) r.invalid++;
      else {
        r.withoutRuns++;
        if (rec.pass) r.withoutPasses++;
      }
    }
  }
  return [...rows.values()].map((r) => {
    const withRate = r.withRuns ? r.withPasses / r.withRuns : null;
    const withoutRate = r.withoutRuns ? r.withoutPasses / r.withoutRuns : null;
    return { ...r, withRate, withoutRate, diffPoints: withRate !== null && withoutRate !== null ? Math.round((withRate - withoutRate) * 100) : null };
  });
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function table(header, body) {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
  return [
    "  " + header.map((h, i) => pad(h, widths[i])).join("  ").trimEnd(),
    ...body.map((b) => "  " + b.map((c, i) => pad(c, widths[i])).join("  ").trimEnd()),
  ];
}

const pct = (r) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);

export function formatReport(rows, manual, { gate = false, baselineRows = [] } = {}) {
  const lines = [];
  const skills = [...new Set(rows.map((r) => r.skill))];
  for (const skill of skills) {
    lines.push(`Skill: ${skill}`);
    const header = ["eval", "set", "model", "runs", "passes", "passed", "rate", "met", "failed asserts", "cost USD"];
    const body = rows.filter((r) => r.skill === skill).map((r) => [
      r.eval, r.set ?? DEFAULT_SET, r.model, r.runs, r.passes, `${r.passes}/${r.runs}`, `${Math.round(r.passRate * 100)}%`,
      r.meets ? "yes" : gate && r.gated === false ? "no (not gated)" : "NO",
      Object.entries(r.failed).map(([k, v]) => `${k} x${v}`).join("; ") || "-", r.costUsd.toFixed(4),
    ]);
    lines.push(...table(header, body));
    lines.push("");
  }
  if (baselineRows.length) {
    lines.push("Baseline without the skill (this never counts as a failure):");
    lines.push(...table(
      ["eval", "model", "skill off", "with skill", "without skill", "difference"],
      baselineRows.map((r) => [
        r.eval, r.model, r.baselineSkill || "-",
        r.withRuns ? `${pct(r.withRate)} (${r.withPasses}/${r.withRuns})` : "n/a",
        r.withoutRuns ? `${pct(r.withoutRate)} (${r.withoutPasses}/${r.withoutRuns})` : "n/a",
        (r.diffPoints === null ? "n/a" : `${r.diffPoints > 0 ? "+" : ""}${r.diffPoints} points`) + (r.invalid ? ` (${r.invalid} invalid run(s): the skill was still listed)` : ""),
      ]),
    ));
    lines.push("");
  }
  if (manual.length) {
    lines.push("Manual only (no Checks block, not counted as a pass):");
    for (const m of manual) lines.push(`  ${m}`);
    lines.push("");
  }
  const cost = rows.reduce((a, r) => a + r.costUsd, 0);
  lines.push(`Total cost: ${cost.toFixed(4)} USD. Evals that met the threshold: ${rows.filter((r) => r.meets).length} of ${rows.length}.`);
  if (gate) {
    const failing = rows.filter((r) => r.gated !== false && !r.meets).length;
    const capBelow = rows.filter((r) => r.gated === false && !r.meets).length;
    lines.push(`Gate: ${failing} regression eval(s) below the threshold. ${capBelow} capability eval(s) below it do not gate.`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 10. Main
// ---------------------------------------------------------------------------

const USAGE = `Usage: node scripts/eval-run.mjs [--skill <name>] [--eval <file>] [--runs N] [--models a,b]
         [--budget-usd n] [--min-pass-rate r] [--out <dir>] [--claude <path>]
         [--timeout-sec n] [--jobs n] [--allow-network] [--dry-run] [--baseline] [--gate] [--keep]`;

export function parseCli(argv) {
  let v;
  try {
    ({ values: v } = parseArgs({
      args: argv,
      options: {
        skill: { type: "string" }, eval: { type: "string" }, runs: { type: "string", default: "1" }, models: { type: "string" },
        "budget-usd": { type: "string" }, "min-pass-rate": { type: "string", default: "1" }, out: { type: "string" },
        claude: { type: "string" }, "timeout-sec": { type: "string", default: "600" }, jobs: { type: "string", default: "1" },
        "allow-network": { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false }, help: { type: "boolean", default: false },
        baseline: { type: "boolean", default: false }, gate: { type: "boolean", default: false }, keep: { type: "boolean", default: false },
      },
      allowPositionals: false,
    }));
  } catch (e) {
    throw new UsageError(e.message);
  }
  const num = (name, s, test, msg) => {
    const n = Number(s);
    if (s === undefined || !Number.isFinite(n) || !test(n)) throw new UsageError(`--${name} ${msg}`);
    return n;
  };
  const opts = {
    help: v.help,
    skill: v.skill,
    evalFile: v.eval,
    runs: num("runs", v.runs, (n) => Number.isInteger(n) && n >= 1, "must be a whole number of 1 or more"),
    models: v.models === undefined ? [null] : v.models.split(",").map((s) => s.trim()),
    capUsd: v["budget-usd"] === undefined ? undefined : num("budget-usd", v["budget-usd"], (n) => n > 0, "must be a number above 0"),
    minPassRate: num("min-pass-rate", v["min-pass-rate"], (n) => n > 0 && n <= 1, "must be above 0 and at most 1"),
    out: v.out,
    claude: v.claude,
    timeoutMs: num("timeout-sec", v["timeout-sec"], (n) => n > 0, "must be above 0") * 1000,
    jobs: num("jobs", v.jobs, (n) => Number.isInteger(n) && n >= 1, "must be a whole number of 1 or more"),
    allowNetwork: v["allow-network"],
    dryRun: v["dry-run"],
    baseline: v.baseline,
    gate: v.gate,
    keep: v.keep,
  };
  if (opts.models.some((m) => m !== null && !/^[A-Za-z0-9._:\[\]-]+$/.test(m))) throw new UsageError("--models has an empty or unsafe model name");
  return opts;
}

export async function main(argv, { stackRoot = STACK_ROOT, stdout = (s) => process.stdout.write(s + "\n"), stderr = (s) => process.stderr.write(s + "\n"), spawn, base, env = process.env, home = homedir(), configDir } = {}) {
  let opts;
  try {
    opts = parseCli(argv);
  } catch (e) {
    stderr(`${e.message}\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    stdout(USAGE);
    return 0;
  }

  // Load evals.
  const evalsDir = join(stackRoot, "evals");
  let found;
  try {
    found = discoverEvals(evalsDir, { skill: opts.skill, evalFile: opts.evalFile });
  } catch (e) {
    stderr(`cannot read ${evalsDir}: ${e.message}`);
    return 2;
  }
  if (found.length === 0) {
    stderr("no eval matches --skill and --eval");
    return 2;
  }
  const evals = [];
  let bad = 0;
  for (const f of found) {
    try {
      evals.push({ ...f, ...parseEvalFile(readFileSync(f.path, "utf8")) });
    } catch (e) {
      stderr(`${f.rel}: ${e.message}`);
      bad++;
    }
  }
  if (bad) return 2;

  // Refuse network tools.
  if (!opts.allowNetwork) {
    for (const e of evals) {
      if (e.manual) continue;
      const net = networkWritingTools(e.checks.allowedTools);
      if (net.length) {
        stderr(`${e.rel}: allowedTools has tools that can write to the network (${net.join(", ")}). Pass --allow-network to run it.`);
        bad++;
      }
    }
    if (bad) return 2;
  }

  const plan = buildPlan(evals, { models: opts.models, runs: opts.runs, capUsd: opts.capUsd, baseline: opts.baseline });
  const modelLabel = (m) => m ?? "default";
  stdout(`Plan: ${opts.models.map(modelLabel).join(", ")} x ${opts.runs} run(s) each`);
  for (const it of plan.items.filter((i) => i.runnable)) {
    const notes = [
      it.turnCount > 1 ? `${it.turnCount} turns, the budget is for each turn` : "",
      it.baselineRuns ? `${it.baselineRuns} extra baseline run(s) without skill ${it.checks.baseline.skill}` : "",
      it.set !== DEFAULT_SET ? `set ${it.set}` : "",
    ].filter(Boolean);
    stdout(`  ${it.rel}: ${it.runCount} run(s), budget ${it.budget} USD each${notes.length ? ` (${notes.join(", ")})` : ""}`);
  }
  if (opts.baseline && !plan.items.some((i) => i.baselineRuns)) stdout("No eval has a baseline field, so --baseline adds no run.");
  const manual = plan.items.filter((i) => !i.runnable).map((i) => i.rel);
  stdout(`Manual only (no Checks block, skipped): ${manual.length}`);
  stdout(`Total budget cap: ${plan.totalCapUsd.toFixed(2)} USD`);
  const picked = resolveClaude({ flag: opts.claude, env, home });
  if (opts.dryRun) {
    stdout(picked.error ? `Claude binary: none (${picked.error})` : `Claude binary: ${picked.path} (from ${picked.source})`);
    return 0;
  }
  if (picked.error) {
    stderr(picked.error);
    return 2;
  }
  const claudePath = picked.path;
  stdout(`Claude binary: ${claudePath} (from ${picked.source})`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(opts.out ?? join(tmpdir(), "agent-stack-evals", stamp));
  mkdirSync(outDir, { recursive: true });

  // One job for each run, in plan order. Up to --jobs runs go at once. Each run has its own temp folder and its own
  // --max-budget-usd, so the total budget cap of the plan holds for any number of jobs.
  const runSpecs = (it) => (opts.baseline && it.checks.baseline ? [false, true] : [false]);
  const queue = [];
  for (const it of plan.items) {
    if (!it.runnable) continue;
    for (const model of opts.models) for (let i = 1; i <= opts.runs; i++) for (const isBaseline of runSpecs(it)) queue.push({ it, model, i, isBaseline });
  }
  if (opts.jobs > 1) stdout(`Jobs: up to ${opts.jobs} runs at once. Each run keeps its own budget, so the total cap holds.`);
  const slots = new Array(queue.length);
  let setupError = null;
  let next = 0;
  const label = ({ it, model, i, isBaseline }) => `${it.rel} model=${modelLabel(model)} ${i}/${opts.runs}${isBaseline ? ` baseline (skill ${it.checks.baseline.skill} off)` : ""}`;
  const worker = async () => {
    while (setupError === null && next < queue.length) {
      const k = next++;
      const job = queue[k];
      const { it, model, i, isBaseline } = job;
      stdout(opts.jobs > 1 ? `Start ${label(job)}` : `Run ${label(job)} ...`);
      const r = await runOnce({ checks: it.checks, model, claudePath, budgetUsd: it.budget, allowNetwork: opts.allowNetwork, timeoutMs: opts.timeoutMs, stackRoot, base, spawn, baseEnv: env, keep: opts.keep, baseline: isBaseline, configDir });
      if (r.setupError) {
        setupError ??= `${it.rel}: ${r.setupError}`;
        continue;
      }
      const name = `${it.skill}__${it.file.replace(/\.md$/, "")}__${(model ?? "default").replace(/[^A-Za-z0-9._-]/g, "_")}__${isBaseline ? "baseline__" : ""}${i}.jsonl`;
      mkdirSync(join(outDir, "transcripts"), { recursive: true });
      writeFileSync(join(outDir, "transcripts", name), r.stream);
      slots[k] = {
        skill: it.skill, eval: it.file, model: modelLabel(model), run: i, set: it.set, pass: r.pass, costUsd: r.costUsd, turns: r.turns, subtype: r.subtype,
        ...(it.turnCount > 1 ? { turnCount: r.turnCount } : {}),
        ...(r.timedOut ? { timedOut: true } : {}),
        ...(isBaseline ? { baseline: true, baselineSkill: it.checks.baseline.skill, baselineInvalid: r.baselineInvalid } : {}),
        asserts: r.asserts, transcript: `transcripts/${name}`,
      };
      const lines = [];
      if (opts.jobs > 1) lines.push(`Done ${label(job)}`);
      lines.push(`  ${isBaseline ? "baseline " : ""}${r.pass ? "pass" : "FAIL"} (${r.subtype}, ${r.turns} turns, ${r.costUsd.toFixed(4)} USD)${r.baselineInvalid ? " the skill was still listed, so this baseline run is invalid" : ""}`);
      for (const a of r.asserts.filter((x) => !x.pass)) lines.push(`    failed ${a.name}${a.detail ? ` (${a.detail})` : ""}`);
      if (r.keptAt) lines.push(`  kept temp folder: ${r.keptAt}`);
      stdout(lines.join("\n"));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.jobs, queue.length) }, worker));
  const records = slots.filter(Boolean);

  const rows = summarize(records, opts.minPassRate);
  stdout("");
  const baselineRows = summarizeBaseline(records);
  stdout(formatReport(rows, manual, { gate: opts.gate, baselineRows }));
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ startedAt: stamp, minPassRate: opts.minPassRate, gate: opts.gate, runsPerEval: opts.runs, jobs: opts.jobs, models: opts.models.map(modelLabel), totalBudgetCapUsd: plan.totalCapUsd, claudeBinary: { path: claudePath, source: picked.source }, summary: rows, baselineSummary: baselineRows, manualOnly: manual, runs: records, setupError }, null, 2) + "\n");
  stdout(`Results: ${join(outDir, "results.json")}`);
  if (setupError) {
    stderr(`Setup error, run stopped: ${setupError}`);
    return 2;
  }
  // Without --gate every eval counts, as before. With --gate only a regression eval counts.
  const failing = opts.gate ? rows.filter((r) => r.gated && !r.meets) : rows.filter((r) => !r.meets);
  return failing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  installSignalCleanup();
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e?.stack ?? e}\n`);
    process.exit(2);
  });
}
