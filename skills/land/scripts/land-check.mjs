#!/usr/bin/env node
// land-check: the merge check for one pull request, and the pre-push check of the local branch.
//
// Adapted from kcd-skills skills/autopilot/scripts/ship-pr.mjs (MIT, Copyright (c) 2026 Kent C. Dodds):
// a pure decide() over a gathered PR state, a fixed order of gates, one exit code per stop, a state
// that can come from `gh` or from a JSON file, and a person only for high risk. Fixed here: zero checks
// is not green, the agent never picks the risk, a review or approval counts only on the head commit, a
// COMMENTED review is not an approval, checks and people match by exact identity (never by a
// substring), every list is paged, and the merge call pins the head sha and is read back before anyone
// reports it.
//
// The gate exits 0 only when ALL of these hold (exit code of each failure in brackets):
//   [10] the pull request is open           [11] it is not a draft
//   [13] its base is the default branch, and its head is a branch of this repo (not a fork, and not
//        an `evidence/` branch)
//   [12] GitHub says it is mergeable (not conflicting, not behind, not unknown)
//   [22] auto-merge is off (the agent never lets GitHub merge on its own)
//   [14] the config on the default branch has no error, and at least one check exists on the head
//        (or the config says `"allowNoChecks": true`)
//   [17] no check failed. With `requiredChecks` in the config: each named check, where neutral, skipped,
//        cancelled and timed out count as failed. With none: every check run and commit status on the
//        head, where skipped and neutral do not fail
//   [15] every required check has a run on the HEAD commit with the exact name AND the exact app slug
//   [16] no check is still running
//   [18] no reviewer's latest review requests changes (on any commit, bots included)
//   [19] no review thread is unresolved (outdated threads are ignored only if the config says so)
//   [20] the ranges of the peer-review file make one chain with no gap, from the start of the branch
//        to the head commit (or to a commit after which only text files under `.artifacts/` changed),
//        and no finding is open unless its severity is low
//   [28] no acceptance check in the evidence index of the task has the status `fail` (`untested`
//        does not block)
//   [23] no image or video under `.artifacts/` is in the pull request (land-evidence.mjs puts them on
//        the branch `evidence/<task>`)
//   [21] the risk (land-lib.mjs computeRisk, config from the default branch) is low or medium. Or the
//        risk is high and a person approved: a review APPROVED on the head sha, latest for that person,
//        by an account of type User that is not a bot, not the PR author, not the gh user, not the author
//        of a commit of the pull request, not in `notHuman`, and that has write access. Or the caller
//        passed --owner-approved, which skips this gate only
// With --merge, after exit 0 on fresh data:
//   [24] the repo allows the merge method of the config (default squash)
//   [27] with --owner-approved in use: the note on the pull request could not be posted, so no merge
//   [25] the merge call failed (it sends the head sha, so a push after the check makes it fail)
//   [26] the merge is not seen when the pull request is read again (for example a merge queue)
//   then the head branch is deleted. The script never sends --admin and never changes a ruleset.
// Exit 2 usage error. Exit 3 data or gh error. When several gates fail, every failure prints and the
// exit code is the first one in the order above.
//
// Pre-push check of the local branch (`preflight`):
//   [30] HEAD is on main, master, the default branch or an `evidence/` branch   [31] HEAD is detached
//   [32] the branch has no commit that the base lacks     [33] the work tree has changes
//   [34] no base ref found
//
// Usage (from the project root, or the worktree of the task):
//   node .claude/skills/land/scripts/land-check.mjs preflight [--base <ref>]
//   node .claude/skills/land/scripts/land-check.mjs --pr <n> --review <file> [--branch <name>] [--repo owner/name] [--merge] [--owner-approved] [--json]
//   node .claude/skills/land/scripts/land-check.mjs --input <state.json> [--review <file>] [--owner-approved] [--json]
//   node .claude/skills/land/scripts/land-check.mjs close-ticket <ticket file> --pr <n> [--repo owner/name]
// `close-ticket` sets `Status: closed` in a local ticket file, only when GitHub shows the pull request
// as merged [29 if not]. The evidence index is read from `evidence/index.json` beside the review file.
// Every message reads "<what failed>. Fix: <what to do>."

import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FetchError, checksState, cleanText, computeRisk, currentRepo, encodeRef, fetchConfigText, ghFetcher, git, isBot, msg,
  parseConfigText, quoteName, readConfig, restList, reviewThreads, sameLogin, sleepMs,
} from "./land-lib.mjs";

const USAGE = [
  "Usage: node .claude/skills/land/scripts/land-check.mjs preflight [--base <ref>]",
  "       node .claude/skills/land/scripts/land-check.mjs --pr <n> --review <file> [--branch <name>] [--repo owner/name] [--merge] [--owner-approved] [--json]",
  "       node .claude/skills/land/scripts/land-check.mjs --input <state.json> [--review <file>] [--owner-approved] [--json]",
  "       node .claude/skills/land/scripts/land-check.mjs close-ticket <ticket file> --pr <n> [--repo owner/name]",
].join("\n");

export const EXIT = {
  ok: 0, usage: 2, data: 3,
  notOpen: 10, draft: 11, notMergeable: 12, wrongBase: 13, noChecks: 14, checkMissing: 15, checkPending: 16,
  checkFailed: 17, changesRequested: 18, unresolvedThreads: 19, reviewStale: 20, approvalMissing: 21, autoMerge: 22,
  evidenceMedia: 23, mergeMethod: 24, mergeFailed: 25, mergeNotSeen: 26, noteFailed: 27, acceptanceFailed: 28, ticketNotClosed: 29,
  onDefault: 30, detached: 31, noCommits: 32, dirtyTree: 33, noBase: 34,
};

// The order in which gates report. The exit code is the code of the first failure in this list.
const ORDER = [10, 11, 13, 12, 22, 14, 17, 15, 16, 18, 19, 20, 28, 23, 21];
const WRITE_ASSOCIATION = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const WRITE_PERMISSION = new Set(["admin", "maintain", "write"]);
const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|svg|mp4|mov|webm|mkv|avi|m4v)$/i;
const FULL_SHA = /^[0-9a-f]{40}$/;
// Text files under `.artifacts/` are committed on the task branch on purpose: the review file, the
// ticket copy and the evidence index. They can change after the reviewed commit. A script cannot.
const ARTIFACT_TEXT = /^\.artifacts\/.+\.(md|json|txt)$/;
export const EVIDENCE_PREFIX = "evidence/";
export const REVIEW_MAX_BYTES = 1024 * 1024;
export const OWNER_NOTE = (risk) => `Merged on the word of the repo owner in the session. Risk: ${risk.level}, rule ${risk.rule}.`;

