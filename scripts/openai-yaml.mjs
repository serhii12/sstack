#!/usr/bin/env node
// openai-yaml: writes skills/<name>/agents/openai.yaml for every skill, from the SKILL.md frontmatter.
//
// Codex reads this file. It ignores `disable-model-invocation`. Only
// `policy.allow_implicit_invocation: false` stops Codex from loading a typed skill by itself.
// The frontmatter stays the one source of truth. This script carries the same facts to Codex:
//   interface.display_name             the `name`
//   interface.short_description        the `description`, cut to SHORT_MAX characters (see shortDescription)
//   policy.allow_implicit_invocation   false, only when `disable-model-invocation: true`
// Claude Code does not read the file.
//
// Docs checked 25 Nov 2026: learn.chatgpt.com/docs/build-skills ("Optional metadata") and the
// skill-creator reference that ships with Codex CLI 0.172.0 (short_description: 25 to 64 characters).
//
// skill-lint.mjs calls openaiYaml() and fails when a file is missing or differs.
//
// Usage: node scripts/openai-yaml.mjs [--check] [rootDir]
//   Without --check: write each file that is missing or differs. Print one line per write.
//   --check: write nothing. Print one line per missing or different file.
// Exit 0 all files match (or were written), 1 --check found a missing or different file, 2 usage or read error.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SHORT_MAX = 64;
export const SHORT_MIN = 25;
export const HEADER = "# Generated from SKILL.md by scripts/openai-yaml.mjs. Do not edit. Run: bun run gen:codex";

// A cut before one of these words starts a new part of the sentence.
const STRONG_WORDS = new Set(["and", "or", "then", "as", "to", "into", "until", "while", "when", "that", "which", "because", "so"]);
// Prepositions. A cut before one of them is used only when no strong cut is long enough.
const WEAK_WORDS = new Set(["in", "on", "for", "from", "by", "with", "at", "without", "after", "before", "about"]);
// A cut text that ends with one of these words ends in the middle of a phrase.
const DANGLING = new Set(["a", "an", "the", "and", "or", "of", "to", "its", "their", "each", "one", "this", "that", "these", "those", "your", "our", "my", "own", "for", "in", "on", "by", "with", "as", "from", "into", "than", "then"]);

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/** The sentences of a text. A period inside a word, such as `GLOSSARY.md`, does not end a sentence. */
function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'`(])/u).map((s) => s.trim()).filter(Boolean);
}

