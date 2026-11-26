# Tracker: GitHub

Tracker: github
Repo: <owner/name>
Written by: the `setup` workflow on <YYYY-MM-DD>. If a command changes, edit this file by hand.

Specs and tickets for this repo are GitHub issues. Use the `gh` command line tool for every action. Inside a clone, `gh` finds the repo from `git remote -v`.

## Before the first write in a session

Run `gh repo view --json nameWithOwner`. If it does not print the Repo line above, stop and ask the user. In a fork, `gh` can default to the upstream repo. File issues only in the repo of the user.

## Actions

- Create an issue: write the body to a temporary file outside the repo. Then run `gh issue create --title "<title>" --body-file <file>`. It prints the URL of the new issue. The issue number is the last part of the URL.
- Read an issue: `gh issue view <n> --json number,title,body,labels,state,comments`.
- List open issues: `gh issue list --state open --json number,title,labels`. Add `--label "<label>"` to filter.
- Comment: `gh issue comment <n> --body "<text>"`.
- Add a label: `gh issue edit <n> --add-label "<label>"`. Remove a label with `--remove-label "<label>"`. If the label does not exist, create it first with `gh label create "<label>"`. `docs/agents/triage-labels.md` names the labels of the triage roles.
- Link a blocker: add `--blocked-by <n>,<n>` to `gh issue create`, or run `gh issue edit <n> --add-blocked-by <blocker>` later. Both need `gh` 2.94 or later. If `gh` is older, use the API: `gh api --method POST repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker-id>`. Here `<blocker-id>` is the database id of the blocker. Get it from `gh api repos/<owner>/<repo>/issues/<blocker> --jq .id`. It is a different number from the `#` number. If neither way works, put `Blocked by: #<n>, #<n>` at the top of the body. An issue is unblocked when every blocker is closed.
- Make a sub-issue: add `--parent <spec>` to `gh issue create`, or run `gh issue edit <spec> --add-sub-issue <n>` later (`gh` 2.94 or later). If sub-issues are not available, put `Part of #<spec>` at the top of the body.
- Count open blockers: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`. If the count is 0, the ticket can start.
- Close an issue: post the reason with `gh issue comment <n> --body "<reason>"`. Then run `gh issue close <n>`. On an issue that is already closed, `gh issue close --comment` drops the comment and still exits 0.

## Pull requests as a triage surface

PRs as a request surface: no

If this repo treats pull requests from outside contributors as requests, set this line to `yes`. The `triage` skill reads it. When it says `yes`, pull requests go through the same labels and states as issues, with these commands:

- Read a pull request: `gh pr view <n> --json number,title,body,labels,state,author,comments`. Read the diff with `gh pr diff <n>`.
- List outside pull requests for triage: `gh api --paginate 'repos/<owner>/<repo>/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, labels: [.labels[].name]}'`.
- Comment, label and close: `gh pr comment <n> --body-file <file>`, `gh pr edit <n> --add-label "<label>" --remove-label "<label>"`, `gh pr close <n>`.

GitHub uses one number space for issues and pull requests. So a bare `#42` can be either. Run `gh pr view 42` first. If it fails, run `gh issue view 42`.

## Publish a spec

Create one issue. Title: `Spec: <feature>`. Body: the spec. Add no label.

## Publish tickets

Create one issue for each ticket, blockers first, so each ticket can name real issue numbers. Make each ticket a sub-issue of the spec. Link its blockers with `--blocked-by`. If native links fail, use the `Blocked by:` body line. Add the label of the `ready-for-agent` role from `docs/agents/triage-labels.md` to each ticket. Add no other label.

## Fetch a spec or ticket

Read the issue as in "Read an issue", with its comments.

<!-- Provenance: adapted from skills/engineering/setup-matt-pocock-skills/issue-tracker-github.md in mattpocock/skills (MIT, Copyright (c) 2026 Matt Pocock). See NOTICE and skills/setup/SKILL.md. -->
