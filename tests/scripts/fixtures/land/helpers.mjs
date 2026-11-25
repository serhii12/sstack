// Helpers for the land tests: load the base state, apply a merge patch, and build a fake fetcher.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FetchError } from "../../../../skills/land/scripts/land-lib.mjs";

export const FIX = dirname(fileURLToPath(import.meta.url));
export const HEAD = "c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00";
export const OLD = "b".repeat(40);

export const baseState = () => JSON.parse(readFileSync(join(FIX, "base-state.json"), "utf8"));

/** JSON merge patch (RFC 7386): objects merge, arrays and other values replace, null deletes. */
export function mergePatch(target, patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = target && typeof target === "object" && !Array.isArray(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

export const stateWith = (patch) => mergePatch(baseState(), patch);

/**
 * A fetcher that answers from a map. A key is "GET <path>" (with the query), "PUT <path>",
 * "DELETE <path>", "GRAPHQL <cursor or start>" or "CLI <args>". A value that is a function gets the
 * request. An Error value is thrown. Every request is recorded in `calls`.
 */
export function mapFetcher(map) {
  const calls = [];
  const f = (req) => {
    calls.push(req);
    let key;
    if (req.cli) key = `CLI ${req.cli.join(" ")}`;
    else if (req.graphql) key = `GRAPHQL ${req.variables?.cursor ?? "start"}`;
    else key = `${req.method ?? "GET"} ${req.api}`;
    if (!(key in map)) throw new FetchError(`no fixture for ${key}. Fix: add it.`, { status: 404 });
    const v = map[key];
    if (v instanceof Error) throw v;
    return typeof v === "function" ? v(req) : structuredClone(v);
  };
  f.calls = calls;
  return f;
}

/** A REST answer of one page, and an empty second page when the list is shorter than 100. */
export function pages(path, items, key = null) {
  const map = {};
  const wrap = (list) => (key ? { total_count: items.length, [key]: list } : list);
  for (let p = 1, i = 0; ; p++, i += 100) {
    map[`GET ${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`] = wrap(items.slice(i, i + 100));
    if (items.length - i < 100) break;
  }
  return map;
}

export const threadsAnswer = (nodes, hasNext = false, end = null) => ({
  data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: hasNext, endCursor: end }, nodes } } } },
});

/** Every message line has the form "<what failed>. Fix: <what to do>." */
export function messageLines(text) {
  return text.split("\n").filter((l) => /^(FAIL|land-check: FAIL|RESULT [1-9])/.test(l));
}

/**
 * The answers that gather() needs for one state: the repo, the gh user, the pull request, every list
 * as pages, the review threads, the config file and the access of each reviewer.
 */
export function gatherMap(state, extra = {}) {
  const repo = state.repo.full_name;
  const n = state.pr.number;
  const sha = state.pr.head.sha;
  const map = {
    [`GET repos/${repo}`]: state.repo,
    "GET user": state.viewer,
    [`GET repos/${repo}/pulls/${n}`]: state.pr,
    ...pages(`repos/${repo}/pulls/${n}/files`, state.files),
    ...pages(`repos/${repo}/commits/${sha}/check-runs`, state.checkRuns, "check_runs"),
    ...pages(`repos/${repo}/commits/${sha}/status`, state.statuses ?? [], "statuses"),
    ...pages(`repos/${repo}/pulls/${n}/reviews`, state.reviews),
    ...pages(`repos/${repo}/pulls/${n}/commits`, state.commits ?? []),
    "GRAPHQL start": threadsAnswer(state.threads),
  };
  const cfg = `GET repos/${repo}/contents/.stack/risk.json?ref=${state.repo.default_branch}`;
  if (state.config === undefined || state.config === null) map[cfg] = new FetchError("gh: Not Found (HTTP 404). Fix: x.", { status: 404 });
  else map[cfg] = { encoding: "base64", content: Buffer.from(JSON.stringify(state.config)).toString("base64") };
  for (const [login, permission] of Object.entries(state.permissions ?? {})) map[`GET repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`] = { permission, role_name: permission };
  return { ...map, ...extra };
}
