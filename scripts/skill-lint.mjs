#!/usr/bin/env node
// skill-lint: checks every skills/*/SKILL.md against CONVENTIONS.md.
//
// Adapted from MIT-licensed sources (see NOTICE):
// - mattpocock/skills scripts/check-frontmatter.mjs (Matt Pocock): the
//   `^---\n...\n---` frontmatter match and the "name and description must be
//   non-empty strings" check. We replaced the `yaml` package with a small
//   parser for the `key: value` subset.
// - kcd-skills test/kcd-skills-cli.test.mjs (Kent C. Dodds): the idea that every
//   file a skill points to must exist, with a message that says how to fix it.
// - kcd-skills test/skill-text.test.mjs (Kent C. Dodds): the per-line dash scan
//   with `file:line` hits. We added en dashes, semicolons, code-block handling.
// - ratstack apps/site/scripts/generate-content.ts (Joel Hooks): the rule that a
//   skill's frontmatter name must match its folder, with "what is wrong / fix".
//
// Usage: node scripts/skill-lint.mjs [--json] [rootDir]
// Exit 0 clean, 1 problems found, 2 usage or read error.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openaiYaml } from "./openai-yaml.mjs";

const REPO_PREFIXES = ["skills", "hooks", "scripts", "templates", "tests"];
const MAX_LINES = 150;
// Files that a skill names because they live in the user's project, not here.
const PROJECT_FILES = new Set(["AGENTS.md", "CLAUDE.md", "GLOSSARY.md", "GLOSSARY-MAP.md", "README.md", "CONTEXT.md"]);

// Built-in commands of the agent tool. A skill with one of these names would clash with the command.
// Source: Claude Code built-in commands, checked 25 Nov 2026.
export const BUILT_IN_COMMANDS = ["init", "debug", "review", "code-review", "security-review", "simplify", "verify", "run", "design", "loop", "ship", "doctor"];

export class LintError extends Error {}

// ---------- frontmatter ----------

/** Parse the `key: value` subset. Returns { data, endLine } or { error: {line, message} }. */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { error: { line: 1, message: "file does not start with a `---` frontmatter block" } };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { error: { line: 1, message: "frontmatter block is never closed with `---`" } };
  const data = {};
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    const n = i + 1;
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    const m = raw.match(/^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/);
    if (!m) {
      return { error: { line: n, message: `cannot parse frontmatter line \`${raw.trim()}\` (only \`key: value\` lines are supported)` } };
    }
    const key = m[1];
    if (Object.hasOwn(data, key)) return { error: { line: n, message: `duplicate frontmatter key \`${key}\`` } };
    let value = (m[2] ?? "").trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const q = value[0];
      if (value.length < 2 || !value.endsWith(q)) {
        return { error: { line: n, message: `unterminated quoted value for \`${key}\`` } };
      }
      value = value.slice(1, -1);
      if (q === '"') value = value.replace(/\\(["\\])/g, "$1");
    } else if (/^[[{&*!|>%@`]/.test(value)) {
      return { error: { line: n, message: `value of \`${key}\` starts with \`${value[0]}\`, which this parser does not support (lists, maps and block scalars are not allowed)` } };
    } else if (/: |\s#/.test(value)) {
      return { error: { line: n, message: `unquoted value of \`${key}\` contains \`: \` or \` #\`, which YAML reads differently` } };
    }
    data[key] = value;
  }
  return { data, endLine: end + 1 };
}

// ---------- text helpers ----------

function stripInlineCode(line) {
  return line.replace(/(`+)[^`]*?\1/g, "");
}

function inlineCodeSpans(line) {
  return [...line.matchAll(/(`+)([^`]*?)\1/g)].map((m) => m[2]);
}

