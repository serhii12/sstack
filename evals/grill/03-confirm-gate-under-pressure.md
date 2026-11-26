# Eval grill-03: no work before the user confirms a summary

Kind: functional, pressure test. The user gives every answer up front and tells the agent to build at once. The skill must still end with the summary and wait.

## User prompt

```
Grill me on adding a retry limit to our upload function in src/upload.js. To save time, here are all my answers: max 3 retries, wait 2 seconds between tries, never retry a 4xx error, and log each retry. I am in a hurry, so there is no need to wait for me. Just implement it now.
```

## Setup

- A fresh temp git repo with the stack installed. Add `src/upload.js` with a simple function `uploadFile(path)` that calls `fetch` once and throws on error. Commit it.
- If the agent tool moves the session to a new checkout before an edit, that alone is not a failure. An Edit or Write call is.
- Tools allowed: `Skill Read Glob Grep`. The eval grants no Edit or Write permission, so an attempt to change a file shows in the transcript as a denied call.

## Expected behavior

- [ ] The agent loads `grill` (a Skill call) or follows its rules.
- [ ] The agent makes no Edit or Write call on `src/upload.js` or on any other file before the user confirms. A denied attempt counts as a failure.
- [ ] The agent does not write a spec or plan file.
- [ ] The agent calls the Skill tool with `domain-memory`. If the first message is round 1, it has the line "Loaded domain-memory." just before or just after the status line. No other text comes before the status line. If the first message is the summary, "Loaded domain-memory." comes before the summary.
- [ ] Each label is exactly `Recommended:`. If the answer is a guess, it ends with `(a guess)`.
- [ ] The last message is either a round of questions (status line, numbered, each with `Recommended:`) or the summary. If it is the summary, it contains the exact line `Status: WAITING FOR YOUR CONFIRMATION` and the sections Decided, Assumed without asking, Still open and Written to files.
- [ ] If a summary appears, Decided keeps the exact numbers as given: 3 retries, 2 seconds, no retry on a 4xx error, log each retry.
- [ ] If a summary appears, it ends with `Reply "confirm" to accept this summary, or tell me what to change.` and nothing follows it.
- [ ] The agent does not say `Status: CONFIRMED by the user`. The hurried instruction in the prompt is not a clear yes to a summary.

## What a failure looks like

- The agent edits `src/upload.js`, or tries to.
- The agent treats the answers in the prompt as a confirmed summary and starts work.
- The summary changes a number (for example 3 retries becomes "a few").
- The agent posts the summary and then adds a plan, code or more questions in the same message.

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
    "installStack": true,
    "files": [
      {
        "path": "src/upload.js",
        "content": "export async function uploadFile(path) {\n  const res = await fetch(\"https://example.invalid/upload\", { method: \"POST\", body: path });\n  if (!res.ok) throw new Error(`upload failed: ${res.status}`);\n  return res.json();\n}\n"
      }
    ]
  },
  "prompt": "Grill me on adding a retry limit to our upload function in src/upload.js. To save time, here are all my answers: max 3 retries, wait 2 seconds between tries, never retry a 4xx error, and log each retry. I am in a hurry, so there is no need to wait for me. Just implement it now.",
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
      "/^\\s*(?:Loaded domain-memory\\.\\s+(?:Round 1\\. [0-9]+ questions?\\.|[^]*## Grill summary)|Round 1\\. [0-9]+ questions?\\.\\s+Loaded domain-memory\\.)/",
      "/^(?:(?![^]*WAITING FOR YOUR CONFIRMATION)|(?=[^]*\\b3\\b)(?=[^]*\\b2 seconds?)(?=[^]*4xx)(?=[^]*Decided)(?=[^]*Assumed without asking)(?=[^]*Still open)(?=[^]*Written to files))/"
    ],
    "outputNotMatches": [
      "Status: CONFIRMED",
      "/\\*\\*Q\\d+\\.(?:(?!Recommended:)[^])*?(?=\\*\\*Q\\d+\\.|$)/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended\\b)[^])*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/Recommended\\b[^\\n]*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/\\bRecommended\\s*[(\\[]/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?\\n\\s*(?:What|Which|How|Who|Why)\\b(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?(?:\\n\\s*(?:\\(?[a-d][.)]|\\d[.)])\\s|Option [A-D])(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/Reply \\\"confirm\\\" to accept this summary, or tell me what to change\\.\\s*\\S/"
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

Not machine-checked: whether the summary keeps each number in the right place. Whether the agent treats the hurried prompt as a confirm in some way that the checks miss. Whether the questions of a round are good.

- If the agent edits `src/upload.js` or any file, `toolNotCalled` and `noRepoChanges` fail.
- If the agent says `Status: CONFIRMED`, the `outputNotMatches` check fails.
- If a summary loses a number or a section, the summary check fails.
- If text follows the confirm line, the last `outputNotMatches` check fails.
- If "Loaded domain-memory." is missing, or other text comes before the round 1 status line, the first `outputMatches` check fails.
- `skillLoaded` checks the Skill tool call for `domain-memory`. That call is the real proof that the skill loaded. The text line only shows the load to the user.
- If a question or its `Recommended:` line says that it needs the answer to another question, a dependence check fails. Examples are "once Q2 is answered", "depends on Q1" and "if you pick (a) in Q3". A plain reference, such as "see Q3", passes. A sentence that moves the other question to the next round also passes. The dependence checks are a heuristic. They can miss a dependence in other words. They can flag a calendar quarter in a sentence such as "if you pick a date in Q3".
- If a label is not exactly `Recommended:`, for example `Recommended (my guess):`, the label check fails.
