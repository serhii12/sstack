# Eval grill-05: the grill settles the essentials, so /spec writes a spec

Kind: functional, hand-off. A small feature grill must settle everything that `spec` needs. Then `/spec` must write the spec from the conversation, and its open questions must not hold an essential.

## User prompt

A grill is a conversation. The runner runs it as one session: it runs turn 1, then each next turn with `--resume`. Turn 1 gives the user's answers up front.

1. `Grill me on a feature for our notes app: a Copy link button on the shared note page. Here are my answers to what you will ask. Problem: people copy the note URL by hand from the address bar and often paste a wrong one. Who it is for: team members who share notes. In scope: a button on the note page that copies the note's public URL. Out of scope: email sharing and link expiry. Behavior: a click copies the URL and the button text becomes Copied for 2 seconds. When the note is private the button is not shown. Tests: check the HTML that renderNotePage returns in src/notes-page.js, next to the existing test. Ask me about anything that is still open. I do not confirm yet.`
   Turn 1 must not tell the agent to post the summary. The user can end the questions at any time, so "post the summary" ends them. Then the open decisions go under "Still open", and the spec lists them as open questions. That is correct grill behavior, and this eval does not test it. Eval 06 tests it.
2. `Yes to every recommended answer. If you have no more questions, post the summary now.`
3. `If the summary is already above, post it again unchanged. If not, I say yes to every recommended answer. Post the summary now.` Turn 2 can ask one more round. Turn 3 makes sure that the last message before the confirm holds the summary.
4. `confirm`
5. `/spec`
6. `Yes, they match.` After `/spec`, the agent first shows the test boundaries and asks if they match, as Matt Pocock's `to-spec` does. Turn 6 answers that check.

## Setup

- A fresh temp git repo with the stack installed (`node scripts/install.mjs <dir>`). Add `src/notes-page.js` with `renderNotePage(note)` that returns `<h1>title</h1><p>body</p>`. Add `tests/notes-page.test.js` with one `node:test` test of it. Commit both.
- No `docs/agents/tracker.md`, so `spec` must use `.scratch/<feature>/spec.md`.
- Tools allowed: `Skill Read Glob Grep Edit(.scratch/**)`. In a headless run the rule `Write(.scratch/**)` is not matched. Only `Edit(.scratch/**)` allows the Write tool. The eval allows no Bash and no worktree tool, so the spec must be in `.scratch/` of the temp repo.

## Expected behavior

- [ ] Turn 1 and the following turns load `grill`. The agent does not ask again for what the user gave in turn 1. It asks about what is still open.
- [ ] The conversation settles all the essentials: problem, who it is for, in scope, out of scope, user-visible behavior with the private-note case, and test boundaries.
- [ ] The summary has `Status: WAITING FOR YOUR CONFIRMATION`. After `confirm`, the agent replies `Status: CONFIRMED by the user`.
- [ ] After `/spec`, the agent shows the test boundaries and asks if they match. It writes no file in turn 5.
- [ ] After the yes in turn 6, the agent writes one file, `.scratch/<feature>/spec.md`, with `Status: draft`.
- [ ] The spec does not refuse. It has no "Spec not written" reply.
- [ ] The spec keeps the facts: the button text Copied, the 2 seconds and no button on a private note. It keeps the test boundary, the HTML that the page renderer returns. Email sharing and link expiry are out of scope. The spec skill allows no code names, so `renderNotePage` does not appear.
- [ ] The Open questions section of the spec holds none of the six essentials. It says "None", or it lists only decisions that are not essential.

## What a failure looks like

- The agent writes the summary or the spec without a test boundary, a scope limit or the user-visible behavior. The spec then lists an essential under Open questions, or it does not get written.
- The agent re-asks the problem or the scope that the user gave in turn 1.
- The agent runs `/spec` and writes the spec before the user confirms.

## How to run

```
node scripts/eval-run.mjs --eval grill/05-summary-feeds-spec.md --models opus,sonnet --jobs 2
```

