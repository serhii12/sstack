# Eval smoke/02: multi-turn run keeps the session

This eval checks the `turns` field of the runner. Turn 2 must resume the session of turn 1 in the same temp repo. It is cheap.

## Prompt

```
Remember the code word BLUEBIRD. Reply with the word OK and nothing else.
```

Follow-up turn: `What was the code word? Reply with the word only.`

## Setup

- A fresh git repo with one `README.md`. The stack is not installed.
- Allowed tools: `Read`.

## Expected behaviors

- [ ] Turn 1 replies OK.
- [ ] Turn 2 names the code word. This proves that the runner resumed the same session.
- [ ] The agent makes no change in the repo.

## Failure looks like

- Turn 2 does not know the code word. The runner started a new session.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "files": [{ "path": "README.md", "content": "# demo\n" }]
  },
  "prompt": "Remember the code word BLUEBIRD. Reply with the word OK and nothing else.",
  "turns": ["What was the code word? Reply with the word only."],
  "allowedTools": ["Read"],
  "budgetUsd": 0.3,
  "assert": {
    "outputMatches": [{ "pattern": "OK", "turn": 1 }, { "pattern": "BLUEBIRD", "turn": 2 }],
    "noRepoChanges": true
  }
}
```
