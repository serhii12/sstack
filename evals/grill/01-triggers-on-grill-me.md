# Eval grill-01: triggers on "grill me"

Kind: triggering. The skill must load and run its round format.

## User prompt

```
Grill me on this plan: next quarter we want to move our SaaS app from flat pricing to per-seat pricing.
```

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). No other project files. The subject is a business decision, so the skill needs no repo content.
- Tools allowed: `Skill Read Glob Grep`. The eval grants no Edit, Write or Bash permission, so any attempt to change a file shows in the transcript as a denied call.

## Expected behavior

- [ ] The agent calls the Skill tool with `grill`, or its first message clearly follows the grill format (see the next items).
- [ ] The first message starts with a status line of the form `Round 1. N questions.`, and N is the number of questions in the message.
- [ ] The agent calls the Skill tool with `domain-memory` before round 1. This setup is a project repo. The round 1 message has the line "Loaded domain-memory." just before or just after the status line. No other text comes before the status line.
- [ ] Each `Recommended:` line holds the answer itself. It says "Yes" or "No" only for a yes/no question.
- [ ] Each question is numbered `Q1`, `Q2` and so on, has a short title, and ends with a `Recommended:` line.
- [ ] Each label is exactly `Recommended:`. If the answer is a guess, it ends with `(a guess)`.
- [ ] The questions are about decisions (for example who pays, migration, grandfathering). No question asks for a fact that a tool can find.
- [ ] The round asks the whole frontier. No question in it depends on the answer to another question in the same round. A plain reference, such as "see Q3", is allowed.
- [ ] The message ends after the questions. The agent waits for the user and does not answer its own questions.
- [ ] No file is written or edited. No summary with `Status: WAITING FOR YOUR CONFIRMATION` appears yet, because the grill has just started.

## What a failure looks like

- The agent writes a pricing plan, spec or tickets without asking questions.
- The agent asks questions as one unnumbered list, or with no `Recommended:` lines, or with no round status line. This usually means the skill did not load.
- The agent asks one or two questions and keeps other frontier questions back for later rounds.
- The agent puts a question in round 1 that needs the answer to another round 1 question.
- The agent answers its own questions and moves on.
- The agent tries to write a file (a denied Write or Edit call in the transcript).
- Text, a plan or a note about the lookups comes before the status line.
- The round 1 message has no line "Loaded domain-memory.".
- A label other than `Recommended:`, for example `Recommended (my guess):`.
- A question that offers choices, or asks "what" or "how", has `Recommended: Yes`.

## How to run

```
cd "$(mktemp -d)" && git init -q && git commit -q --allow-empty -m init
node <stack>/scripts/install.mjs "$PWD"   # then add the setup files and commit them
claude -p "<user prompt>" --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format stream-json --verbose --no-session-persistence --max-budget-usd 1 \
  --allowedTools <tools above> </dev/null
```

Read the transcript. Mark each expected behavior pass or fail. For a baseline, delete `.claude/skills` from the temp repo and run again.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true
  },
  "prompt": "Grill me on this plan: next quarter we want to move our SaaS app from flat pricing to per-seat pricing.",
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
      "/\\*\\*Q2\\./"
    ],
    "outputNotMatches": [
      "/\\*\\*Q\\d+\\.(?:(?!Recommended:)[^])*?(?=\\*\\*Q\\d+\\.|$)/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended\\b)[^])*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/Recommended\\b[^\\n]*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/\\bRecommended\\s*[(\\[]/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?\\n\\s*(?:What|Which|How|Who|Why)\\b(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?(?:\\n\\s*(?:\\(?[a-d][.)]|\\d[.)])\\s|Option [A-D])(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "Status: WAITING FOR YOUR CONFIRMATION",
      "Status: CONFIRMED"
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

Not machine-checked: whether the questions are good decisions and not facts. Whether the round holds the whole frontier. Whether N in the status line equals the number of questions. Whether a question depends on another one in words that the dependence checks miss. Whether the agent answers its own questions.

- If the line "Loaded domain-memory." is not directly before or directly after the round 1 status line, the first `outputMatches` check fails. If any other text comes before the status line, it fails too.
- `skillLoaded` checks the Skill tool call for `domain-memory`. That call is the real proof that the skill loaded. The text line only shows the load to the user.
- If a question has no `Recommended:` line, the second check fails.
- If a question or its `Recommended:` line says that it needs the answer to another question, a dependence check fails. Examples are "once Q2 is answered", "depends on Q1" and "if you pick (a) in Q3". A plain reference, such as "see Q3", passes. A sentence that moves the other question to the next round also passes. The dependence checks are a heuristic. They can miss a dependence in other words. They can flag a calendar quarter in a sentence such as "if you pick a date in Q3".
- If a label is not exactly `Recommended:`, for example `Recommended (my guess):`, the label check fails.
- If a choice question says `Recommended: Yes`, the choice check fails. This check is a heuristic.
- If the agent writes or edits a file, `toolNotCalled` and `noRepoChanges` fail.
