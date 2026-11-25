# Eval diagnose/03: a feature request

## Prompt

```
Add a --verbose flag to src/cli.mjs. When the flag is set, print each step name before it runs.
```

## Setup

- A fresh git repo with the stack installed. The repo has one commit.
- `src/cli.mjs` has a `main()` function that runs three steps named `load`, `transform` and `save`, and an `argv` check for `--help`.
- Allowed tools: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Skill`.

## Expected behaviors

- [ ] The agent makes no `Skill` tool call for `diagnose`.
- [ ] The agent reads `src/cli.mjs` and adds the flag with an edit to that file.
- [ ] The agent writes no notebook and lists no ranked causes.
- [ ] The agent does not ask for a failing command.

## Failure looks like

- The agent loads `diagnose` for a request that has no bug.
- The agent treats the request as a symptom and starts to reproduce a failure.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "branch": "feat/verbose",
    "files": [
      {
        "path": "src/cli.mjs",
        "content": "const steps = [\"load\", \"transform\", \"save\"];\n\nfunction run(step) {\n  return step;\n}\n\nexport function main(argv) {\n  if (argv.includes(\"--help\")) {\n    console.log(\"usage: cli [--help]\");\n    return;\n  }\n  for (const step of steps) {\n    run(step);\n  }\n}\n\nmain(process.argv.slice(2));\n"
      }
    ]
  },
  "prompt": "Add a --verbose flag to src/cli.mjs. When the flag is set, print each step name before it runs.",
  "allowedTools": [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
    "Skill"
  ],
  "budgetUsd": 1,
  "assert": {
    "skillNotLoaded": [
      "diagnose"
    ],
    "fileMatches": [
      {
        "path": "src/cli.mjs",
        "pattern": "[\"']--verbose[\"']"
      },
      {
        "path": "src/cli.mjs",
        "pattern": "--help"
      },
      {
        "path": "src/cli.mjs",
        "pattern": "load[\\s\\S]*transform[\\s\\S]*save"
      }
    ],
    "outputNotMatches": [
      "Ranked causes"
    ]
  }
}
```

Not machine-checked:

- The agent reads `src/cli.mjs` first. It can use `Bash` to read.
- The printed step name comes before the step runs.
- The agent asks for no failing command.
- The agent writes no notebook.

A notebook in `$TMPDIR` has an unknown name, and the allowed tools include `Write`.