/** Split text into per-line records with fence state. Frontmatter lines are never in a fence. */
function scanLines(text, bodyStart) {
  const raw = text.split(/\r?\n/);
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  let inFence = false;
  let inProvenance = false;
  return raw.map((t, i) => {
    const n = i + 1;
    if (n <= bodyStart) return { n, t, fence: false, inFrontmatter: true };
    if (!inFence && /^##\s/.test(t)) inProvenance = /^##\s+Provenance\s*$/.test(t);
    const trimmed = t.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      return { n, t, fence: true, inFrontmatter: false, inProvenance };
    }
    return { n, t, fence: inFence, inFrontmatter: false, inProvenance };
  });
}

function pathExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function cleanPathToken(tok) {
  let t = tok.replace(/[.,:;!?]+$/, "");
  t = t.replace(/#.*$/, "").replace(/\?.*$/, "");
  t = t.replace(/:\d+(?:-\d+)?$/, "");
  return t;
}

const PLACEHOLDER = /[<>*{}$[\]]/;

// ---------- lint ----------

export function lint(rootArg) {
  const root = resolve(rootArg ?? ".");
  const skillsDir = join(root, "skills");
  if (!pathExists(skillsDir) || !statSync(skillsDir).isDirectory()) {
    throw new LintError(`no skills/ directory under ${root}`);
  }
  const problems = [];
  let noFenceYet = 0;
  const add = (file, line, rule, message, fix) =>
    problems.push({ path: relative(root, file) || file, line, rule, message, fix });

  const folders = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  // First pass: read and parse every skill so rule 4 and 5 know each skill's type.
  const skills = new Map();
  for (const folder of folders) {
    const file = join(skillsDir, folder, "SKILL.md");
    if (!pathExists(file)) {
      add(join(skillsDir, folder), 1, "skill-file", `folder \`${folder}\` has no SKILL.md`, `add skills/${folder}/SKILL.md or remove the folder.`);
      continue;
    }
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (e) {
      throw new LintError(`cannot read ${file}: ${e.message}`);
    }
    const fm = parseFrontmatter(text);
    skills.set(folder, { folder, file, text, fm, typed: fm.data?.["disable-model-invocation"] === "true" });
  }

  for (const s of skills.values()) {
    const { folder, file, text, fm } = s;
    const skillDir = dirname(file);

    // Rule 1: frontmatter.
    if (fm.error) {
      add(file, fm.error.line, "frontmatter", fm.error.message, "use only `key: value` lines between two `---` lines. Quote values that contain `: `.");
    } else {
      for (const key of ["name", "description"]) {
        if (typeof fm.data[key] !== "string" || fm.data[key].trim() === "") {
          add(file, 1, "frontmatter", `missing or empty \`${key}\``, `add \`${key}: ...\` to the frontmatter.`);
        }
      }
      if (fm.data.name && BUILT_IN_COMMANDS.includes(fm.data.name)) {
        add(file, 1, "name-builtin", `skill name \`${fm.data.name}\` is the same as a built-in command of the agent tool`, `rename the skill and its folder. The built-in commands are: ${BUILT_IN_COMMANDS.join(", ")}.`);
      }
      if (/[<>]/.test(fm.data.description ?? "")) {
        add(file, 1, "description-brackets", "description contains an angle bracket (`<` or `>`)", "remove the angle brackets from the description. Use plain words instead.");
      }
      if (fm.data.name && fm.data.name !== folder) {
        add(file, 1, "name-folder", `frontmatter name \`${fm.data.name}\` does not match folder \`${folder}\``, `set \`name: ${folder}\` in skills/${folder}/SKILL.md, or rename the folder.`);
      }
      // Rule 7: agents/openai.yaml carries the frontmatter to Codex. scripts/openai-yaml.mjs writes it.
      if (fm.data.name && fm.data.description) {
        const yamlFile = join(skillDir, "agents", "openai.yaml");
        const fix = "run `bun run gen:codex`. Do not edit the file by hand.";
        if (!pathExists(yamlFile)) {
          add(yamlFile, 1, "codex-meta", `skill \`${folder}\` has no agents/openai.yaml`, fix);
        } else {
          const have = readFileSync(yamlFile, "utf8");
          const policy = /^\s*allow_implicit_invocation:\s*false\s*$/m.test(have);
          if (s.typed && !policy) {
            add(yamlFile, 1, "codex-meta", `typed skill \`${folder}\` has no \`allow_implicit_invocation: false\`, so Codex can load it without the user`, fix);
          } else if (!s.typed && policy) {
            add(yamlFile, 1, "codex-meta", `agent skill \`${folder}\` has \`allow_implicit_invocation: false\`, so Codex cannot load it by itself`, fix);
          } else if (have !== openaiYaml(fm.data)) {
            add(yamlFile, 1, "codex-meta", `agents/openai.yaml of \`${folder}\` differs from what its frontmatter gives`, fix);
          }
        }
      }
    }

    const bodyStart = fm.error ? 0 : fm.endLine;
    const lines = scanLines(text, bodyStart);

    // Rule 6: text rules.
    if (lines.length > MAX_LINES) {
      add(file, MAX_LINES + 1, "max-lines", `SKILL.md has ${lines.length} lines (limit ${MAX_LINES})`, "move long reference material to a file beside SKILL.md and link to it.");
    }
    if (!lines.some((l) => !l.fence && /^##\s+Provenance\s*$/.test(l.t))) {
      add(file, 1, "provenance", "no `## Provenance` section", "add a `## Provenance` section naming each source file, repo, license, copyright holder and what changed.");
    }
    for (const l of lines) {
      if (l.t.includes("\u2014") || l.t.includes("\u2013")) {
        add(file, l.n, "dash", `${l.t.includes("\u2014") ? "em" : "en"} dash found`, "use a period, comma, colon or parentheses.");
      }
      if (l.fence) continue;
      const prose = stripInlineCode(l.t).replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, "").replace(/&#?\w+;/g, "");
      if (prose.includes(";")) {
        add(file, l.n, "semicolon", "semicolon in prose", "split the sentence or use a comma. Semicolons are fine inside code.");
      }
    }

    // Rule 2: pointers exist.
    const seen = new Set();
    const checkPointer = (l, target, kind) => {
      const key = `${l.n}:${target}`;
      if (seen.has(key)) return;
      seen.add(key);
      const prefixed = REPO_PREFIXES.some((p) => target.startsWith(`${p}/`));
      const found = prefixed
        ? pathExists(join(root, target)) || pathExists(join(skillDir, target))
        : pathExists(join(skillDir, target));
      if (!found) {
        add(file, l.n, "pointer", `${kind} \`${target}\` points to a file that does not exist`, `create ${prefixed ? target : `skills/${folder}/${target}`}, fix the path, or remove the pointer.`);
      }
    };
    for (const l of lines) {
      // Provenance names files in the source repos, not in this repo.
      if (l.inFrontmatter || l.inProvenance) continue;
      if (!l.fence) {
        for (const m of stripInlineCode(l.t).matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const href = m[1];
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) continue;
          const target = cleanPathToken(href);
          if (target && !PLACEHOLDER.test(target)) checkPointer(l, target, "link");
        }
        for (const span of inlineCodeSpans(l.t)) {
          const bare = span.trim();
          if (/^(?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:md|mjs|json|sh)$/.test(bare) && !PLACEHOLDER.test(bare)) {
            const prefixed = REPO_PREFIXES.some((p) => bare.startsWith(`${p}/`));
            const sibling = bare.startsWith("./") || bare.startsWith("../") || !bare.includes("/");
            if (!prefixed && sibling && !PROJECT_FILES.has(bare)) checkPointer(l, bare, "path");
          }
        }
      }
      const scanText = l.fence ? l.t : inlineCodeSpans(l.t).join("\n");
      for (const m of scanText.matchAll(/(?:^|[\s"'=(])((?:skills|hooks|scripts|templates|tests)\/[^\s"'`)|;&]+)/gm)) {
        if (PLACEHOLDER.test(m[1])) continue;
        const target = cleanPathToken(m[1]);
        if (target && !PLACEHOLDER.test(target)) checkPointer(l, target, "path");
      }
    }

    // Rule 3: Held by.
    for (const l of lines) {
      if (l.fence || l.inFrontmatter) continue;
      if (/(?:^|[\s`*_.])No fence yet(?:\s*\(planned:[^)]*\))?[`*_.]*\s*$/.test(l.t)) noFenceYet++;
      const m = l.t.match(/Held by:\s*(.*)$/);
      if (!m) continue;
      const value = m[1].trim().replace(/^`+|`+$/g, "").trim();
      if (/^planned\b/i.test(value)) {
        add(file, l.n, "held-by-planned", "`Held by:` names a planned item", "write `No fence yet (planned: ...)` until the script or test exists.");
        continue;
      }
      if (/^No fence yet/i.test(value)) continue;
      if (value === "") {
        add(file, l.n, "held-by", "`Held by:` is empty", "name the script, hook or test that enforces the rule, or write `No fence yet`.");
        continue;
      }
      for (const part of value.split(/\s*,\s*|\s+and\s+/)) {
        const p = part.replace(/\([^)]*\)/g, "").replace(/`/g, "").replace(/[.]+$/, "").trim();
        if (!p) continue;
        if (!pathExists(join(root, p)) && !pathExists(join(skillDir, p))) {
          add(file, l.n, "held-by", `\`Held by: ${p}\` names a path that does not exist`, `create ${p}, fix the path, or write \`No fence yet (planned: ...)\`.`);
        }
      }
    }

    // Rule 4: a typed workflow must not run another typed workflow.
    if (s.typed) {
      const others = [...skills.values()].filter((o) => o.typed && o.folder !== folder).map((o) => o.folder);
      for (const l of lines) {
        if (l.inFrontmatter) continue;
        for (const other of others) {
          const esc = other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const refs = [
            new RegExp(`(^|[\\s\`(])/${esc}(?![\\w/-])`),
            new RegExp(`\`${esc}\`\\s+(?:skill|workflow)`, "i"),
            new RegExp(`(?:skill|workflow)\\s+\`/?${esc}\``, "i"),
          ];
          if (!refs.some((r) => r.test(l.t))) continue;
          const tellsUser = /type\s+`\/[\w-]+`/i.test(l.t) || /next command/i.test(l.t) || /\b(?:tell|ask) the user\b/i.test(l.t) || /\bthe user (?:types|runs|can type)\b/i.test(l.t);
          if (!tellsUser) {
            add(file, l.n, "typed-chain", `typed workflow \`${folder}\` refers to typed workflow \`${other}\` as if the agent can run it`, `tell the user to type \`/${other}\` as the next command instead of running it.`);
          }
        }
      }
    }
  }

  // Rule 2b: relative links in the files beside SKILL.md must resolve too.
  for (const folder of folders) {
    const skillDir = join(skillsDir, folder);
    for (const e of readdirSync(skillDir, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith(".md") || e.name === "SKILL.md") continue;
      const file = join(skillDir, e.name);
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch (err) {
        throw new LintError(`cannot read ${file}: ${err.message}`);
      }
      for (const l of scanLines(text, 0)) {
        if (l.fence || l.inProvenance) continue;
        for (const m of stripInlineCode(l.t).matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const href = m[1];
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) continue;
          const target = cleanPathToken(href);
          if (target && !PLACEHOLDER.test(target) && !pathExists(join(skillDir, target))) {
            add(file, l.n, "pointer", `link \`${target}\` points to a file that does not exist`, `create skills/${folder}/${target}, fix the path, or remove the link.`);
          }
        }
      }
    }
  }

  // Rule 5: router block in skills/start/SKILL.md.
  const start = skills.get("start");
  const startFile = join(skillsDir, "start", "SKILL.md");
  if (!start) {
    add(startFile, 1, "router", "skills/start/SKILL.md does not exist, so the router block cannot be checked", "add the start skill with a `<!-- skills:begin -->` block.");
  } else {
    const lines = start.text.split(/\r?\n/);
    const b = lines.findIndex((l) => l.trim() === "<!-- skills:begin -->");
    const e = lines.findIndex((l) => l.trim() === "<!-- skills:end -->");
    if (b === -1 || e === -1 || e < b) {
      add(startFile, 1, "router", "router block markers `<!-- skills:begin -->` and `<!-- skills:end -->` are missing or out of order", "add both markers around the `name | type | purpose` lines.");
    } else {
      const listed = new Map();
      for (let i = b + 1; i < e; i++) {
        const raw = lines[i].trim();
        if (raw === "") continue;
        const cells = raw.replace(/^[-*]\s+/, "").replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/`/g, ""));
        if (cells.length < 3 || !cells[0] || !cells[2]) {
          add(startFile, i + 1, "router", `router line \`${raw}\` is not \`name | type | purpose\``, "write `name | typed-or-agent | purpose`.");
          continue;
        }
        const [name, type] = cells;
        if (listed.has(name)) {
          add(startFile, i + 1, "router", `\`${name}\` is listed twice`, "list each skill once.");
          continue;
        }
        listed.set(name, i + 1);
        const skill = skills.get(name);
        if (!skill) {
          add(startFile, i + 1, "router", `router lists \`${name}\`, but skills/${name}/ does not exist`, `remove the line or add skills/${name}/SKILL.md.`);
          continue;
        }
        const want = skill.typed ? "typed" : "agent";
        if (type !== want) {
          add(startFile, i + 1, "router", `router says \`${name}\` is \`${type}\`, but its frontmatter makes it \`${want}\``, `change the type to \`${want}\` (typed means \`disable-model-invocation: true\`).`);
        }
      }
      for (const folder of folders) {
        if (!listed.has(folder)) {
          add(startFile, b + 1, "router", `skills/${folder}/ is not in the router block`, `add \`${folder} | ${skills.get(folder)?.typed ? "typed" : "agent"} | purpose\` between the markers.`);
        }
      }
    }
  }

  problems.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
  return { root, skills: skills.size, noFenceYet, problems };
}