The runner makes the temp repo, runs the six turns and checks the block below. Read the transcript of every turn for the items that no check can see. Run this eval twice.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "src/notes-page.js",
        "content": "export function renderNotePage(note) {\n  return `<h1>${note.title}</h1><p>${note.body}</p>`;\n}\n"
      },
      {
        "path": "tests/notes-page.test.js",
        "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { renderNotePage } from \"../src/notes-page.js\";\n\ntest(\"renders title and body\", () => {\n  assert.equal(renderNotePage({ title: \"A\", body: \"B\" }), \"<h1>A</h1><p>B</p>\");\n});\n"
      }
    ]
  },
  "prompt": "Grill me on a feature for our notes app: a Copy link button on the shared note page. Here are my answers to what you will ask. Problem: people copy the note URL by hand from the address bar and often paste a wrong one. Who it is for: team members who share notes. In scope: a button on the note page that copies the note's public URL. Out of scope: email sharing and link expiry. Behavior: a click copies the URL and the button text becomes Copied for 2 seconds. When the note is private the button is not shown. Tests: check the HTML that renderNotePage returns in src/notes-page.js, next to the existing test. Ask me about anything that is still open. I do not confirm yet.",
  "turns": [
    "Yes to every recommended answer. If you have no more questions, post the summary now.",
    "If the summary is already above, post it again unchanged. If not, I say yes to every recommended answer. Post the summary now.",
    "confirm",
    "/spec",
    "Yes, they match."
  ],
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep",
    "Edit(.scratch/**)"
  ],
  "budgetUsd": 1.5,
  "assert": {
    "skillLoaded": [
      {
        "name": "grill",
        "turn": 1
      },
      {
        "name": "domain-memory",
        "turn": 1
      },
      {
        "name": "spec",
        "turn": 5
      }
    ],
    "outputMatches": [
      {
        "pattern": "/^\\s*(?:Loaded domain-memory\\.\\s+(?:Round 1\\. [0-9]+ questions?\\.|## Grill summary)|Round 1\\. [0-9]+ questions?\\.\\s+Loaded domain-memory\\.)/",
        "turn": 1
      },
      {
        "pattern": "Status: WAITING FOR YOUR CONFIRMATION",
        "turn": 3
      },
      {
        "pattern": "Status: CONFIRMED by the user",
        "turn": 4
      }
    ],
    "outputNotMatches": [
      "/\\*\\*Q\\d+\\.(?:(?!Recommended:)[^])*?(?=\\*\\*Q\\d+\\.|$)/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended\\b)[^])*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/Recommended\\b[^\\n]*?(?:\\b(?:once|after|until|when|before)\\s+you\\s+(?:answer|settle|decide|pick|choose)\\b[^.?!\\n]{0,20}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?:\\s*(?:,|and|or|&)\\s*(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))*\\s+(?:is|are|gets?|has|have)\\s+(?:been\\s+)?(?:answered|settled|decided|resolved|closed|chosen)|(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:decides|settles|determines|picks|chooses)\\b|\\bdepend\\w*\\s+(?:on|upon)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\bif\\b[^.?!\\n]{0,60}?\\b(?:pick|picks|choose|chooses|select|answer|say|go with|take)\\b[^.?!\\n]{0,30}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\bif\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:is|=|goes|lands|picks|comes)\\b|\\b(?:whatever|whichever|however)\\b[^.?!\\n]{0,40}?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|(?:\\bbased on|\\bgiven|\\bassuming|\\bper|\\bsubject to|(?<!(?:covered|listed|asked|discussed)\\s)\\bunder)\\s+(?:(?:the|your)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on)\\s+)?(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)(?=\\s*(?:[(),.:;?!\\n]|$)|\\s+(?:and|or|is|are)\\b)|\\b(?:answers?|choices?|decisions?|picks?|outcomes?)\\s+(?:to|in|for|of|on|from)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)|\\b(?:the|that|your)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b)\\s+(?:answers?|choices?|decisions?|picks?|outcomes?|results?|limits?|values?|numbers?|caps?|definitions?|dates?)\\b|\\b(?:decides|determines|settles|affects|shapes|drives|changes)\\b[^.?!\\n]{0,120}?\\bthe\\s+(?:[\\w-]+\\s+){0,3}(?:in|from|of)\\s+(?:Q\\d+\\b(?!\\s+20\\d\\d)|question \\d+\\b))(?![^.?!\\n]*\\b(?:next|later) round)/i",
      "/\\bRecommended\\s*[(\\[]/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?\\n\\s*(?:What|Which|How|Who|Why)\\b(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/\\*\\*Q\\d+\\.(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*?(?:\\n\\s*(?:\\(?[a-d][.)]|\\d[.)])\\s|Option [A-D])(?:(?!\\*\\*Q\\d+\\.|Recommended:)[^])*Recommended:\\s*\\**\\s*(?:Yes|No)\\b/",
      "/\\*\\*Q\\d+\\.[^*\\n]*(?:who it is for|out of scope|what problem|button text after (?:a |the )?click)/i",
      {
        "pattern": "Status: CONFIRMED",
        "turn": 1
      },
      {
        "pattern": "Status: CONFIRMED",
        "turn": 2
      },
      {
        "pattern": "Status: CONFIRMED",
        "turn": 3
      },
      {
        "pattern": "Spec not written",
        "turn": 6
      },
      {
        "pattern": "Missing from the spec",
        "turn": 6
      }
    ],
    "toolNotCalled": [
      {
        "name": "Write",
        "inputMatches": "\\.scratch",
        "turn": 1
      },
      {
        "name": "Edit",
        "inputMatches": "\\.scratch",
        "turn": 1
      },
      {
        "name": "Write",
        "inputMatches": "\\.scratch",
        "turn": 2
      },
      {
        "name": "Edit",
        "inputMatches": "\\.scratch",
        "turn": 2
      },
      {
        "name": "Write",
        "inputMatches": "\\.scratch",
        "turn": 3
      },
      {
        "name": "Edit",
        "inputMatches": "\\.scratch",
        "turn": 3
      },
      {
        "name": "Write",
        "inputMatches": "\\.scratch",
        "turn": 4
      },
      {
        "name": "Edit",
        "inputMatches": "\\.scratch",
        "turn": 4
      },
      {
        "name": "Write",
        "inputMatches": "\\.scratch",
        "turn": 5
      },
      {
        "name": "Edit",
        "inputMatches": "\\.scratch",
        "turn": 5
      }
    ],
    "fileMatches": [
      {
        "path": ".scratch/*/spec.md",
        "pattern": "Status: draft"
      },
      {
        "path": ".scratch/*/spec.md",
        "pattern": "\\bCopied\\b"
      },
      {
        "path": ".scratch/*/spec.md",
        "pattern": "/\\b(?:2|two) seconds\\b/i"
      },
      {
        "path": ".scratch/*/spec.md",
        "pattern": "/\\bprivate\\b/i"
      },
      {
        "path": ".scratch/*/spec.md",
        "pattern": "/\\bemail\\b/i"
      },
      {
        "path": ".scratch/*/spec.md",
        "pattern": "/\\bexpir/i"
      }
    ],
    "fileNotMatches": [
      {
        "path": ".scratch/*/spec.md",
        "pattern": "renderNotePage"
      }
    ],
    "onlyFilesChanged": [
      ".scratch/**"
    ]
  }
}
```

Machine-checked:

- Turn 1 loads `grill` and `domain-memory`. Its text starts with "Loaded domain-memory." and the round 1 status line, or with the summary.
- Turn 3 holds the summary with `Status: WAITING FOR YOUR CONFIRMATION`. Turn 4 says `Status: CONFIRMED by the user`. Turns 1 to 3 do not.
- No Write or Edit call on `.scratch` comes before turn 6. Turn 5 is the boundary check of `spec`. Only files under `.scratch/` change.
- After `/spec`, `.scratch/<feature>/spec.md` exists with `Status: draft`, the word Copied, the 2 seconds, the private note, email sharing and link expiry. It does not name `renderNotePage`.
- Turn 5 has no "Spec not written" and no "Missing from the spec" line. The spec skill starts its reply with that line when an essential is missing.

Not machine-checked: whether the Open questions section holds an essential in other words. Whether the spec keeps the test boundary. Whether a round asks only what is open.

- The dependence checks and the label check are the same as before. They see the text of all turns.
- If a question or its `Recommended:` line says that it needs the answer to another question, a dependence check fails. Examples are "once Q2 is answered", "depends on Q1" and "if you pick (a) in Q3". A plain reference, such as "see Q3", passes. A sentence that moves the other question to the next round also passes. The dependence checks are a heuristic. They can miss a dependence in other words. They can flag a calendar quarter in a sentence such as "if you pick a date in Q3".
- If a label is not exactly `Recommended:`, for example `Recommended (my guess):`, the label check fails.
- If a question title asks again for what the user gave, the last `outputNotMatches` pattern without a turn fails. This check is a heuristic. It flags "button text after a click" and does not flag "button text" alone. The user gave only the text after a click, so the resting text and a second click are open decisions.