export class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Gather the state with gh
// ---------------------------------------------------------------------------

function readPr(fetcher, repo, number) {
  const pr = fetcher({ api: `repos/${repo}/pulls/${number}` });
  if (!pr || typeof pr !== "object" || !FULL_SHA.test(String(pr.head?.sha ?? ""))) throw new FetchError(msg(`GitHub sent no pull request #${number}`, "check the number with gh pr list"));
  return pr;
}

/** Read everything the gate needs about one pull request. Every list is paged. */
export function gather(fetcher, { repo, number }) {
  const repoInfo = fetcher({ api: `repos/${repo}` });
  if (!repoInfo || typeof repoInfo !== "object" || typeof repoInfo.default_branch !== "string" || repoInfo.default_branch === "") throw new FetchError(msg(`GitHub sent no repo data for ${repo}`, "check gh auth status and the repo name"));
  const viewer = fetcher({ api: "user" });
  const pr = readPr(fetcher, repo, number);
  const head = pr.head.sha;
  const files = restList(fetcher, `repos/${repo}/pulls/${number}/files`);
  const checkRuns = restList(fetcher, `repos/${repo}/commits/${head}/check-runs`, { key: "check_runs" });
  const statuses = restList(fetcher, `repos/${repo}/commits/${head}/status`, { key: "statuses" });
  const reviews = restList(fetcher, `repos/${repo}/pulls/${number}/reviews`);
  const commits = restList(fetcher, `repos/${repo}/pulls/${number}/commits`);
  const [owner, name] = repo.split("/");
  const threads = reviewThreads(fetcher, owner, name, Number(number));
  const configText = fetchConfigText(fetcher, repo, repoInfo.default_branch);
  // The real access of each person who approved. The association on a review does not show it:
  // a collaborator with read access is also a COLLABORATOR.
  const permissions = {};
  for (const r of latestDecisive(reviews)) {
    const login = r.user?.login;
    if (r.state !== "APPROVED" || typeof login !== "string" || login === "") continue;
    try {
      const p = fetcher({ api: `repos/${repo}/collaborators/${encodeURIComponent(login)}/permission` });
      permissions[login.toLowerCase()] = String(p?.role_name ?? p?.permission ?? "none");
    } catch (e) {
      if (!(e instanceof FetchError) || e.status !== 404) throw e;
      permissions[login.toLowerCase()] = "none";
    }
  }
  // A push while the lists were read gives lists of two heads. Read the pull request again to see it.
  const again = readPr(fetcher, repo, number);
  if (again.head.sha !== head) throw new FetchError(msg(`the head of pull request #${number} changed while the check read it`, "wait for the checks on the new head, then run this check again"));
  return { repo: repoInfo, viewer, pr, files, checkRuns, statuses, reviews, commits, threads, configText, permissions };
}

// ---------------------------------------------------------------------------
// The peer-review file
// ---------------------------------------------------------------------------

