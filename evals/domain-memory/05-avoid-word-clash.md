# Eval domain-memory-05: a word on an Avoid line is a clash

Kind: functional. The user gives a new meaning to a word that the glossary lists under `_Avoid_`, and asks to record it. The skill must name the clash and ask before it changes the glossary. This is one push back. If the user confirms, the agent writes the change.

## User prompt

```
When I say "account" I mean the company that pays the bill. The person who logs in is the "customer". Please record that in the glossary.
```

## Setup

- A fresh temp git repo with the stack installed.
- Replace `GLOSSARY.md` in the repo root with:

```md
# Billing

Sends invoices to the people who buy from us.

## Language

**Customer**:
A person who places an **Order**.
_Avoid_: account, client, user

**Order**:
A request from a **Customer** for goods.
_Avoid_: purchase
```

- Tools allowed: `Skill Read Glob Grep Edit Write`. The edit tools are allowed, so a wrong edit can happen and shows in the transcript.

## Expected behavior

- [ ] The agent calls the Skill tool with `domain-memory`.
- [ ] The reply says that the glossary lists "account" as a word to avoid for the term Customer.
- [ ] The reply asks the user a question about the clash. An example: "Do you want Account as a new term, with 'account' off the avoid line?"
- [ ] The agent makes no edit to `GLOSSARY.md` in this reply.

## What a failure looks like

- The agent adds an Account term or changes the Customer entry before it asks. A live run on 25 Nov 2026 did this: "I took 'account' off its avoid list, because Account is now its own term."
- The agent asks follow-up questions about the new term, but does not name the avoid line.

## Checks

The installed `AGENTS.md` can make the agent work in a new worktree, so the root file does not show every edit. The `toolNotCalled` checks see an edit in any folder.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Billing\n\nSends invoices to the people who buy from us.\n\n## Language\n\n**Customer**:\nA person who places an **Order**.\n_Avoid_: account, client, user\n\n**Order**:\nA request from a **Customer** for goods.\n_Avoid_: purchase\n" }
    ]
  },
  "prompt": "When I say \"account\" I mean the company that pays the bill. The person who logs in is the \"customer\". Please record that in the glossary.",
  "allowedTools": ["Skill", "Read", "Glob", "Grep", "Edit", "Write"],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": ["domain-memory"],
    "toolNotCalled": [
      { "name": "Edit", "inputMatches": "GLOSSARY\\.md" },
      { "name": "Write", "inputMatches": "GLOSSARY\\.md" }
    ],
    "fileMatches": [
      { "path": "GLOSSARY.md", "pattern": "_Avoid_: account, client, user" }
    ],
    "outputMatches": [
      "/avoid/i",
      "\\?"
    ]
  }
}
```

What each check catches:

- An edit of `GLOSSARY.md` in any folder fails the `toolNotCalled` checks.
- A changed avoid line in the root file fails `fileMatches`.
- A reply that does not name the avoid line, or asks no question, fails `outputMatches`.

Not machine-checked: whether the question is about the clash, and not about some other detail of the new term.
