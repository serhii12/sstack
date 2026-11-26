#!/usr/bin/env node
// run-playwright: runs one capture script with Playwright installed outside the project.
//
// The `prove` skill uses it when the project has no browser test tool. Nothing is added to the
// project: no dependency, no lockfile change, no node_modules folder.
//
// Steps:
//   1. Make a new temp folder outside the project.
//   2. Copy the pinned manifest and lockfile from scripts/playwright/ into it, and run `npm ci` there.
//   3. Copy the capture script into it as `record.mjs`, so that `import "playwright"` resolves.
//   4. Run `playwright install chromium`. The browser goes to the Playwright browser cache of
//      the user, and it stays there for later runs.
//   5. Run `node record.mjs <args>` with the current folder as its working folder, so that
//      relative paths such as `.artifacts/<task>/evidence/` point into the project.
//   6. Delete the temp folder, also when a step fails.
// Before step 2 it prints what it will install and where. The skill copies that line into its report.
//
// Adapted from rstack evidence-driven-testing/scripts/run-playwright.sh (Michael Shimeles, no
// license file, see NOTICE in the sstack repo). The manifest and the lockfile in scripts/playwright/ are copied from
// the same folder. This file is new code in Node, so the stack needs no Bash.
//
// The skill folder ships to projects, so this file runs from the project root as
//   node .claude/skills/prove/scripts/run-playwright.mjs <capture.mjs> [script arguments...]
//   node .claude/skills/prove/scripts/run-playwright.mjs --dry-run <capture.mjs>
// Exit codes: the exit code of the capture script, 2 usage error, 3 the install failed.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: node .claude/skills/prove/scripts/run-playwright.mjs [--dry-run] <capture.mjs> [script arguments...]";
const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_DIR = join(HERE, "playwright");
export const EXIT = { USAGE: 2, INSTALL: 3 };

/** The pinned Playwright version from the manifest. */
export function pinnedVersion(manifestDir = MANIFEST_DIR) {
  const pkg = JSON.parse(readFileSync(join(manifestDir, "package.json"), "utf8"));
  return pkg.dependencies.playwright;
}

/** Where Playwright keeps its browsers. PLAYWRIGHT_BROWSERS_PATH wins, as in Playwright itself. */
export function browserCache(env = process.env, os = platform(), home = homedir()) {
  if (env.PLAYWRIGHT_BROWSERS_PATH) return env.PLAYWRIGHT_BROWSERS_PATH;
  if (os === "darwin") return join(home, "Library", "Caches", "ms-playwright");
  if (os === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "ms-playwright");
  return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "ms-playwright");
}

export function installLine(version, tmp, cache) {
  return `run-playwright: installs playwright@${version} with npm ci in ${tmp} (deleted at the end), and Chromium in ${cache} (kept). Nothing goes into the project.`;
}

function step(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
  if (r.error) return { ok: false, why: r.error.message };
  return { ok: r.status === 0, status: r.status, why: `exit ${r.status ?? r.signal}` };
}

/**
 * Run the capture. Returns the exit code.
 * `npm` and `tmpRoot` exist for the tests. The skill never passes them.
 */
export function runCapture({ script, args = [], cwd = process.cwd(), npm = "npm", tmpRoot = tmpdir(), manifestDir = MANIFEST_DIR, log = (m) => console.error(m) }) {
  const src = resolve(cwd, script);
  let isFile = false;
  try {
    isFile = statSync(src).isFile();
  } catch {}
  if (!isFile) {
    log(`run-playwright: the capture script ${src} does not exist. Fix: write the script first, then pass its path.\n${USAGE}`);
    return EXIT.USAGE;
  }
  const tmp = mkdtempSync(join(tmpRoot, "prove-playwright-"));
  const cleanup = () => rmSync(tmp, { recursive: true, force: true });
  const onSignal = (sig) => {
    cleanup();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    log(installLine(pinnedVersion(manifestDir), tmp, browserCache()));
    copyFileSync(join(manifestDir, "package.json"), join(tmp, "package.json"));
    copyFileSync(join(manifestDir, "package-lock.json"), join(tmp, "package-lock.json"));
    let r = step(npm, ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: tmp });
    if (!r.ok) {
      log(`run-playwright: npm ci failed (${r.why}). Fix: check the network and npm, then run again. Mark the visual checks untested if it still fails.`);
      return EXIT.INSTALL;
    }
    const bin = join(tmp, "node_modules", ".bin", platform() === "win32" ? "playwright.cmd" : "playwright");
    if (!existsSync(bin)) {
      log(`run-playwright: npm ci did not install the playwright command at ${bin}. Fix: run again. Mark the visual checks untested if it still fails.`);
      return EXIT.INSTALL;
    }
    r = step(bin, ["install", "chromium"], { cwd: tmp });
    if (!r.ok) {
      log(`run-playwright: playwright install chromium failed (${r.why}). Fix: on Linux the browser can need system libraries. Read CAPTURE.md section 7.`);
      return EXIT.INSTALL;
    }
    const record = join(tmp, "record.mjs");
    copyFileSync(src, record);
    const run = spawnSync(process.execPath, [record, ...args], { cwd, stdio: "inherit" });
    if (run.error) {
      log(`run-playwright: node could not start the capture script (${run.error.message}).`);
      return EXIT.INSTALL;
    }
    return run.status ?? 1;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    cleanup();
  }
}

function main(argv) {
  if (argv[0] === "-h" || argv[0] === "--help") {
    console.log(USAGE);
    return 0;
  }
  let dry = false;
  if (argv[0] === "--dry-run") {
    dry = true;
    argv = argv.slice(1);
  }
  if (argv.length === 0 || argv[0].startsWith("-")) {
    console.error(`run-playwright: name one capture script.\n${USAGE}`);
    return EXIT.USAGE;
  }
  if (dry) {
    console.log(installLine(pinnedVersion(), join(tmpdir(), "prove-playwright-XXXXXX"), browserCache()));
    return 0;
  }
  return runCapture({ script: argv[0], args: argv.slice(1) });
}

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
