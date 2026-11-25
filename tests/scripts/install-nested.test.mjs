// The installer copies whole skill folders, with every nested folder: agents/openai.yaml for Codex
// and scripts/ for the checks. A separate file, so that it does not touch install.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { install } from "../../scripts/install.mjs";

const NESTED = {
  "skills/grill/SKILL.md": "grill\n",
  "skills/grill/agents/openai.yaml": 'interface:\n  display_name: "grill"\n',
  "skills/grill/scripts/check.mjs": "// check\n",
};

function dirs() {
  const source = mkdtempSync(join(tmpdir(), "install-nested-src-"));
  for (const [rel, text] of Object.entries(NESTED)) {
    mkdirSync(dirname(join(source, rel)), { recursive: true });
    writeFileSync(join(source, rel), text, { mode: rel.endsWith(".mjs") ? 0o755 : 0o644 });
  }
  const target = mkdtempSync(join(tmpdir(), "install-nested-tgt-"));
  mkdirSync(join(target, ".git"));
  return { source, target };
}

const run = (dryRun) => {
  const { source, target } = dirs();
  const out = [];
  try {
    install({ source, target, dryRun, log: (l) => out.push(l), claudeVersion: () => null });
    return {
      out,
      files: Object.keys(NESTED).map((rel) => {
        const p = join(target, ".claude", rel);
        return { rel, exists: existsSync(p), text: existsSync(p) ? readFileSync(p, "utf8") : null, mode: existsSync(p) ? statSync(p).mode : 0 };
      }),
    };
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
};

test("install copies nested folders of a skill, agents/ and scripts/ included", () => {
  const { files } = run(false);
  for (const f of files) {
    assert.ok(f.exists, `${f.rel} was copied`);
    assert.equal(f.text, NESTED[f.rel]);
  }
  assert.ok(files.find((f) => f.rel.endsWith("check.mjs")).mode & 0o100, "a script keeps its executable bit");
});

test("--dry-run lists the nested files and writes none", () => {
  const { out, files } = run(true);
  assert.ok(out.includes("would copy  .claude/skills/grill/agents/openai.yaml"));
  assert.ok(out.includes("would copy  .claude/skills/grill/scripts/check.mjs"));
  assert.ok(files.every((f) => !f.exists));
});
