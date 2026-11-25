#!/usr/bin/env node
// Claude Code PreToolUse hook for the Bash tool. It blocks risky git commands.
//
// Input: the hook JSON on stdin. The Bash command is at tool_input.command.
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

import { execFileSync } from "node:child_process";
import { writeSync } from "node:fs";
import { homedir } from "node:os";

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
  let payload;
  try {
    payload = JSON.parse(await readStdin());
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
  const branchOf = (dirs) => {
    try {
      return (
        execFileSync("git", ["-C", policy.resolveDirs(base, dirs, homedir()), "symbolic-ref", "--short", "-q", "HEAD"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        }).trim() || null
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
