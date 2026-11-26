# Items beyond the tracker

Read this file from the section "More than the tracker" of [SKILL.md](SKILL.md). Do these items after the tracker and the labels. The user decides each one. Show what will change, then wait for a yes.

## Branch protection

Branch protection on the git host blocks a push to `main` for every person and every agent tool. The git guard blocks it only for the agent in Claude Code.

On GitHub, write this body to a file in the OS temp folder:

```json
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Then show this command and say what it does: it makes `main` take changes only through a pull request with no force push.

```bash
gh api --method PUT repos/<owner>/<name>/branches/main/protection --input <file>
```

Run it only after the user says yes. If it fails, show the error. A private repo on a free plan can refuse it. The user can also set it in the settings page of the repo. This command was not run when this file was written. No fence yet

On GitLab, show the command `glab api --method POST "projects/:id/protected_branches" -f name=main -f push_access_level=0`. Run it only after a yes. This command was not run when this file was written. Run `glab api --help` first. No fence yet

## The git hooks

The installer sets `core.hooksPath` to `.githooks` when it is not set. The guard blocks every agent write to `.githooks/`, to `.git/config` and to `core.hooksPath`. So do not change them yourself. Show the user the exact command or text, for example `git config core.hooksPath .githooks`, and ask the user to run it. Held by: hooks/guard-git.mjs

## The risk settings

The `land` skill reads `.stack/risk.json`. The guard blocks every agent write under `.stack/`. Read the format in `.claude/skills/land/REFERENCE.md`, section "The risk config". Draft the file with the user. Show the whole text. Then ask the user to write it on the default branch by hand. Held by: hooks/guard-git.mjs, templates/claude-settings.json
