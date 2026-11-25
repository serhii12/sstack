# Eval code-craft/04: a Python file does not make it read TYPESCRIPT.md

## Prompt

```
In app/orders.py, should total_for take the whole Order or only the fields that it reads? How should I shape this interface? Do not change any file.
```

## Setup

- A fresh git repo with the stack installed.
- A Python repo with `pyproject.toml`, `app/types.py` and `app/orders.py`. `total_for(order)` reads only `items` and `shipping_fee`.
- Allowed tools: `Skill`, `Read`, `Glob`, `Grep`.

## Expected behaviors

- [ ] The agent loads `code-craft`.
- [ ] The agent does not read `code-craft/TYPESCRIPT.md`.
- [ ] The agent changes no file.

## Failure looks like

- The agent reads `TYPESCRIPT.md` for a Python question, or gives TypeScript advice.

## Checks

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      {
        "path": "pyproject.toml",
        "content": "[project]\nname = \"demo\"\nversion = \"0.0.0\"\nrequires-python = \">=3.11\"\n"
      },
      {
        "path": "app/__init__.py",
        "content": ""
      },
      {
        "path": "app/types.py",
        "content": "from dataclasses import dataclass\n\n\n@dataclass\nclass Item:\n    price: float\n    qty: int\n\n\n@dataclass\nclass Order:\n    id: str\n    customer_id: str\n    items: list[Item]\n    shipping_fee: float\n    created_at: str\n    notes: str\n"
      },
      {
        "path": "app/orders.py",
        "content": "from app.types import Order\n\n\ndef total_for(order: Order) -> float:\n    items = sum(i.price * i.qty for i in order.items)\n    return items + order.shipping_fee\n"
      }
    ]
  },
  "prompt": "In app/orders.py, should total_for take the whole Order or only the fields that it reads? How should I shape this interface? Do not change any file.",
  "allowedTools": [
    "Skill",
    "Read",
    "Glob",
    "Grep"
  ],
  "budgetUsd": 1,
  "set": "regression",
  "assert": {
    "skillLoaded": [
      "code-craft"
    ],
    "toolNotCalled": [
      {
        "name": "Read",
        "inputMatches": "TYPESCRIPT\\.md"
      },
      {
        "name": "Grep",
        "inputMatches": "TYPESCRIPT\\.md"
      },
      {
        "name": "Bash",
        "inputMatches": "TYPESCRIPT\\.md"
      }
    ],
    "noRepoChanges": true
  }
}
```

Not machine-checked: whether the answer is right for Python.

`allowedTools` does not restrict, so the agent can also read a file with a shell command. The `Bash` entry covers that way.
