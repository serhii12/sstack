# Triage labels

Written by: the `setup` workflow on <YYYY-MM-DD>. If a label changes, edit this file by hand.

The `triage` and `friction` skills use roles. This file maps each role to the label string in the tracker of this repo. `triage-check.mjs` reads this file and maps each label to its role before it checks an issue.

| Role | Label in this tracker | Meaning |
| --- | --- | --- |
| `bug` | `bug` | Something is broken. |
| `enhancement` | `enhancement` | A new feature or an improvement. |
| `needs-triage` | `needs-triage` | The maintainer must evaluate the issue. |
| `needs-info` | `needs-info` | The issue waits for the reporter to answer the triage notes. |
| `ready-for-agent` | `ready-for-agent` | The issue holds an agent brief, or it is a ticket from `/tickets`. The user can type `/build` for it. |
| `ready-for-human` | `ready-for-human` | A person must do the work or settle a design. |
| `wontfix` | `wontfix` | The issue is closed, with a recorded reason. |
| `P0` | `P0` | Optional priority. The scale of the `friction` skill. |
| `P1` | `P1` | Optional priority. |
| `P2` | `P2` | Optional priority. |
| `P3` | `P3` | Optional priority. |
| `friction` | `friction` | The `friction` skill filed it. |
| `needs-decision` | `needs-decision` | A human must choose, for example between two fixes. |

When a skill names a role, use the label in the second column. To use another name, edit the second column only. Keep the first column as it is.
