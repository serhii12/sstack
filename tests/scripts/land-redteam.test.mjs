// Red team of the merge gate. Each file in fixtures/land/redteam/ is one hostile change to the base
// state that passes. The gate must give the exit code in the file. A wrong verdict fails the test and
// names the attack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decide, reviewEvidence, simulatedGit } from "../../skills/land/scripts/land-check.mjs";
import { FIX, stateWith } from "./fixtures/land/helpers.mjs";

const DIR = join(FIX, "redteam");
const cases = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

test("the red team has at least 40 hostile fixtures", { timeout: 120000 }, () => {
  assert.ok(cases.length >= 40, `only ${cases.length}`);
});

for (const file of cases) {
  const c = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  test(`red team: ${file.replace(/\.json$/, "")}: exit ${c.expect}`, { timeout: 120000 }, () => {
    const state = stateWith(c.patch);
    const review = reviewEvidence(state.review?.text ?? null, state.pr.head.sha, simulatedGit(state.review ?? {}));
    const v = decide(state, { review });
    assert.notEqual(v.exitCode, 0, `WRONG VERDICT (gate passed): ${c.attack}`);
    assert.equal(v.exitCode, c.expect, `${c.attack} Failures: ${JSON.stringify(v.failures.map((f) => f.code))}`);
  });
}
