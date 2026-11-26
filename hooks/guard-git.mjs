#!/usr/bin/env node
// PreToolUse hook for the Bash tool of Claude Code and Codex. It blocks risky git commands.
//
// Input: the hook JSON on stdin. The Bash command is at tool_input.command.
// Codex CLI sends the same keys and adds turn_id and model. This file reads only
// tool_input.command and cwd, so one file serves both tools. Codex also blocks on exit code 2.
// Block: exit code 2 and a message on stderr: what was blocked, why, then a line starting "Fix:".
// Allow: exit code 0 and no output.
//
// Fail closed. Claude Code treats any exit code other than 2 as a non-blocking error, and the
// call goes ahead. So every failure path here exits 2: bad JSON, a missing command, a crash,
// and a policy file that cannot be loaded. Two cases remain that this file cannot cover:
// node failing to start, and a syntax error in this file. The settings template handles those
// with `|| exit 2` after the node command.
//
// Confirm in Claude Code: stdin shape, exit code 2 semantics and the settings wiring
// (docs: https://code.claude.com/docs/en/hooks). See templates/claude-settings.json.
// Codex: templates/codex-hooks.json. Codex runs a project hook only after the user trusts it in /hooks.

import { execFileSync } from "node:child_process";
import { writeSync } from "node:fs";
import { homedir } from "node:os";

// Input above this size is refused. The policy refuses commands above 256 KB by itself.
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
// If stdin never closes, the hook must not wait forever. The settings timeout is a second fence.
// The test sets GUARD_GIT_WATCHDOG_MS to a small number. The hook runs with the environment of Claude Code, not of the command.
const WATCHDOG_MS = Number(process.env.GUARD_GIT_WATCHDOG_MS) > 0 ? Number(process.env.GUARD_GIT_WATCHDOG_MS) : 10_000;

const readStdin = async (onTooLarge) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_INPUT_BYTES) onTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const oneLine = (text) => {
  const flat = String(text).replace(/\s+/gu, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 200)}...` : flat;
};

const block = (what, reason, fix) => {
  writeSync(2, `Blocked: ${what}\nWhy: ${reason}\nFix: ${fix}\n`);
  process.exit(2);
};

process.on("uncaughtException", (error) => {
  block("the guard crashed", `guard-git failed on its own (${oneLine(error?.message ?? error)}), so it cannot judge the command.`, "Report this to the owner. Do not retry the command.");
});

const main = async () => {
  setTimeout(() => {
    block("a Bash call that the guard could not read in time", `The hook input did not end within ${WATCHDOG_MS / 1000} seconds, so the guard cannot judge the call.`, "Send the hook input and close stdin.");
  }, WATCHDOG_MS).unref();

  let payload;
  try {
    payload = JSON.parse(
      await readStdin(() => block("a Bash call with more than 4 MB of hook input", "The input is too large to check in a safe time.", "Write the large text to a file with the file tool, then run a short command.")),
    );
  } catch {
    block("a Bash call whose hook input is not valid JSON", "The guard cannot read what the command is, so it refuses.", "Send a Bash tool call as JSON with tool_input.command.");
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || command.trim() === "") {
    block("a Bash call with no command in the hook input", "The guard found no string at tool_input.command, so it cannot judge the call.", "Send a non-empty tool_input.command.");
  }

  let policy;
  try {
    policy = await import(new URL("./git-policy.mjs", import.meta.url).href);
  } catch (error) {
    block(oneLine(command), `The guard policy file could not be loaded (${oneLine(error?.message ?? error)}).`, "Restore hooks/git-policy.mjs next to guard-git.mjs.");
  }

  const base = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  // One git call for each distinct list of folders, so a long command with many commits stays fast.
  const seen = new Map();
  const branchOf = (dirs) => {
    const key = dirs.join("\0");
    // After 64 different folders the guard stops asking git and treats the branch as main, so it blocks.
    if (!seen.has(key)) seen.set(key, seen.size >= 64 ? "main" : lookup(dirs));
    return seen.get(key);
  };
  const lookup = (dirs) => {
    try {
      return (
        execFileSync("git", ["-C", policy.resolveDirs(base, dirs, homedir()), "symbolic-ref", "-q", "HEAD"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        })
          // The full ref, because --short gives `heads/main` when a tag named main exists.
          .trim()
          .replace(/^refs\/heads\//u, "") || null
      );
    } catch {
      return null;
    }
  };

  const result = policy.evaluateCommand(command, { branchOf });
  if (!result.allow) {
    block(oneLine(command), result.reason, result.fix);
  }

  process.exit(0);
};

await main();
