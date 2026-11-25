# Eval test-craft/02: a config-only change

## Prompt

```
Change the retries value in config/app.json from 3 to 5. How should I test this change?
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit with these files:
  - `config/app.json` with `{ "retries": 3, "timeoutMs": 2000 }`.
  - `src/app.mjs` that reads `config/app.json` and prints `retries=<value>`.
- Allowed tools: `Read`, `Grep`, `Glob`, `Edit`, `Skill`, `Bash(node src/app.mjs:*)`.

## Expected behaviors

- [ ] The agent changes `retries` to 5 in `config/app.json` and changes nothing else.
- [ ] The agent loads the `test-craft` skill, because the user asks how to test the change.
- [ ] The agent says that no unit test is needed, with the reason: such a test only restates the config.
- [ ] The agent runs `node src/app.mjs` and shows the output `retries=5` as proof.
- [ ] The agent creates no test file.
- [ ] The answer follows the config row of the table in section 2 of the skill.

## Failure looks like

- The agent writes a test that reads the config and checks that `retries` is 5.
- The agent proposes test boundaries and waits for the user.
- The agent makes the change and shows no proof.
- The agent never loads the skill and answers in free form.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "chore/retries",
    "files": [
      {
        "path": "config/app.json",
        "content": "{ \"retries\": 3, \"timeoutMs\": 2000 }\n"
      },
      {
        "path": "src/app.mjs",
        "content": "import { readFileSync } from \"node:fs\";\n\nconst config = JSON.parse(readFileSync(new URL(\"../config/app.json\", import.meta.url), \"utf8\"));\nconsole.log(`retries=${config.retries}`);\n"
      }
    ]
  },
  "prompt": "Change the retries value in config/app.json from 3 to 5. How should I test this change?",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Skill",
    "Bash(node src/app.mjs:*)"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillLoaded": [
      "test-craft"
    ],
    "toolCalled": [
      {
        "name": "Edit",
        "inputMatches": "config/app\\.json"
      },
      {
        "name": "Bash",
        "inputMatches": "node src/app\\.mjs"
      }
    ],
    "fileMatches": [
      {
        "path": "config/app.json",
        "pattern": "\"retries\": 5"
      },
      {
        "path": "config/app.json",
        "pattern": "\"timeoutMs\": 2000"
      },
      {
        "path": "src/app.mjs",
        "pattern": "retries=\\$\\{config\\.retries\\}"
      }
    ],
    "fileAbsent": [
      "test",
      "tests",
      "src/app.test.mjs",
      "config/app.test.mjs"
    ],
    "outputMatches": [
      "retries=5",
      "/(wouldn't|would not|do not|don't|does not|doesn't|not|no|without|skip)[^\\n]{0,40}\\b(add|write|writing|need|require|recommend|useful|worth|necessary)[^\\n]{0,40}\\btests?\\b|\\bno (unit |automated )?tests?\\b/i",
      "/restat|repeat|mirror|copy|duplicat|same (value|thing)|tautolog|echo/i"
    ]
  }
}
```

Not machine-checked: that the reasoning follows the config row of the table in section 2. Also, that the agent does not stop to propose test boundaries. A test file with another name is not caught.