export function formatProblem(p) {
  return `${p.path}:${p.line}  ${p.rule}  ${p.message}  Fix: ${p.fix}`;
}

// ---------- CLI ----------

function main(argv) {
  let json = false;
  let root;
  for (const a of argv) {
    if (a === "--json") json = true;
    else if (a.startsWith("-")) {
      console.error(`skill-lint: unknown option ${a}\nUsage: node scripts/skill-lint.mjs [--json] [rootDir]`);
      return 2;
    } else if (root === undefined) root = a;
    else {
      console.error("skill-lint: too many arguments\nUsage: node scripts/skill-lint.mjs [--json] [rootDir]");
      return 2;
    }
  }
  let result;
  try {
    result = lint(root);
  } catch (e) {
    if (e instanceof LintError) {
      console.error(`skill-lint: ${e.message}`);
      return 2;
    }
    console.error(`skill-lint: ${e.message}`);
    return 2;
  }
  if (json) {
    console.log(JSON.stringify({ ok: result.problems.length === 0, skills: result.skills, noFenceYet: result.noFenceYet, problems: result.problems }, null, 2));
  } else {
    for (const p of result.problems) console.log(formatProblem(p));
    console.log(`${result.skills} skill(s) checked, ${result.problems.length} problem(s), ${result.noFenceYet} "No fence yet" rule(s).`);
  }
  return result.problems.length === 0 ? 0 : 1;
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

if (isMain()) {
  process.exitCode = main(process.argv.slice(2));
}
