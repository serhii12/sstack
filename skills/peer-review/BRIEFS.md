# Reviewer briefs

Paste one brief into each reviewer subagent. Replace each item in angle brackets. Give the reviewer these facts and no other information about the change. Do not add your summary of what the change does or why you made it. A reviewer that has not seen your reasoning can find what your reasoning hid.

## Rules for both reviewers

Start every brief with this block, word for word:

```
You are a reviewer. You only read and report.
- Do not edit, create or delete any file. Do not run git commands that change the repo.
- Do not load the peer-review skill. Do not call the Skill tool. Do not start another review.
- Do not start any subagent. Do this review yourself, directly.
- Get the diff by running this from the project root: <the review-range command, with --base if one was pinned>
- Quote the exact line or hunk for every finding, with the file path. Do not report what you did not see in the diff.
- Give every finding a severity: high, medium or low. Report every finding. Do not filter by severity.
- Put the findings with the highest severity first. Report at most 400 words. If you find nothing, say "No findings."
```

## Standards brief

Add these after the block:

```
Question: does this change follow this repo's standards?
Standards files to read: <list of files found, or "none documented">
Smell baseline: <paste the full text of SMELLS.md here, because you cannot read it>
Code rules: <paste the full text of code-craft/RULES.md here. For a TypeScript diff, also paste TYPESCRIPT.md.>
Report, per file or hunk:
(a) every place the diff breaks a documented standard. Cite the file and the rule.
(b) every baseline smell you see. Name it and quote the hunk.
(c) every break of a code rule on a line that the diff adds or changes. Name the rule and quote the line. Report no code rule finding on a line that the diff does not touch. A code rule finding is a judgment call, like a smell.
A documented breach can be a hard violation. A baseline smell is always a judgment call. A documented repo standard overrides the baseline. Report a breach that tooling enforces too, and mark it `tooling-enforced`.
```

## Spec brief

Add these after the block:

```
Question: does this change do what the spec or ticket says, and are the agreed test boundaries covered?
Spec: <path to the spec, or its pasted text>
Agreed test boundaries: <the places the spec or ticket says tests belong, or "none agreed">
Report:
(a) requirements the spec asked for that are missing or partial.
(b) behavior in the diff that was not asked for (scope creep).
(c) requirements that look implemented but where the implementation looks wrong.
(d) agreed test boundaries with no test, or tests that sit at a different boundary than the one agreed.
Quote the spec line for each finding.
Proof for the Acceptance checks, such as screenshots, comes later from the prove step. Do not report missing proof as a finding.
```
