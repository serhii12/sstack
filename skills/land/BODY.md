# The pull request body

Read this file in step 5 of `land`, before you write the title and the body.

## Title

- Look at the titles of recent merged pull requests and the git log. Use the same style.
- A title often becomes the commit message. Say what the change does for a user, in plain words.
- Keep it short. If the repo puts no ticket number in its titles, put none in the title.

## Body

Start with the problem. Take it from the ticket and the spec, in one to three sentences. Then say in a short paragraph what changed. Do not list every file or function. A reviewer can read the diff for that.

Every claim in the body needs evidence. If you did not see a result, write `untested`.

Use this form:

```markdown
## Problem
<one to three sentences from the ticket>

## What changed
<one short paragraph>

## How it was proven
<the table that land-evidence.mjs printed, word for word. Each file name in it is a link>

Not tested: <each untested check and its reason, or "None">

### Screenshots and video
<the caption lines and the image and video lines that land-evidence.mjs printed, word for word>
The files are on the branch `evidence/<task>` of this repo, at commit <sha>.

## Review
peer-review: <n> findings, <n> open (<ids and severities>, or none). Mode: <mode>. Reviewed commit: <sha>.

## Risk
Level: <level>. Rule: <rule> on <path>. Computed by land-risk.mjs from the config on the default branch.

Closes #<issue number>
Made with <agent tool> and <model>.
```

- Take the table from the output of `land-evidence.mjs <task>`. Its rows come from the evidence index. Each file name is a link to the file on the evidence branch. A reviewer can open it.
- If `evidence-check.mjs report <task>` failed in step 2, the evidence is not sound. Then write every check as `untested` with the reason, and do not use the table.
- Copy the caption lines and the image lines below the heading. Do not change a link. Each caption names the file and the check that it proves. An image line starts with `![`, so GitHub shows the image in the body. A video line is a plain link.
- If `land-evidence.mjs` printed `No evidence files`, write the table by hand from the output of `evidence-check.mjs report <task>`, and write `No screenshots or video.` under the heading. If it failed, write `Evidence: not pushed (<reason>)`.
- Never put an image on a host outside the repo. Never paste a link to an outside host. No fence yet
- Copy the risk line from the output of `land-risk.mjs`. Never write a level that the script did not print.
- For a local ticket, write `Ticket: <path>` in place of `Closes #<n>`.
- Write the agent tool and the model only as the tool reports them. If the tool does not report the model, name the tool only. Do not guess.

## Before you post

- Check the title, the body, every quote and every image for secrets, tokens, client names and private data. Remove them.
- Everyone who can read the repo can see the evidence branch. If an image shows real client data, do not push it. Mark the check `untested`.
- Write the body to a new file outside the repo, with the task name and the time in its name. Pass it with `--body-file`. This keeps quotes and line breaks as they are.
- Open a real pull request. Do not open a draft. A draft does not start some checks.

## Comments on the pull request

`land` posts no comment as a rule. The merge check posts one note when it merges on the word of the user. If the user asks for a comment, do these steps:

- Say in the first line that an agent wrote it, and for which ticket.
- Lead with the conclusion. Cite the code, the check or the command output.
- After you post, make sure that GitHub returned a comment URL.
- Never resolve a review thread of a person. A person resolves it.

<!-- Provenance: adapted from tstack skills/file-pr/SKILL.md and skills/leaving-pr-comments/SKILL.md (MIT, Copyright (c) 2026 Theo Browne), and the PR body rule of rstack AGENTS.md lines 83-86 (Michael Shimeles, no license file). See skills/land/SKILL.md. -->
