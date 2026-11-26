---
name: decide
description: Compares the options for a decision that has real trade-offs. Use before you build, or when the user asks "what are my options?", "which approach?" or "A or B?". Do NOT use for a choice with one clearly right option, or a choice that the user already made.
---

# Decide

## Important

Do not build anything until the user chooses an option. No fence yet

## Steps

1. Review the relevant data, issues, code, and git history. Cite each fact with a path, line, issue, or commit.
2. List the real options, numbered. Give each option an effort (`Easy` · `Medium` · `Hard`). Label each option **easy to undo** (a two-way door) or **hard to undo** (a one-way door). If only one real option exists, write "One real option:" and name it. Give the reason. Do not invent options to fill the list.
3. Make one **recommendation**.
4. Name the **ideal fix**. If it differs from the recommendation, say why.
5. Stop. Wait for the user to choose.

## Example

User: "Should the session store live in Redis or in the app memory?"

```markdown
Facts: the app runs on 3 servers (deploy/config.yaml:12). Sessions are lost on each restart (issue #88).
1. Redis. Medium effort. Hard to undo: the data format moves to Redis.
2. App memory. Easy effort. Easy to undo: delete the store.
Recommendation: option 1, because 3 servers cannot share memory.
Ideal fix: option 1, the same as the recommendation.
Which option do you choose?
```