/** Remove side remarks that a short summary can lose: `(...)` and `, usually ...,` pairs. */
function dropAsides(s) {
  return s
    .replace(/\s*\([^()]*\)/gu, "")
    .replace(/,\s+[a-z]+ly\b[^,]*,/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function tidy(s) {
  return s.replace(/[\s,:;.(]+$/u, "").trim();
}

/**
 * The places where the sentence can be cut, each with its kind: strong or weak.
 * A comma in a list ("a plan, design, decision or idea") is not a place to cut.
 * After a colon, every comma belongs to the list that the colon starts.
 */
function cutPoints(s) {
  const points = [];
  const colon = s.indexOf(": ");
  const commas = [...s.matchAll(/,\s/gu)].map((m) => m.index);
  const segment = (from, to) => s.slice(from, to);
  const listComma = commas.map((c, i) => {
    if (colon !== -1 && c > colon) return true;
    const before = segment(i === 0 ? 0 : commas[i - 1] + 1, c);
    const after = segment(c + 1, i + 1 < commas.length ? commas[i + 1] : s.length);
    return wordCount(before) <= 1 || wordCount(after) <= 1;
  });
  commas.forEach((c, i) => {
    if (!listComma[i]) points.push({ at: c, kind: "strong" });
  });
  if (colon !== -1) points.push({ at: colon, kind: "strong" });
  for (const m of s.matchAll(/\s([A-Za-z]+)\b/gu)) {
    const word = m[1].toLowerCase();
    const kind = STRONG_WORDS.has(word) ? "strong" : WEAK_WORDS.has(word) ? "weak" : null;
    if (!kind) continue;
    if (word === "and" || word === "or") {
      // An "and" or "or" that closes a comma list is not a place to cut.
      const prev = commas.filter((c) => c < m.index).pop();
      if (prev !== undefined && listComma[commas.indexOf(prev)]) continue;
    }
    points.push({ at: m.index, kind });
  }
  return points;
}

function goodCut(text) {
  if (text.length < SHORT_MIN || text.length > SHORT_MAX) return false;
  const last = text.split(/\s+/).pop().toLowerCase();
  if (DANGLING.has(last)) return false;
  return (text.match(/\(/g) ?? []).length === (text.match(/\)/g) ?? []).length;
}

/**
 * The short description for the Codex skill picker, SHORT_MAX characters or fewer.
 * 1. If the whole description fits, use it without its final period.
 * 2. Else use the full sentences that fit, from the start.
 * 3. Else cut the first sentence, with its side remarks removed, at the last strong place that fits:
 *    a clause comma, a colon, or a word such as "and", "to" or "until".
 * 4. Else cut it before the last preposition that fits.
 * 5. Else cut at the last word boundary and drop words that leave the phrase open.
 */
export function shortDescription(description) {
  const text = String(description ?? "").replace(/\s+/gu, " ").trim();
  if (text.length <= SHORT_MAX) return tidy(text);
  const parts = sentences(text);
  let fit = "";
  for (const p of parts) {
    const next = fit ? `${fit} ${p}` : p;
    if (tidy(next).length > SHORT_MAX) break;
    fit = next;
  }
  if (fit && tidy(fit).length >= SHORT_MIN) return tidy(fit);
  const first = dropAsides(parts[0] ?? text);
  if (tidy(first).length <= SHORT_MAX && tidy(first).length >= SHORT_MIN) return tidy(first);
  const points = cutPoints(first);
  for (const kind of ["strong", "weak"]) {
    const best = points
      .filter((p) => p.kind === kind)
      .map((p) => tidy(first.slice(0, p.at)))
      .filter(goodCut)
      .sort((a, b) => b.length - a.length)[0];
    if (best) return best;
  }
  let cut = first.slice(0, SHORT_MAX + 1);
  cut = cut.slice(0, cut.lastIndexOf(" "));
  while (cut.includes(" ") && DANGLING.has(cut.split(" ").pop().toLowerCase())) cut = cut.slice(0, cut.lastIndexOf(" "));
  return tidy(cut);
}

const quote = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The full text of agents/openai.yaml for one skill, from its parsed frontmatter data. */
export function openaiYaml(data) {
  const lines = [
    HEADER,
    "interface:",
    `  display_name: ${quote(data.name)}`,
    `  short_description: ${quote(shortDescription(data.description))}`,
  ];
  if (data["disable-model-invocation"] === "true") lines.push("policy:", "  allow_implicit_invocation: false");
  return `${lines.join("\n")}\n`;
}

export class UsageError extends Error {}

/** One entry per skill folder: { folder, path, want, have } or { folder, path, error }. Reads only. */
export async function plan(rootArg) {
  const { parseFrontmatter } = await import("./skill-lint.mjs");
  const root = resolve(rootArg ?? ".");
  const skillsDir = join(root, "skills");
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) throw new UsageError(`no skills/ directory under ${root}`);
  const folders = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
  return folders.map((folder) => {
    const path = join("skills", folder, "agents", "openai.yaml");
    const skillFile = join(skillsDir, folder, "SKILL.md");
    if (!existsSync(skillFile)) return { folder, path, error: `skills/${folder}/SKILL.md is missing` };
    const fm = parseFrontmatter(readFileSync(skillFile, "utf8"));
    if (fm.error) return { folder, path, error: `skills/${folder}/SKILL.md line ${fm.error.line}: ${fm.error.message}` };
    if (!fm.data.name || !fm.data.description) return { folder, path, error: `skills/${folder}/SKILL.md has no name or no description` };
    const full = join(root, path);
    return { folder, path, full, want: openaiYaml(fm.data), have: existsSync(full) ? readFileSync(full, "utf8") : null };
  });
}

async function main(argv) {
  let check = false;
  let root;
  const usage = "Usage: node scripts/openai-yaml.mjs [--check] [rootDir]";
  for (const a of argv) {
    if (a === "--check") check = true;
    else if (a.startsWith("-")) {
      console.error(`openai-yaml: unknown option ${a}\n${usage}`);
      return 2;
    } else if (root === undefined) root = a;
    else {
      console.error(`openai-yaml: too many arguments\n${usage}`);
      return 2;
    }
  }
  let entries;
  try {
    entries = await plan(root);
  } catch (e) {
    console.error(`openai-yaml: ${e.message}`);
    return 2;
  }
  const errors = entries.filter((e) => e.error);
  for (const e of errors) console.error(`openai-yaml: cannot read the frontmatter. ${e.error}. Fix: run bun run lint:skills and fix what it reports.`);
  if (errors.length > 0) return 2;
  let changed = 0;
  for (const e of entries) {
    if (e.have === e.want) continue;
    changed++;
    if (check) {
      console.log(`${e.path} is ${e.have === null ? "missing" : "different from the frontmatter"}. Fix: run bun run gen:codex.`);
    } else {
      mkdirSync(join(e.full, ".."), { recursive: true });
      writeFileSync(e.full, e.want);
      console.log(`write  ${e.path}`);
    }
  }
  console.log(`${entries.length} skill(s), ${changed} file(s) ${check ? "missing or different" : "written"}.`);
  return check && changed > 0 ? 1 : 0;
}

// Compare real paths so a run through a symlink still counts as a direct run.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// No top-level await: main() imports skill-lint.mjs, which imports this module. This module must finish loading first.
if (isMain()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`openai-yaml: ${e.message}`);
      process.exitCode = 2;
    },
  );
}
