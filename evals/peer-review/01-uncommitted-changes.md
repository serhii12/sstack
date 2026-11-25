# Eval peer-review/01: a commit plus uncommitted changes

## Prompt

```
Review my changes. The task name is discount and the spec is spec.md.
```

## Setup

- A fresh git repo on branch `main` with the stack installed. The repo has one commit with these files:
  - `AGENTS.md` with the rules: "Use named exports only. Never use default exports." and "Do not leave console.log calls in src/."
  - `spec.md` with the requirement: "applyDiscount(price, percent) returns the price with the discount taken off. The percent is capped at 50."
  - `src/price.mjs` with `export function format(price) { return price.toFixed(2); }`.
- Uncommitted changes, planted on purpose:
  - `src/price.mjs` is edited (unstaged) to add `console.log("formatting", price)` inside `format`.
  - `src/discount.mjs` is new and untracked. It has `export default function applyDiscount(price, percent) { return price - price * percent / 100; }`. It does not cap the percent.
- Allowed tools: `Read`, `Grep`, `Glob`, `Write`, `Skill`, `Agent`, `Bash(node .claude/skills/peer-review/scripts/review-range.mjs:*)`.

## Expected behaviors

- [ ] The agent loads the `peer-review` skill (a `Skill` tool call with `peer-review`).
- [ ] The agent runs `node .claude/skills/peer-review/scripts/review-range.mjs --stat`. The exit code is 0 and the header lists `src/price.mjs` as unstaged and `src/discount.mjs` as untracked.
- [ ] The agent starts two reviewers as two separate subagents (two `Agent` tool calls), in one step.
- [ ] The brief of each reviewer has the read-only block (no edits, no loading the skill, no other review, no subagent). The briefs hold no summary of what the change does.
- [ ] Neither reviewer calls the `Skill` tool or the `Agent` tool.
- [ ] The reply has two separate blocks, `## Standards` and `## Spec`, and one summary line for each axis. It has no single blended verdict.
- [ ] The Standards block reports the `console.log` call or the default export. The Spec block reports the missing cap at 50.
- [ ] The agent writes `.artifacts/discount/review.md`. The file has `Mode:`, `Range:` and `Spec:` lines, and each finding has `Status: open`, a `Severity:` line and a `Cite:` line. Findings are numbered `S1` and `P1`.
- [ ] The agent edits no source file.

## Failure looks like

- The agent reviews the diff itself and starts no subagent.
- The agent diffs only against `HEAD` and misses the untracked file.
- The two axes merge into one list or one verdict.
- A reviewer starts another review or another subagent.
- No review file exists, or a finding has no status.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "AGENTS.md",
        "content": "# Rules\n\n1. Use named exports only. Never use default exports.\n2. Do not leave console.log calls in src/.\n"
      },
      {
        "path": "spec.md",
        "content": "# Spec: discount\n\napplyDiscount(price, percent) returns the price with the discount taken off. The percent is capped at 50.\n"
      },
      {
        "path": "src/price.mjs",
        "content": "export function format(price) { return price.toFixed(2); }\n"
      }
    ]
  },
  "prompt": "First make two changes and do not commit them. In src/price.mjs, add the line console.log(\"formatting\", price); as the first line inside format. Create src/discount.mjs with exactly this line: export default function applyDiscount(price, percent) { return price - price * percent / 100; } Then review my changes. The task name is discount and the spec is spec.md.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Write",
    "Edit",
    "Skill",
    "Agent",
    "Bash(node .claude/skills/peer-review/scripts/review-range.mjs:*)"
  ],
  "budgetUsd": 4,
  "assert": {
    "skillLoaded": [
      "peer-review"
    ],
    "toolCalled": [
      {
        "name": "Bash",
        "inputMatches": "review-range\\.mjs --stat"
      },
      {
        "name": "Agent",
        "inputMatches": "You are a reviewer\\. You only read and report"
      },
      {
        "name": "Agent",
        "inputMatches": "does this change follow this repo's standards"
      },
      {
        "name": "Agent",
        "inputMatches": "does this change do what the spec"
      }
    ],
    "outputMatches": [
      "## Standards",
      "## Spec"
    ],
    "fileExists": [
      ".artifacts/discount/review.md"
    ],
    "fileMatches": [
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Mode:"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Range:"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Spec:"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Status: open"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Severity:"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "Cite:"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "\\bS1\\b"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "\\bP1\\b"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "/console\\.log|default export|export default/i"
      },
      {
        "path": ".artifacts/discount/review.md",
        "pattern": "\\b50\\b"
      },
      {
        "path": "src/price.mjs",
        "pattern": "console\\.log\\(\"formatting\""
      },
      {
        "path": "src/discount.mjs",
        "pattern": "^(?![\\s\\S]*(Math\\.min|\\b50\\b))[\\s\\S]*applyDiscount"
      }
    ]
  }
}
```

Not machine-checked:

- The two Agent calls happen in one step.
- The briefs hold no summary of the change.
- The reviewers call no `Skill` or `Agent` tool. The runner cannot tell a subagent call from a main call.
- The exit code of `review-range.mjs` is 0.
- Each finding is in the right block.

The runner cannot leave uncommitted changes after the setup commit, so the prompt tells the agent to make them first.
