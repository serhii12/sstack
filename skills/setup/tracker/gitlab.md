# Tracker: GitLab

Tracker: gitlab
Repo: <group/name>
Blocking links: <native | text line>
Written by: the `setup` workflow on <YYYY-MM-DD>. If a command changes, edit this file by hand.

Specs and tickets for this repo are GitLab issues. Use the `glab` command line tool (https://gitlab.com/gitlab-org/cli) for every action. Inside a clone, `glab` finds the repo from `git remote -v`.

## Before the first write in a session

Run `glab repo view`. If it does not show the Repo line above, stop and ask the user. File issues only in the repo of the user.

## Actions

- Create an issue: write the body to a temporary file outside the repo. Then run `glab issue create --title "<title>" --description "$(cat <file>)"`. It prints the URL of the new issue.
- Read an issue: `glab issue view <n> --comments`. Add `-F json` for output a script can read.
- List open issues: `glab issue list -O json`. Add `--label "<label>"` to filter.
- Comment: `glab issue note <n> --message "<text>"`. GitLab calls comments "notes".
- Add a label: `glab issue update <n> --label "<label>"`. Remove a label with `--unlabel "<label>"`. If the label does not exist, create it first with `glab label create --name "<label>"`. `docs/agents/triage-labels.md` names the labels of the triage roles.
- Link a blocker. If the Blocking links line says `native`, post the quick action as a note: `glab issue note <n> --message "/blocked_by #<blocker>"`. Native blocking links need GitLab Premium or Ultimate. If the line says `text line`, put `Blocked by: #<n>, #<n>` at the top of the description. An issue is unblocked when every blocker is closed.
- Make a sub-issue: put `Part of #<spec>` at the top of the description, and link the two with `glab issue create ... --linked-issues <spec> --link-type relates_to`.
- Close an issue: `glab issue close` takes no comment. Post the reason with `glab issue note <n> --message "<reason>"`. Then run `glab issue close <n>`.

GitLab numbers issues and merge requests separately, so `#42` always means issue 42 here. A merge request is `!42`.

## Merge requests as a triage surface

MRs as a request surface: no

If this repo treats merge requests from outside contributors as requests, set this line to `yes`. The `triage` skill reads it. When it says `yes`, merge requests go through the same labels and states as issues. Use `glab mr view <n> --comments`, `glab mr diff <n>`, `glab mr note <n> --message "<text>"`, `glab mr update <n> --label "<label>" --unlabel "<label>"` and `glab mr close <n>`. These are the `gh pr` commands with `mr` in place of `pr`, and `note` in place of `comment`.

## Publish a spec

Create one issue. Title: `Spec: <feature>`. Body: the spec. Add no label.

## Publish tickets

Create one issue for each ticket, blockers first, so each ticket can name real issue numbers. Link each ticket to the spec as in "Make a sub-issue". Link its blockers as in "Link a blocker". Add the label of the `ready-for-agent` role from `docs/agents/triage-labels.md` to each ticket. Add no other label.

## Fetch a spec or ticket

Run `glab issue view <n> --comments`.

<!-- Not checked: no glab command in this file was run or compared with `glab` help text. The setup skill checks the flags at setup time. -->
