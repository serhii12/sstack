# Eval grill-07: loads domain-memory before round 1 in a project repo

Kind: functional. When a grill runs inside a project repo, the agent loads `domain-memory` before round 1. The round 1 message shows the line "Loaded domain-memory." just before or just after the status line. The agent does this every time. It does not wait for a new term to appear. Matt Pocock's `grill-with-docs` loads both skills at the start in the same way.

## User prompt

```
Grill me on this plan: we want to let a Customer pause a Subscription for up to 3 months. Today src/subscriptions.js only has cancelSubscription.
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). Add `GLOSSARY.md` with the terms Subscription and Customer. Add `src/subscriptions.js` with `cancelSubscription`. Commit them.
- Tools allowed: `Skill Read Glob Grep`. The eval grants no Edit or Write permission.

## Expected behavior

- [ ] The agent calls the Skill tool with `grill` and with `domain-memory`, in this order, before it asks round 1.
- [ ] The round 1 message has the line "Loaded domain-memory." just before or just after the status line `Round 1. N questions.` No other text comes before the status line. The order of these two lines does not matter.
- [ ] Each question has a `Recommended:` line.
- [ ] Each label is exactly `Recommended:`. If the answer is a guess, it ends with `(a guess)`.
- [ ] No question needs the answer to another question of round 1. A plain reference, such as "see Q3", is allowed.
- [ ] The agent loads `domain-memory` at once. It does not wait until the user uses a new term.
- [ ] No file is written or edited.

## What a failure looks like

- The agent asks round 1 and does not load `domain-memory`.
- The agent loads `domain-memory` only in a later round.
- The agent says "Loaded domain-memory." and has not called the Skill tool.
- Other text comes before the status line.
- The round 1 message has no line "Loaded domain-memory."
- The agent writes `GLOSSARY.md` or a decision record before the user settles a term.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "src/subscriptions.js",
        "content": "export function cancelSubscription(customerId) {\n  return { customerId, status: \"cancelled\" };\n}\n"
      },
      {
        "path": "GLOSSARY.md",
        "content": "# Billing\n\nHandles customer subscriptions.\n\n## Language\n\n**Subscription**:\nA recurring plan that a **Customer** pays for.\n_Avoid_: Plan\n\n**Customer**:\nA person or organization that holds a **Subscription**.\n_Avoid_: User, client\n"
      }
    ]
  },
  "prompt": "Grill me on this plan: we want to let a Customer pause a Subscription for up to 3 months. Today src/subscriptions.js only has cancelSubscription.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1.5,
  "assert": {
    "skillLoaded": [
      "grill",
      "domain-memory"
    ],
    "outputMatches": [
      "/^\\s*(?:Loaded domain-memory\\.\\s+Round 1\\. [0-9]+ questions?\\.|Round 1\\. [0-9]+ questions?\\.\\s+Loaded domain-memory\\.)/",
      "/\\*\\*Q1\\./"
    ],
    "outputNotMatches": [
      "/\\*\\*Q\\d+\\.(?:(?!Recommended:)[^])*?(?=\\*\\*Q\\d+\\.|$)/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended\\b)[^])*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/Recommended\\b[^\\n]*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/\\bRecommended\\s*[(\\[]/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?\\n\\s*(?:What|Which|How|Who|Why)\\b(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?(?:\\n\\s*(?:\\(?[a-d][.)]|\\d[.)])\\s|Option [A-D])(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "Status: WAITING FOR YOUR CONFIRMATION"
    ],
    "toolNotCalled": [
      {
        "name": "Write"
      },
      {
        "name": "Edit"
      }
    ],
    "noRepoChanges": true
  }
}
```

Not machine-checked: the order of the two Skill calls, because the runner cannot compare the order of tool calls. `skillLoaded` checks the Skill tool call for `domain-memory`. That call is the real proof that the skill loaded. The text check proves only that the user can see the line next to the round 1 status line. Read the transcript for the order of the two Skill calls.

- If the agent does not load `domain-memory`, `skillLoaded` and the first `outputMatches` check fail.
- If other text comes before the status line, or the line "Loaded domain-memory." is not directly before or directly after it, the first `outputMatches` check fails.
- If a question or its `Recommended:` line says that it needs the answer to another question, a dependence check fails. Examples are "once Q2 is answered", "depends on Q1" and "if you pick (a) in Q3". A plain reference, such as "see Q3", passes. A sentence that moves the other question to the next round also passes. The dependence checks are a heuristic. They can miss a dependence in other words. They can flag a calendar quarter in a sentence such as "if you pick a date in Q3".
- If a label is not exactly `Recommended:`, for example `Recommended (my guess):`, the label check fails.
