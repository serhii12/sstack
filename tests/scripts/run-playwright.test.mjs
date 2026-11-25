import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserCache, pinnedVersion, runCapture, EXIT } from "../../skills/prove/scripts/run-playwright.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "skills", "prove", "scripts", "run-playwright.mjs");

/**
 * A fake npm. `npm ci` makes a fake `playwright` package and a `.bin/playwright` command in the
 * current folder. It records each call in calls.log. `mode` makes one step fail.
 */
function fakeNpm(dir, mode = "ok") {
  const npm = join(dir, "npm");
  writeFileSync(
    npm,
    `#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
appendFileSync(${JSON.stringify(join(dir, "calls.log"))}, process.cwd() + " npm " + process.argv.slice(2).join(" ") + "\\n");
if (${JSON.stringify(mode)} === "npm-fails") process.exit(7);
if (!existsSync("package-lock.json")) process.exit(9);
mkdirSync("node_modules/playwright", { recursive: true });
writeFileSync("node_modules/playwright/package.json", JSON.stringify({ name: "playwright", type: "module", exports: "./index.mjs" }));
writeFileSync("node_modules/playwright/index.mjs", "export const chromium = { fake: true };\\n");
if (${JSON.stringify(mode)} === "no-bin") process.exit(0);
mkdirSync("node_modules/.bin", { recursive: true });
writeFileSync("node_modules/.bin/playwright", "#!/bin/sh\\necho \\"$PWD playwright $*\\" >> ${join(dir, "calls.log")}\\n" + (${JSON.stringify(mode)} === "browser-fails" ? "exit 5\\n" : "exit 0\\n"));
chmodSync("node_modules/.bin/playwright", 0o755);
`,
  );
  chmodSync(npm, 0o755);
  return npm;
}

function setup(mode) {
  const root = mkdtempSync(join(tmpdir(), "run-playwright-test-"));
  const project = join(root, "project");
  const tmpRoot = join(root, "tmp");
  mkdirSync(project);
  mkdirSync(tmpRoot);
  const capture = join(project, "capture.mjs");
  writeFileSync(
    capture,
    `import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".artifacts/t/evidence", { recursive: true });
writeFileSync(".artifacts/t/evidence/out.txt", JSON.stringify({ chromium, args: process.argv.slice(2) }));
process.exit(Number(process.argv[2] ?? 0));
`,
  );
  return { root, project, tmpRoot, capture, npm: fakeNpm(root, mode), log: [] };
}

function go(s, args = []) {
  return runCapture({ script: "capture.mjs", args, cwd: s.project, npm: s.npm, tmpRoot: s.tmpRoot, log: (m) => s.log.push(m) });
}

test("runs the capture with playwright from the temp folder, and the paths point into the project", () => {
  const s = setup();
  try {
    const code = go(s, ["0", "x"]);
    assert.equal(code, 0, s.log.join("\n"));
    const out = JSON.parse(readFileSync(join(s.project, ".artifacts/t/evidence/out.txt"), "utf8"));
    assert.deepEqual(out, { chromium: { fake: true }, args: ["0", "x"] });
    const calls = readFileSync(join(s.root, "calls.log"), "utf8");
    assert.match(calls, /prove-playwright-[^ ]* npm ci --no-audit --no-fund --ignore-scripts/);
    assert.match(calls, /prove-playwright-[^ ]* playwright install chromium/);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("nothing goes into the project: no package.json, lockfile or node_modules", () => {
  const s = setup();
  try {
    assert.equal(go(s), 0);
    assert.deepEqual(readdirSync(s.project).sort(), [".artifacts", "capture.mjs"]);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("the temp folder is deleted after a pass and after a failure", () => {
  for (const mode of ["ok", "npm-fails", "browser-fails", "no-bin"]) {
    const s = setup(mode);
    try {
      go(s);
      assert.deepEqual(readdirSync(s.tmpRoot), [], mode);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  }
});

test("the exit code of the capture script comes through", () => {
  const s = setup();
  try {
    assert.equal(go(s, ["4"]), 4);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a failed install exits 3 and does not run the capture", () => {
  for (const mode of ["npm-fails", "browser-fails", "no-bin"]) {
    const s = setup(mode);
    try {
      assert.equal(go(s), EXIT.INSTALL, mode);
      assert.equal(existsSync(join(s.project, ".artifacts")), false, mode);
      assert.match(s.log.join("\n"), /Fix: /, mode);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  }
});

test("the first log line says what is installed and where, for the report", () => {
  const s = setup();
  try {
    go(s);
    assert.match(s.log[0], new RegExp(`playwright@${pinnedVersion().replace(/\./g, "\\.")} with npm ci in .*prove-playwright-.* \\(deleted at the end\\), and Chromium in .*ms-playwright \\(kept\\)`));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("a missing capture script exits 2 and makes no temp folder", () => {
  const s = setup();
  try {
    const code = runCapture({ script: "nope.mjs", cwd: s.project, npm: s.npm, tmpRoot: s.tmpRoot, log: (m) => s.log.push(m) });
    assert.equal(code, EXIT.USAGE);
    assert.deepEqual(readdirSync(s.tmpRoot), []);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("the pinned version is exact", () => {
  assert.match(pinnedVersion(), /^\d+\.\d+\.\d+$/);
});

test("browserCache follows the Playwright defaults", () => {
  assert.equal(browserCache({ PLAYWRIGHT_BROWSERS_PATH: "/x" }, "linux", "/h"), "/x");
  assert.equal(browserCache({}, "darwin", "/h"), "/h/Library/Caches/ms-playwright");
  assert.equal(browserCache({}, "linux", "/h"), "/h/.cache/ms-playwright");
});

test("cli: no argument exits 2, --dry-run prints the install line and installs nothing", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 2);
  const d = spawnSync(process.execPath, [SCRIPT, "--dry-run", "capture.mjs"], { encoding: "utf8" });
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /installs playwright@\d/);
});
