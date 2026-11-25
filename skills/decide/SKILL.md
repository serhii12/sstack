---
name: decide
description: Review the facts, then list numbered options with effort and whether each is easy or hard to undo. Recommend one and name the ideal fix when it differs. Then stop and wait for the user to choose. Use before you build when a decision has real trade-offs, or when the user asks "what are my options?"
---

# Decide

1. Review the relevant data, issues, code, and git history. Cite each fact
   with a path, line, issue, or commit.
2. Present the real options, numbered. Give each one an effort
   (`Easy` · `Medium` · `Hard`). Label each one **easy to undo** (a two-way
   door) or **hard to undo** (a one-way door).
3. Make one **recommendation**.
4. Name the **ideal fix**. If it differs from the recommendation, say why.
5. Stop and wait for the user to choose. Do not build anything yet.
   No fence yet

## Provenance

- `skills/review-and-recommend/SKILL.md` from kcd-skills
  (github.com/kentcdodds/kcd-skills), MIT, Copyright (c) 2026 Kent C. Dodds.
  The five steps are copied and adapted. Changes: renamed to `decide`.
  Rewrote the description in our plain style. Added "cite each fact" to step 1.
  Explained the door terms as "easy to undo" and "hard to undo". Said "ideal
  fix" in place of "right fix". Split step 5 into two sentences (no semicolon).
  Added the `No fence yet` line.
