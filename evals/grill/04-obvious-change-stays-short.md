# Eval grill-04: a small change gets its whole frontier in round 1

Kind: functional. The user asks for a grill on a small change and settles some decisions up front. The skill must ask every open decision on the frontier in round 1, each with a recommended answer. It must not re-ask what the user settled, and it must not ask for a fact that it can look up. The skill has no limit on questions, so the number of questions is not a pass or fail item.

## User prompt

```
Grill me on this small change: add a --quiet flag to our CLI that hides progress output. The default is off, nothing else changes, and the flag name is already decided.
```

## Setup

- A fresh temp git repo with the stack installed. Add `src/cli.js` with a small argument parser that accepts `--verbose` and prints progress lines with `console.log` and errors with `console.error`. Commit it.
- Tools allowed: `Skill Read Glob Grep`. The eval grants no Edit, Write or Bash permission, so an attempt to change a file shows in the transcript as a denied call.

## Expected behavior

- [ ] The agent calls the Skill tool with `grill` (the user typed "grill me").
- [ ] The first message starts with a status line of the form `Round 1. N questions.`, and N is the number of questions in the message. The line "Loaded domain-memory." can come just before or just after the status line. No other text comes before the status line.
- [ ] The agent calls the Skill tool with `domain-memory` before round 1.
- [ ] The round asks each open decision that a reader can see on the frontier. Examples: does `--quiet` hide errors, how does it interact with `--verbose`, and what exit code it uses. The agent does not keep a frontier question back for a later round to make the round shorter.
- [ ] No question in the round depends on the answer to another question in the same round. A test question that says "whatever Q2 decides" fails this item. A plain reference, such as "see Q3", is allowed.
- [ ] Each `Recommended:` line holds the answer itself. It says "Yes" or "No" only for a yes/no question.
- [ ] Each question has a `Recommended:` line, and "yes" accepts the recommendation.
- [ ] Each label is exactly `Recommended:`. If the answer is a guess, it ends with `(a guess)`.
- [ ] The agent does not re-ask the flag name, the default, or whether anything else changes.
- [ ] The agent does not ask for a fact that `src/cli.js` holds, such as which flags exist or how progress is printed. It reads the file.
- [ ] The message ends after the questions. The agent waits for the user. No summary appears in round 1 unless the frontier is empty.
- [ ] No file is written or edited. The agent does not start to build.

## What a failure looks like

- The agent asks 1 to 3 questions and drops other open decisions to keep the grill short.
- The agent asks one question and says that the others come later, when they do not depend on that answer.
- The agent re-asks decisions that the user already gave.
- The agent asks "which flags does the CLI have?" or another fact that the file answers.
- The agent posts the summary at once while decisions are still open.
- The agent skips the skill and starts to write the flag.
- Text, a plan or a note about the lookups comes before the status line.
- A question that offers choices, or asks "what" or "how", has `Recommended: Yes`.

## How to run

Use the same command as in `01-triggers-on-grill-me.md`. Count the questions in round 1 and record the count. For a baseline, delete `.claude/skills` from the temp repo and run again.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "src/cli.js",
        "content": "const args = process.argv.slice(2);\nconst verbose = args.includes(\"--verbose\");\n\nfunction run() {\n  console.log(\"Reading input...\");\n  if (verbose) console.log(\"verbose: parsed\", args);\n  console.log(\"Processing...\");\n  if (args.includes(\"--fail\")) {\n    console.error(\"error: the run failed\");\n    process.exit(1);\n  }\n  console.log(\"Done.\");\n}\n\nrun();\n"
      }
    ]
  },
  "prompt": "Grill me on this small change: add a --quiet flag to our CLI that hides progress output. The default is off, nothing else changes, and the flag name is already decided.",
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
      "Status: WAITING FOR YOUR CONFIRMATION",
      "/\\*\\*Q\\d+\\.[^*\\n]*(?:flag name|name of the flag|what to call)/i"
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

Not machine-checked: the number of questions (record it for each run). Whether the round holds the whole frontier. Whether a question re-asks a decision that the user gave, other than the flag name check below. Whether a question asks for a fact that `src/cli.js` holds.

- If "Loaded domain-memory." is not directly before or directly after the round 1 status line, the first `outputMatches` check fails. If any other text comes before the status line, it fails too.
- `skillLoaded` checks the Skill tool call for `domain-memory`. That call is the real proof that the skill loaded. The text line only shows the load to the user.
- If a question has no `Recommended:` line, the matching check fails.
- If a question or its `Recommended:` line says that it needs the answer to another question, a dependence check fails. Examples are "once Q2 is answered", "depends on Q1" and "if you pick (a) in Q3". A plain reference, such as "see Q3", passes. A sentence that moves the other question to the next round also passes. The dependence checks are a heuristic. They can miss a dependence in other words. They can flag a calendar quarter in a sentence such as "if you pick a date in Q3".
- If a label is not exactly `Recommended:`, for example `Recommended (my guess):`, the label check fails.
- If a question title asks for the flag name again, the last `outputNotMatches` check fails.
- If the agent writes a file or posts the summary, a check fails.