const STATUS_CLOSED = [/^fixed\.?$/i, /^won['’]t fix:\s*\S/i];

/**
 * Parse a findings file of peer-review: the reviewed ranges, the mode and the findings.
 * The file holds one `Range:` line for each review: the first review, then one for each follow-up
 * review that `build` appends. Each line reads `Range: <ref> (merge base <sha>) to <sha>`.
 * A finding is closed only with one `Status:` line that reads `fixed` or `won't fix: <reason>`. Every
 * other finding is open. An open finding blocks unless its one `Severity:` line reads `low`. When two
 * blocks have the same id, the later block decides, so a follow-up review can mark a finding fixed.
 */
export function parseReview(text) {
  const rangeLines = text.match(/^Range:.*$/gm) ?? [];
  const ranges = rangeLines.map((line) => ({
    start: /\(merge base\s+([0-9a-fA-F]{7,40})\)/.exec(line)?.[1]?.toLowerCase() ?? null,
    end: /\bto\s+([0-9a-fA-F]{7,40})\b/.exec(line)?.[1]?.toLowerCase() ?? null,
  }));
  const mode = /^Mode:[ \t]*(.+)$/m.exec(text)?.[1]?.trim() ?? "unknown";
  const byId = new Map();
  const blocks = text.split(/^#{3,6}[ \t]+/m).slice(1);
  for (const b of blocks) {
    const id = b.split("\n")[0].trim();
    const statuses = [...b.matchAll(/^Status:[ \t]*(.*)$/gm)].map((m) => m[1].trim());
    const severities = [...b.matchAll(/^Severity:[ \t]*(.*)$/gm)].map((m) => m[1].trim().toLowerCase());
    const closed = statuses.length === 1 && STATUS_CLOSED.some((re) => re.test(statuses[0]));
    const severity = severities.length === 1 && ["low", "medium", "high"].includes(severities[0]) ? severities[0] : "unknown";
    // A later block that only sets the status keeps the severity of the first block.
    const before = byId.get(id);
    byId.delete(id);
    byId.set(id, { id, status: statuses[0] ?? "", severity: severity === "unknown" && before && severities.length === 0 ? before.severity : severity, open: !closed });
  }
  const saysNone = /^no findings\.?[ \t]*$/im.test(text);
  const last = ranges[ranges.length - 1];
  return { ranges, reviewed: last?.end ?? null, mergeBase: ranges[0]?.start ?? null, rangeLines: rangeLines.length, mode, findings: [...byId.values()], saysNone };
}

/** Two shas name one commit: equal, or one is a prefix of the other with 7 digits or more. */
const sameCommit = (a, b) => typeof a === "string" && typeof b === "string" && Math.min(a.length, b.length) >= 7 && (a.startsWith(b) || b.startsWith(a));

/**
 * Decide if the review still covers the head. `repoGit` answers with local git: expand(sha),
 * isAncestor(a, b), changedPaths(a, b) and countCommits(a, b).
 * The ranges of the file must make one chain with no gap: each range starts at the commit where the
 * range before it ends. The chain must start at or before the first commit of the pull request
 * (`prCommits` is the number of its commits, `prShas` their shas). It must end at the head, or at an
 * ancestor of the head after which only text files under `.artifacts/` changed.
 */
export function reviewEvidence(text, headSha, repoGit, { prCommits = null, prShas = null } = {}) {
  if (text === null || text === undefined) return { state: "missing" };
  if (text.length > REVIEW_MAX_BYTES) return { state: "too-large" };
  const r = parseReview(text);
  const blocking = r.findings.filter((f) => f.open && f.severity !== "low");
  const openLow = r.findings.filter((f) => f.open && f.severity === "low");
  const base = { mode: r.mode, findings: r.findings.length, blocking: blocking.map((f) => f.id), openLow: openLow.map((f) => f.id), reviewed: r.reviewed, ranges: r.ranges.length };
  if (r.ranges.length === 0 || r.ranges.some((x) => !x.start || !x.end)) return { ...base, state: "no-range" };
  if (r.findings.length === 0 && !r.saysNone) return { ...base, state: "no-result" };
  // The chain: every commit of the file must exist, each range must run forward, and no gap.
  const full = (sha) => (headSha.startsWith(sha) && sha.length >= 7 ? headSha : repoGit?.expand(sha) ?? null);
  const chain = [];
  for (const x of r.ranges) {
    const start = full(x.start);
    const end = full(x.end);
    if (!start) return { ...base, state: "unknown-commit", reviewed: x.start };
    if (!end) return { ...base, state: "unknown-commit", reviewed: x.end };
    const prev = chain[chain.length - 1];
    if (prev && !sameCommit(prev.end, start)) return { ...base, state: "gap", gapAfter: prev.end, gapBefore: start };
    if (repoGit.countCommits(start, end) === null) return { ...base, state: "gap", gapAfter: start, gapBefore: end };
    chain.push({ start, end });
  }
  const last = chain[chain.length - 1].end;
  if (last !== headSha) {
    if (!repoGit?.isAncestor(last, headSha)) return { ...base, state: "not-ancestor" };
    const changed = repoGit.changedPaths(last, headSha);
    if (changed === null) return { ...base, state: "unknown-commit" };
    const code = changed.filter((p) => !ARTIFACT_TEXT.test(p));
    if (code.length) return { ...base, state: "stale", changedAfter: code };
  }
  // Count from the start of the chain to the head. The commits after the last reviewed commit hold
  // only text files under `.artifacts/` (checked above), so the chain covers the branch when its start
  // is at or before the first commit of the pull request.
  const covered = repoGit.countCommits(chain[0].start, headSha);
  if (covered === null || (Number.isInteger(prCommits) && covered < prCommits)) return { ...base, state: "partial", covered, prCommits };
  // The count above also holds commits that a merge of the default branch brought in. So a chain that
  // starts at a commit of the pull request can reach the count and still leave earlier commits out.
  if (Array.isArray(prShas) && prShas.some((s) => sameCommit(String(s ?? "").toLowerCase(), chain[0].start))) return { ...base, state: "partial", startsInPr: chain[0].start };
  if (blocking.length) return { ...base, state: "open-findings" };
  return { ...base, state: "fresh" };
}

/**
 * Read the results of the acceptance checks from the evidence index text of `prove`. Returns
 * { pass, fail, untested } with the check texts of `fail` and `untested`, or null when there is no
 * index or it cannot be read. A missing index does not block: then every check counts as untested.
 */
export function acceptanceResults(text) {
  if (typeof text !== "string") return null;
  let index;
  try {
    index = JSON.parse(text);
  } catch {
    return null;
  }
  if (!index || typeof index !== "object" || !Array.isArray(index.checks)) return null;
  const out = { pass: 0, fail: [], untested: [] };
  for (const c of index.checks) {
    const name = String(c?.check ?? "(no text)");
    if (c?.status === "pass") out.pass++;
    else if (c?.status === "fail") out.fail.push(name);
    else out.untested.push(name);
  }
  return out;
}

/**
 * Close a local ticket after a merge: set its `Status:` line to `closed` and add one line under
 * `## Comments`. Returns the new text, or null when the text has no `Status:` line.
 */
export function closeTicketText(text, { pr, sha }) {
  const re = /^(\s*(?:[-*]\s+)?\**Status:\**[ \t]*)(.*)$/im;
  if (!re.test(text)) return null;
  let out = text.replace(re, (_, head) => `${head}closed`);
  const line = `Merged in pull request #${pr} as ${sha.slice(0, 12)}.`;
  if (out.includes(line)) return out;
  if (!/^## Comments[ \t]*$/m.test(out)) out = `${out.replace(/\s*$/, "")}\n\n## Comments\n`;
  return `${out.replace(/\s*$/, "")}\n${line}\n`;
}

/** Local git answers for reviewEvidence. */
export function localGit(dir = ".") {
  return {
    expand(sha) {
      const r = git(dir, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]);
      return r.ok ? r.out.trim() : null;
    },
    isAncestor(a, b) {
      return git(dir, ["merge-base", "--is-ancestor", a, b]).status === 0;
    },
    changedPaths(a, b) {
      const r = git(dir, ["diff", "--name-only", "-z", "--no-renames", a, b, "--"]);
      return r.ok ? r.out.split("\0").filter(Boolean) : null;
    },
    countCommits(a, b) {
      if (git(dir, ["merge-base", "--is-ancestor", a, b]).status !== 0) return null;
      const r = git(dir, ["rev-list", "--count", `${a}..${b}`]);
      return r.ok ? Number(r.out.trim()) : null;
    },
  };
}

/** A fake git for a state file: { known, expand, ancestor, changedSinceReview, coversBranch }. */
export function simulatedGit(sim = {}) {
  return {
    expand: (sha) => (sim.expand?.[sha] ?? (/^[0-9a-f]{7,40}$/.test(sha) && sim.known !== false ? sha : null)),
    isAncestor: () => sim.ancestor === true,
    changedPaths: () => sim.changedSinceReview ?? [],
    countCommits: (a, b) => ((sim.notForward ?? []).some(([x, y]) => x === a && y === b) ? null : sim.coversBranch === false ? 0 : Number.MAX_SAFE_INTEGER),
  };
}

// ---------------------------------------------------------------------------
// The states, as tables
// ---------------------------------------------------------------------------

const ids = (list) => (list ?? []).slice(0, 20).map((id) => quoteName(id, 40)).join(", ");
const REVIEW_AGAIN = "load peer-review on the head commit, commit the review file, push, and wait again";

/**
 * Every state that reviewEvidence() can return. Only `fresh` lets the gate pass. Each other row
 * holds the message and the fix for exit 20. A state that is not in this table blocks as `unknown`.
 */
export const REVIEW_STATES = {
  fresh: { blocks: false },
  missing: { blocks: true, what: () => "no peer-review file was given or found", fix: REVIEW_AGAIN },
  "too-large": { blocks: true, what: () => "the review file is larger than 1 MB", fix: REVIEW_AGAIN },
  "no-range": { blocks: true, what: () => "the review file has no Range line, or a Range line with no merge base or no end commit", fix: REVIEW_AGAIN },
  gap: { blocks: true, what: (rv) => `the review ranges do not make one chain: a range ends at ${quoteName(String(rv.gapAfter ?? "").slice(0, 12))} and the next one starts at ${quoteName(String(rv.gapBefore ?? "").slice(0, 12))}`, fix: "run one follow-up review that starts where the last review ended, add it to the review file, commit, push, and wait again" },
  "no-result": { blocks: true, what: () => 'the review file has no finding and no "No findings." line', fix: REVIEW_AGAIN },
  "unknown-commit": { blocks: true, what: (rv) => `the commit ${quoteName(rv.reviewed ?? "")} of the review file is not in the local repo`, fix: REVIEW_AGAIN },
  "not-ancestor": { blocks: true, what: (rv) => `the reviewed commit ${quoteName(rv.reviewed ?? "")} is not in the history of the head`, fix: REVIEW_AGAIN },
  stale: { blocks: true, what: (rv) => `the review is stale: ${(rv.changedAfter ?? []).length} file(s) changed after the reviewed commit ${quoteName(rv.reviewed ?? "")}`, fix: REVIEW_AGAIN },
  partial: { blocks: true, what: (rv) => (rv.startsInPr ? `the first review range starts at a commit of the pull request (${quoteName(String(rv.startsInPr).slice(0, 12))}), so the commits before it have no review` : `the review range does not cover every commit of the pull request (${Number(rv.covered)} of ${Number(rv.prCommits)})`), fix: "load peer-review with the default branch as the base, and let it write a new review file in place of the old one. Commit it, push, and wait again" },
  "open-findings": { blocks: true, what: (rv) => `the review has open findings that are not of severity low: ${ids(rv.blocking)}`, fix: "fix each finding and set its status to fixed, or stop and ask a person" },
  unknown: { blocks: true, what: () => "the review state is not known", fix: REVIEW_AGAIN },
};

/** The states of a finding. `open` is the start, and each other value closes the finding. */
export const FINDING_STATES = { open: ["fixed", "won't fix: <reason>"], fixed: [], "won't fix: <reason>": [] };

/**
 * The state of one run of the gate, from its exit code. The skill reads this, never the text.
 *   pass          every gate passed and nothing was merged (no --merge)
 *   merged        GitHub shows the merge
 *   needs-person  only a person can go on: approval (21), changes requested (18), threads (19)
 *   wait          the checks are not done (15, 16)
 *   fix           the agent can act: conflicts or behind (12), a failed check (17), a stale review (20),
 *                 media in the branch (23), a failed acceptance check (28)
 *   stopped       every other code. Report it and stop
 */
export const GATE_STATES = ["pass", "merged", "needs-person", "wait", "fix", "stopped"];
const STATE_OF_EXIT = { 21: "needs-person", 18: "needs-person", 19: "needs-person", 15: "wait", 16: "wait", 12: "fix", 17: "fix", 20: "fix", 23: "fix", 28: "fix" };
export function gateState(exitCode, merged = false) {
  if (exitCode === 0) return merged ? "merged" : "pass";
  return STATE_OF_EXIT[exitCode] ?? "stopped";
}

/** The steps of a merge, in order. mergeNow() stops at the first one that fails and names it as `phase`. */
export const MERGE_PHASES = ["method-allowed", "owner-note-posted", "merge-sent", "merge-seen", "branch-deleted"];

// ---------------------------------------------------------------------------
// Decide
// ---------------------------------------------------------------------------

/** The changed paths of the PR: new names and old names of renames. */
export function prPaths(files) {
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    if (typeof f?.filename === "string") out.push(f.filename);
    if (typeof f?.previous_filename === "string") out.push(f.previous_filename);
  }
  return out;
}

/**
 * The latest decisive review (APPROVED, CHANGES_REQUESTED or DISMISSED) of each person. The key is
 * the login without regard to case. A review of a deleted account has no user, and it keeps its own key.
 */
export function latestDecisive(reviews) {
  const by = new Map();
  for (const r of Array.isArray(reviews) ? reviews : []) {
    if (!r || typeof r !== "object" || !["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) continue;
    const login = typeof r.user?.login === "string" && r.user.login !== "" ? r.user.login.toLowerCase() : null;
    const key = login ?? `\u0000no-user:${r.id}`;
    const prev = by.get(key);
    const t = (x) => [Date.parse(x.submitted_at ?? "") || 0, Number(x.id) || 0];
    if (!prev || t(r)[0] > t(prev)[0] || (t(r)[0] === t(prev)[0] && t(r)[1] > t(prev)[1])) by.set(key, r);
  }
  return [...by.values()];
}

/** The accounts that wrote the commits of the pull request: authors, committers and co-authors. */
export function commitAccounts(commits) {
  const logins = new Set();
  const ids = new Set();
  for (const c of Array.isArray(commits) ? commits : []) {
    for (const who of [c?.author, c?.committer]) {
      if (typeof who?.login === "string") logins.add(who.login.toLowerCase());
      if (who?.id !== undefined && who?.id !== null) ids.add(who.id);
    }
    for (const m of String(c?.commit?.message ?? "").matchAll(/^co-authored-by:.*<(?:(\d+)\+)?([^@<>\s]+)@users\.noreply\.github\.com>/gim)) {
      if (m[1]) ids.add(Number(m[1]));
      logins.add(m[2].toLowerCase());
    }
  }
  return { logins, ids };
}

/** Human approvals that count for this head. See the header for the rules. */
export function humanApprovals(state, config) {
  const { pr, viewer, reviews } = state;
  const head = pr.head.sha;
  // Without a known author, a known gh user and the full list of commits, the "not the author" rules
  // cannot run, so no approval counts.
  if (typeof pr.user?.login !== "string" || pr.user.login === "") return [];
  if (typeof viewer?.login !== "string" || viewer.login === "") return [];
  if (!Array.isArray(state.commits) || (Number.isInteger(pr.commits) && state.commits.length < pr.commits)) return [];
  const writers = commitAccounts(state.commits);
  const sameId = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && a === b;
  return latestDecisive(reviews).filter((r) => {
    if (r.state !== "APPROVED") return false;
    if (r.commit_id !== head) return false;
    if (isBot(r.user)) return false;
    const login = r.user.login;
    if (typeof login !== "string" || login === "") return false;
    if (sameLogin(login, pr.user.login) || sameId(r.user.id, pr.user.id)) return false;
    if (sameLogin(login, viewer.login) || sameId(r.user.id, viewer.id)) return false;
    if (writers.logins.has(login.toLowerCase()) || writers.ids.has(r.user.id)) return false;
    if (config.notHuman.some((n) => sameLogin(n, login))) return false;
    if (!WRITE_ASSOCIATION.has(r.author_association)) return false;
    return WRITE_PERMISSION.has(state.permissions?.[login.toLowerCase()]);
  });
}

/**
 * The gate. `state` is the gathered state. `review` is the result of reviewEvidence. `branch` is the
 * local branch name when known. `ownerApproved` skips the approval gate only. Returns the exit code,
 * every failure, the risk and the approvals.
 */
export function decide(state, { review = { state: "missing" }, branch = null, ownerApproved = false, acceptance = null } = {}) {
  const fails = [];
  const fail = (code, what, fix) => fails.push({ code, message: msg(what, fix) });
  const { pr, repo } = state;
  // The config comes from the default branch: as text (from gh) or as an object (from a state file).
  const cfg = state.configText !== undefined ? parseConfigText(state.configText) : readConfig(state.config ?? null);
  const config = cfg.config;
  const head = pr.head.sha;
  const n = Number(pr.number);
  const def = quoteName(repo.default_branch ?? "");

  // 10, 11: open, not a draft.
  if (pr.merged) fail(EXIT.notOpen, `pull request #${n} is already merged`, "do not merge again. Report the merge commit that GitHub shows");
  else if (pr.state !== "open") fail(EXIT.notOpen, `pull request #${n} is ${quoteName(pr.state ?? "unknown")}`, "stop. Ask a person if it must open again");
  if (pr.draft) fail(EXIT.draft, `pull request #${n} is a draft`, `run gh pr ready ${n} only if the ticket is done, then run this check again`);
  // 13: base is the default branch, head is in this repo, on the expected branch, and no evidence branch.
  if (typeof repo.default_branch !== "string" || pr.base?.ref !== repo.default_branch) fail(EXIT.wrongBase, `the base is ${quoteName(pr.base?.ref ?? "")}, not the default branch ${def}`, `change the base to the default branch, or ask a person`);
  if (!pr.head?.repo?.full_name || !repo.full_name) fail(EXIT.wrongBase, `GitHub does not name the repo of the head branch of #${n} (a deleted fork gives this)`, "land only a branch of this repo. Ask a person");
  else if (pr.head.repo.full_name !== repo.full_name) fail(EXIT.wrongBase, `the head branch is in the fork ${quoteName(pr.head.repo.full_name)}`, "land only a branch of this repo. Ask a person to handle a fork");
  if (branch && pr.head?.ref !== branch) fail(EXIT.wrongBase, `pull request #${n} is for branch ${quoteName(pr.head?.ref ?? "")}, not ${quoteName(branch)}`, "pass the number of the pull request for this branch");
  if (String(pr.head?.ref ?? "").startsWith(EVIDENCE_PREFIX)) fail(EXIT.wrongBase, `the head ${quoteName(pr.head.ref)} is an evidence branch`, "never merge an evidence branch. Close this pull request and land the task branch");
  // 12: mergeable. GitHub gives no answer for a pull request that is not open, so the check runs only for an open one.
  if (pr.merged || pr.state !== "open") {
    // Exit 10 covers it.
  } else if (pr.mergeable === false || pr.mergeable_state === "dirty") fail(EXIT.notMergeable, `pull request #${n} has merge conflicts`, "merge the default branch into the task branch (git fetch origin, git merge origin/<default branch>), resolve the conflicts, run the tests, commit, push with a plain git push, and wait again. Do not rebase");
  else if (pr.mergeable_state === "behind") fail(EXIT.notMergeable, `pull request #${n} is behind the default branch`, "merge the default branch into the task branch (git fetch origin, git merge origin/<default branch>), run the tests, push with a plain git push, and wait again. Do not rebase");
  else if (pr.mergeable !== true) fail(EXIT.notMergeable, `GitHub does not know yet if pull request #${n} can merge`, "wait one minute and run this check again");
  // 22: auto-merge off.
  if (pr.auto_merge) fail(EXIT.autoMerge, `auto-merge is on for pull request #${n}`, `run gh pr merge ${n} --disable-auto, then tell a person who turned it on`);
  // 14 to 17: the config and the checks.
  if (cfg.errors.length) fail(EXIT.noChecks, `the config .stack/risk.json on the default branch has errors (${cfg.errors.join(", ")})`, "a person fixes the file on the default branch. REFERENCE.md has a starter file");
  const checks = checksState({ required: config.requiredChecks, allowNoChecks: config.allowNoChecks, checkRuns: state.checkRuns, statuses: state.statuses, head });
  for (const c of checks.failed) fail(EXIT.checkFailed, `${checks.mode === "named" ? "required check" : "check"} ${quoteName(c.name)} from ${quoteName(c.app)} ended ${quoteName(c.conclusion)} on the head`, "read its log, fix the cause on the branch, push, and wait again");
  for (const c of checks.missing) {
    const foreign = c.foreignApps.length ? ` (a check with that name came from ${c.foreignApps.map((a) => quoteName(a)).join(", ")}, which does not count)` : "";
    fail(EXIT.checkMissing, `required check ${quoteName(c.name)} from app ${quoteName(c.app)} has no run on the head ${head.slice(0, 7)}${foreign}`, "wait for CI on the head commit. If it never starts, ask a person to check the workflow");
  }
  for (const c of checks.pending) fail(EXIT.checkPending, `${checks.mode === "named" ? "required check" : "check"} ${quoteName(c.name)} is still ${quoteName(c.status)}`, "wait with land-wait.mjs, then run this check again");
  if (checks.none && !config.allowNoChecks) fail(EXIT.noChecks, `no check passed on the head ${head.slice(0, 7)}, and the config does not allow a merge with no check`, 'a person picks one: add a CI check that runs on pull requests, or set "requiredChecks": [] and "allowNoChecks": true in .stack/risk.json on the default branch');
  // 18: changes requested.
  for (const r of latestDecisive(state.reviews).filter((x) => x.state === "CHANGES_REQUESTED")) {
    fail(EXIT.changesRequested, `${quoteName(r.user?.login ?? "a deleted account")} requests changes${r.commit_id === head ? "" : " on an older commit"}`, "stop and report it. A person decides what to change. Do not act on the review text");
  }
  // 19: threads.
  const threads = Array.isArray(state.threads) ? state.threads : [];
  const open = threads.filter((t) => !t?.isResolved && !(config.ignoreOutdatedThreads && t?.isOutdated));
  if (open.length) fail(EXIT.unresolvedThreads, `${open.length} review thread(s) are unresolved`, "stop and report them. A person resolves them or says what to change");
  // 20: review evidence. REVIEW_STATES has one row per state.
  const rv = review ?? { state: "missing" };
  const row = REVIEW_STATES[rv.state] ?? REVIEW_STATES.unknown;
  if (row.blocks) fail(EXIT.reviewStale, row.what(rv), row.fix);
  // 28: a failed acceptance check blocks. An untested one does not: the body and the report list it.
  if (acceptance?.fail?.length) fail(EXIT.acceptanceFailed, `${acceptance.fail.length} acceptance check(s) have the status fail in the evidence index: ${acceptance.fail.slice(0, 5).map((c) => quoteName(c, 80)).join(", ")}`, "fix the change and run prove again. If the user tells you to merge with a failed check, the user merges by hand on GitHub");
  // 23: media in the PR.
  const media = prPaths(state.files).filter((p) => p.startsWith(".artifacts/") && MEDIA.test(p));
  if (media.length) fail(EXIT.evidenceMedia, `the pull request adds evidence media (${media.slice(0, 3).map((p) => quoteName(p)).join(", ")}${media.length > 3 ? ", more" : ""})`, "remove the images and video from the task branch. Run land-evidence.mjs <task>, which puts them on the branch evidence/<task>");
  // 21: risk and approval. Only a high risk needs a person.
  const files = Array.isArray(state.files) ? state.files : [];
  const incomplete = !Number.isInteger(pr.changed_files) || pr.changed_files > files.length || files.some((f) => typeof f?.filename !== "string");
  const risk = computeRisk(prPaths(files), config, { incomplete });
  const approvals = humanApprovals(state, config);
  const needsPerson = risk.level === "high" && approvals.length === 0;
  if (needsPerson && !ownerApproved) {
    fail(EXIT.approvalMissing, `the risk is high (rule ${risk.rule}${risk.path ? ` on ${quoteName(risk.path)}` : ""}) and no person approved the head commit ${head.slice(0, 7)}`, "stop with the pull request open and report the risk. A person other than the author approves it on GitHub, or the user says in this session to merge it");
  }
  fails.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
  return {
    exitCode: fails.length ? fails[0].code : EXIT.ok,
    pr: n, head, risk: { level: risk.level, rule: risk.rule, path: risk.path },
    approvedBy: approvals.map((a) => a.user.login), ownerApprovalUsed: needsPerson && ownerApproved === true,
    review: rv, acceptance: acceptance ? { pass: acceptance.pass, fail: acceptance.fail.length, untested: acceptance.untested.length } : null,
    failures: fails, mergeMethod: config.mergeMethod, checksMode: checks.mode, noChecks: checks.none,
    configFound: cfg.found, configErrors: cfg.errors,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

const firstPart = (e) => cleanText(String(e?.message ?? e).split(". Fix:")[0], 300).replace(/\s+/g, " ");

/** Merge after a passing gate on fresh data, then read the PR again. Never sends --admin. */
export function mergeNow(fetcher, state, verdict) {
  const { repo, pr } = state;
  const method = verdict.mergeMethod;
  const n = Number(pr.number);
  const allowed = { squash: repo.allow_squash_merge, merge: repo.allow_merge_commit, rebase: repo.allow_rebase_merge }[method];
  if (allowed === false) return { code: EXIT.mergeMethod, phase: "method-allowed", message: msg(`the repo does not allow ${method} merges`, "a person sets mergeMethod in .stack/risk.json to a method that the repo allows") };
  let notePosted = false;
  if (verdict.ownerApprovalUsed) {
    // The note goes up before the merge, so the pull request shows why no review approved it.
    try {
      const c = fetcher({ api: `repos/${repo.full_name}/issues/${n}/comments`, method: "POST", fields: { body: OWNER_NOTE(verdict.risk) } });
      if (!c || typeof c !== "object" || !c.id) throw new FetchError("GitHub sent no comment id");
      notePosted = true;
    } catch (e) {
      return { code: EXIT.noteFailed, phase: "owner-note-posted", message: msg(`the note about the owner approval could not be posted on #${n} (${firstPart(e)})`, "do not merge another way. Check gh auth status, then run this check again") };
    }
  }
  try {
    fetcher({ api: `repos/${repo.full_name}/pulls/${n}/merge`, method: "PUT", fields: { merge_method: method, sha: pr.head.sha } });
  } catch (e) {
    return { code: EXIT.mergeFailed, phase: "merge-sent", notePosted, message: msg(`GitHub refused the merge of #${n} (${firstPart(e)})`, "do not try another way. Run this check again and report what it says") };
  }
  let after;
  try {
    after = fetcher({ api: `repos/${repo.full_name}/pulls/${n}` });
  } catch {
    after = null;
  }
  if (after?.merged !== true) return { code: EXIT.mergeNotSeen, phase: "merge-seen", notePosted, message: msg(`the merge of #${n} is not visible on GitHub yet`, "do not report a merge. Report that the pull request is open, or in a merge queue") };
  // Delete the head branch. Never the default branch, and never an evidence branch.
  const ref = String(pr.head.ref ?? "");
  let deleted = false;
  if (ref !== "" && ref !== repo.default_branch && !ref.startsWith(EVIDENCE_PREFIX)) {
    try {
      fetcher({ api: `repos/${repo.full_name}/git/refs/heads/${encodeRef(ref)}`, method: "DELETE" });
      deleted = true;
    } catch {
      // GitHub can delete the branch itself at the merge. Then the ref is gone, and the read gives 404.
      try {
        fetcher({ api: `repos/${repo.full_name}/git/ref/heads/${encodeRef(ref)}` });
      } catch (e) {
        deleted = e instanceof FetchError && e.status === 404;
      }
    }
  }
  const sha = String(after.merge_commit_sha ?? "");
  return { code: EXIT.ok, phase: deleted ? "branch-deleted" : "merge-seen", mergeCommit: FULL_SHA.test(sha) ? sha : null, branchDeleted: deleted, notePosted };
}

// ---------------------------------------------------------------------------
// Preflight of the local branch
// ---------------------------------------------------------------------------

/** Check the local branch before a push. Returns { code, message, branch, base, ahead }. */
export function preflight(dir = ".", baseArg) {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { code: EXIT.usage, message: msg(`not a git repository: ${resolve(dir)}`, "run the script in the worktree of the task") };
  const root = top.out.trim();
  const br = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!br.ok) return { code: EXIT.detached, message: msg("HEAD is detached", "switch to the task branch that /build made") };
  const branch = br.out.trim();
  let base = baseArg;
  if (!base) {
    const sym = git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (sym.ok && sym.out.trim()) base = sym.out.trim();
    else base = ["origin/main", "origin/master"].find((c) => git(root, ["rev-parse", "--verify", "--quiet", `${c}^{commit}`]).ok);
  }
  if (!base || !git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).ok) return { code: EXIT.noBase, message: msg("no base ref found (tried origin/HEAD, origin/main and origin/master)", "run git fetch origin, or pass --base <default branch ref>"), branch };
  const defaultName = base.replace(/^origin\//, "");
  if (["main", "master", defaultName].includes(branch)) return { code: EXIT.onDefault, message: msg(`the current branch is ${branch}`, "land only a task branch. Type /build to make one"), branch, base };
  if (branch.startsWith(EVIDENCE_PREFIX)) return { code: EXIT.onDefault, message: msg(`the current branch ${quoteName(branch)} is an evidence branch`, "land only a task branch. An evidence branch never merges"), branch, base };
  const ahead = git(root, ["rev-list", "--count", `${base}..HEAD`]);
  const count = ahead.ok ? Number(ahead.out.trim()) : 0;
  if (count === 0) return { code: EXIT.noCommits, message: msg(`branch ${branch} has no commit that ${base} lacks`, "commit the work of the ticket first. Type /build to do it"), branch, base };
  // Evidence of `prove` stays local and is never committed to the task branch. So files under
  // `.artifacts/<task>/evidence/` that git does not track do not count as changes.
  const st = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const dirty = st.out.split("\0").filter((l) => l !== "" && !/^\?\? \.artifacts\/[^/]+\/evidence\//.test(l));
  if (!st.ok || dirty.length > 0) return { code: EXIT.dirtyTree, message: msg(`the work tree of ${branch} has changes that are not committed`, "commit or remove them, then run this check again. Do not use git stash"), branch, base };
  return { code: EXIT.ok, message: `Branch ${branch} is ready to push: ${count} commit(s) ahead of ${base}, clean work tree.`, branch, base, ahead: count };
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { merge: false, json: false, ownerApproved: false };
  if (argv[0] === "preflight") {
    o.cmd = "preflight";
    argv = argv.slice(1);
  } else if (argv[0] === "close-ticket") {
    o.cmd = "close-ticket";
    o.ticket = argv[1];
    argv = argv.slice(2);
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(msg(`${a} needs a value`, "see the usage lines"));
      return v;
    };
    if (a === "--pr") o.pr = val();
    else if (a === "--repo") o.repo = val();
    else if (a === "--review") o.review = val();
    else if (a === "--branch") o.branch = val();
    else if (a === "--input") o.input = val();
    else if (a === "--base") o.base = val();
    else if (a === "--merge") o.merge = true;
    else if (a === "--owner-approved") o.ownerApproved = true;
    else if (a === "--json") o.json = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new UsageError(msg(`unknown argument ${quoteName(a)}`, "use only the arguments in the usage lines. There is no --admin and no --risk"));
  }
  if (o.help || o.cmd === "preflight") return o;
  if (o.cmd === "close-ticket") {
    if (!o.ticket || o.ticket.startsWith("--") || !o.pr || !/^[1-9]\d*$/.test(o.pr)) throw new UsageError(msg("close-ticket needs a ticket file and --pr <n>", "see the usage lines"));
    return o;
  }
  if (!o.pr === !o.input) throw new UsageError(msg("pass exactly one of --pr and --input", "see the usage lines"));
  if (o.pr && !/^[1-9]\d*$/.test(o.pr)) throw new UsageError(msg(`--pr ${quoteName(o.pr)} is not a pull request number`, "pass the number, for example --pr 42"));
  if (o.repo && !/^[\w.-]+\/[\w.-]+$/.test(o.repo)) throw new UsageError(msg(`--repo ${quoteName(o.repo)} is not owner/name`, "pass owner/name"));
  if (o.input && o.merge) throw new UsageError(msg("--merge cannot use --input", "merge only with --pr, so the gate reads fresh data from GitHub"));
  if (o.merge && !o.review) throw new UsageError(msg("--merge needs --review", "pass the peer-review file of the task"));
  return o;
}

/** The shas of the commits of the pull request, as GitHub lists them. */
const prShas = (state) => (Array.isArray(state.commits) ? state.commits.map((c) => c?.sha).filter((x) => typeof x === "string") : null);

function readSmall(path) {
  try {
    return statSync(path).size > 4 * REVIEW_MAX_BYTES ? null : readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readReviewText(path) {
  try {
    if (statSync(path).size > REVIEW_MAX_BYTES) return "x".repeat(REVIEW_MAX_BYTES + 1);
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function main(argv, { fetcher = ghFetcher(), out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n"), cwd = ".", sleep = sleepMs, repoGit = null } = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`land-check: ${e.message}`);
    err(USAGE);
    return EXIT.usage;
  }
  if (o.help) {
    out(USAGE);
    return 0;
  }
  if (o.cmd === "preflight") {
    const p = preflight(cwd, o.base);
    if (o.json) out(JSON.stringify(p));
    else (p.code === 0 ? out : err)(p.code === 0 ? p.message : `FAIL ${p.code}: ${p.message}`);
    return p.code;
  }
  if (o.cmd === "close-ticket") {
    // Only a merge that GitHub shows closes a ticket. The script reads the pull request first.
    try {
      const repo = o.repo ?? currentRepo(fetcher);
      const pr = readPr(fetcher, repo, Number(o.pr));
      if (pr.merged !== true || !FULL_SHA.test(String(pr.merge_commit_sha ?? ""))) {
        err(`FAIL ${EXIT.ticketNotClosed}: ${msg(`pull request #${Number(o.pr)} is not merged, so the ticket stays as it is`, "close a ticket only after land-check.mjs prints MERGED")}`);
        return EXIT.ticketNotClosed;
      }
      const next = closeTicketText(readFileSync(o.ticket, "utf8"), { pr: Number(o.pr), sha: pr.merge_commit_sha });
      if (next === null) {
        err(`FAIL ${EXIT.ticketNotClosed}: ${msg(`${quoteName(o.ticket, 200)} has no Status line`, "add a line Status: closed by hand")}`);
        return EXIT.ticketNotClosed;
      }
      writeFileSync(o.ticket, next);
      out(`Ticket ${quoteName(o.ticket, 200)}: Status: closed. Pull request #${Number(o.pr)} is merged as ${pr.merge_commit_sha.slice(0, 12)}.`);
      return 0;
    } catch (e) {
      err(`land-check: FAIL 3: ${e instanceof FetchError ? e.message : msg(`cannot close the ticket (${quoteName(String(e?.message ?? e), 200)})`, "check the path of the ticket file")}`);
      return EXIT.data;
    }
  }
  let state;
  let verdict;
  let merged = null;
  try {
    let review;
    // The evidence index of the task sits beside the review file: .artifacts/<task>/evidence/index.json.
    const acceptance = o.review ? acceptanceResults(readSmall(join(dirname(resolve(cwd, o.review)), "evidence", "index.json"))) : null;
    if (o.input) {
      state = JSON.parse(readFileSync(o.input, "utf8"));
      if (!state || typeof state !== "object" || !FULL_SHA.test(String(state.pr?.head?.sha ?? "")) || !state.repo || typeof state.repo !== "object") throw new UsageError(msg(`${quoteName(o.input, 200)} has no pr.head.sha or repo`, "write the state in the shape that gather() returns"));
      const text = o.review ? readReviewText(o.review) : state.review?.text ?? null;
      const g = o.review ? (repoGit ?? localGit(cwd)) : simulatedGit(state.review ?? {});
      review = reviewEvidence(text, state.pr.head.sha, g, { prCommits: state.pr.commits, prShas: prShas(state) });
    } else {
      const repo = o.repo ?? currentRepo(fetcher);
      state = gather(fetcher, { repo, number: Number(o.pr) });
      // GitHub computes "mergeable" in the background after a push. Read again a few times.
      for (let i = 0; i < 5 && state.pr.state === "open" && (state.pr.mergeable === null || state.pr.mergeable === undefined); i++) {
        sleep(3000);
        state = gather(fetcher, { repo, number: Number(o.pr) });
      }
      review = reviewEvidence(readReviewText(o.review), state.pr.head.sha, repoGit ?? localGit(cwd), { prCommits: state.pr.commits, prShas: prShas(state) });
    }
    verdict = decide(state, { review, branch: o.branch ?? null, ownerApproved: o.ownerApproved, acceptance: acceptance ?? acceptanceResults(typeof state.evidenceIndex === "string" ? state.evidenceIndex : null) });
    if (verdict.exitCode === 0 && o.merge) {
      merged = mergeNow(fetcher, state, verdict);
      verdict.exitCode = merged.code;
      if (merged.code !== 0) verdict.failures.push({ code: merged.code, message: merged.message });
    }
  } catch (e) {
    if (e instanceof UsageError) {
      err(`land-check: ${e.message}`);
      return EXIT.usage;
    }
    // A FetchError has a message in the house form. Every other error is data of a shape that the
    // script did not expect. Both stop the gate with exit 3. Nothing merges.
    const what = e instanceof FetchError ? e.message : msg(`cannot read the state (${quoteName(String(e?.message ?? e), 200)})`, "check the file or the gh login, then run again");
    err(`land-check: FAIL 3: ${what}`);
    return EXIT.data;
  }
  const gate = gateState(verdict.exitCode, Boolean(merged));
  if (o.json) {
    out(JSON.stringify({ state: gate, ...verdict, merged }, null, 2));
    return verdict.exitCode;
  }
  out(`Pull request #${verdict.pr}, head ${verdict.head.slice(0, 12)}`);
  if (!verdict.configFound) out("Config: the default branch has no .stack/risk.json. The built-in default config is in use.");
  out(`Risk: ${verdict.risk.level} (rule ${quoteName(verdict.risk.rule, 200)}${verdict.risk.path ? `, path ${quoteName(verdict.risk.path)}` : ""}). Computed from the default branch config.`);
  out(`Checks: ${verdict.checksMode === "named" ? "the required checks of the config" : verdict.noChecks ? "none on the head" : "every check on the head (the config names no required check)"}.`);
  out(`Human approval on the head: ${verdict.approvedBy.length ? verdict.approvedBy.map((a) => quoteName(a)).join(", ") : "none"}`);
  if (o.ownerApproved) out(verdict.ownerApprovalUsed ? "Owner approval: the caller passed --owner-approved. The approval gate was skipped. Every other gate ran." : "Owner approval: --owner-approved was passed and not used. The risk is not high, or a person approved on GitHub.");
  out(`Review file: ${verdict.review.state}${verdict.review.openLow?.length ? `, open low findings: ${verdict.review.openLow.slice(0, 20).map((id) => quoteName(id, 40)).join(", ")}` : ""}`);
  if (verdict.acceptance) out(`Acceptance checks in the evidence index: ${verdict.acceptance.pass} pass, ${verdict.acceptance.fail} fail, ${verdict.acceptance.untested} untested.`);
  else out("Acceptance checks: no evidence index was found beside the review file. Report every check as untested.");
  for (const f of verdict.failures) err(`FAIL ${f.code}: ${f.message}`);
  if (verdict.exitCode !== 0) out(`STATE ${gate}: exit ${verdict.exitCode}.`);
  if (verdict.exitCode === 0 && merged) out(`MERGED #${verdict.pr} as ${merged.mergeCommit ?? "(no sha shown)"}. GitHub shows it merged. Head branch deleted: ${merged.branchDeleted ? "yes" : "no"}.${merged.notePosted ? " Owner approval note posted: yes." : ""}`);
  else if (verdict.exitCode === 0) out("PASS: every gate passed on the head commit. Nothing was merged. Run again with --merge to merge.");
  return verdict.exitCode;
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
