# Eval tickets-02: a spec that needs more than 6 tickets

Kind: task sort (a long breakdown). Every behavior has a test boundary, so no gap line must name one. The spec holds 12 parts that a test can check alone. So the breakdown needs more than 6 tickets. There is no cap, so the skill must show all of them and ask for "approve".

## User prompt

```
/tickets .scratch/team-workspaces/spec.md
```

## Setup

- A fresh temp git repo with the stack installed. No `docs/agents/tracker.md`.
- A small app, so that the spec matches the code: `src/accounts.mjs` (one account for each company, with an admin), `src/billing.mjs` (one seat counter and `invoice`), `src/auth.mjs` (password `signIn`), `src/mail.mjs` (`sendMail` and the `outbox` that tests read), `src/ui.mjs` (`topBar`), `src/app.mjs` (an HTTP app with `/app` and `/api/invoice`), and `test/app.test.mjs` (an HTTP test of `/app`).
- `GLOSSARY.md` has the terms "Workspace", "Member" and "Seat".
- `.scratch/team-workspaces/spec.md` passes `spec-lint.mjs`. It has 12 items in scope and 21 numbered behaviors. Each line under "Test boundaries" names the behaviors that it covers, and together they cover all 21.
- Tools allowed: `Skill`, `Read`, `Glob` and `Grep`. No `Write`, `Edit` or `Bash` rule. The agent tool also runs some read-only shell commands, such as `cat` and `ls`, with no rule.

The spec text is in the `## Checks` block below.

### Why the breakdown needs more than 6 tickets

The smallest breakdown that keeps each ticket a thin working piece has 8 tickets. It already merges what belongs together: roles with read-only access, invitations with the notification emails, Google sign-in with the switcher (both use the last workspace), and export with delete.

1. Workspaces, roles and read-only viewers (behaviors 1 to 4)
2. Invitations and notification emails (5 to 9)
3. Seat billing for each workspace (10)
4. Audit log page (11)
5. Google sign-in and the workspace switcher (12, 13, 16)
6. Migrate company accounts (14, 15)
7. Export and delete a workspace (17, 20, 21)
8. API tokens for scripts (18, 19)

These 8 tickets, written as local ticket files, make `tickets-lint.mjs` exit 0. With `--max 6` it exits 1 with one `cap` problem. To reach 6, a breakdown must put unrelated work in one ticket, such as billing with API tokens. The merge rule does not allow that.

## Expected behavior

- [ ] The agent loads the `tickets` skill and reads the spec.
- [ ] The agent does not stop for a missing test boundary.
- [ ] The reply shows a breakdown with a title line such as `Breakdown for Team workspaces. 8 tickets.`, with a count of 7 or more.
- [ ] The reply names no cap and offers no choice to lift a cap.
- [ ] The breakdown ends with the "approve" prompt.
- [ ] Each ticket has `Blocked by:`, and the first ticket has `none`. No chain of blockers leads from a ticket back to itself.
- [ ] Prefactoring, if the agent finds any, is first.
- [ ] No ticket is a layer, such as "the schema" or "the tests".
- [ ] No ticket file is written. The agent waits for the user.

## What a failure looks like

- The agent stops because it thinks a behavior has no test boundary.
- The breakdown has 6 or fewer tickets, because the agent put unrelated work in one ticket.
- The agent says that the breakdown is over a cap, or asks the user to lift one.
- The agent splits by layer (schema, API, interface, tests).
- The agent writes files before approval.

## How to run

```
node scripts/eval-run.mjs --eval tickets/02-long-breakdown-no-cap.md --models opus --runs 3 --claude <path to the real claude binary>
```

The planning skills run on Opus or Fable only. Read each transcript in the output folder for the items that no check covers.

## Checks

The runner gives no `Write` or `Edit`. A write attempt still shows in the transcript as a tool call.

```json
{
  "setup": {
    "gitInit": true,
    "installStack": true,
    "files": [
      { "path": "GLOSSARY.md", "content": "# Workspaces\n\n**Workspace**:\nA shared space for one team, with its members and their roles.\n_Avoid_: Account, Org\n\n**Member**:\nA person who belongs to a **Workspace**, with one role: owner, editor or viewer.\n_Avoid_: User (for this meaning)\n\n**Seat**:\nOne paid place in a **Workspace**. Each **Member** takes one seat.\n_Avoid_: License\n" },
      { "path": "src/accounts.mjs", "content": "// One account for each company. Each account has one admin and a list of members.\nexport const accounts = new Map();\n\nexport function accountFor(company) {\n  if (!accounts.has(company)) accounts.set(company, { company, admin: null, members: [] });\n  return accounts.get(company);\n}\n" },
      { "path": "src/billing.mjs", "content": "// A seat counter and a simple invoice, for the whole company today.\nexport const billing = { seats: 0 };\n\nexport function addSeat() {\n  billing.seats += 1;\n}\n\nexport function invoice() {\n  return { seats: billing.seats, total: billing.seats * 10 };\n}\n" },
      { "path": "src/auth.mjs", "content": "// Sign-in by password only.\nexport function signIn(email, password) {\n  return Boolean(email) && password === \"secret\";\n}\n" },
      { "path": "src/mail.mjs", "content": "// Every email goes through sendMail. Tests read `outbox` to see what was sent.\nexport const outbox = [];\n\nexport function sendMail({ to, subject, body }) {\n  outbox.push({ to, subject, body });\n}\n" },
      { "path": "src/ui.mjs", "content": "// The top bar of the app.\nexport function topBar(user) {\n  return `<header>${user.name}</header>`;\n}\n" },
      { "path": "src/app.mjs", "content": "import { createServer } from \"node:http\";\nimport { invoice } from \"./billing.mjs\";\nimport { topBar } from \"./ui.mjs\";\n\n// The HTTP app.\nexport function createApp() {\n  return createServer((req, res) => {\n    if (req.url === \"/app\") {\n      res.writeHead(200, { \"content-type\": \"text/html\" });\n      res.end(`${topBar({ name: \"Ana\" })}<main>Home</main>`);\n      return;\n    }\n    if (req.url === \"/api/invoice\") {\n      res.writeHead(200, { \"content-type\": \"application/json\" });\n      res.end(JSON.stringify(invoice()));\n      return;\n    }\n    res.writeHead(404);\n    res.end();\n  });\n}\n" },
      { "path": "test/app.test.mjs", "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { createApp } from \"../src/app.mjs\";\n\ntest(\"GET /app shows the top bar\", async () => {\n  const server = createApp().listen(0);\n  const { port } = server.address();\n  const html = await (await fetch(`http://127.0.0.1:${port}/app`)).text();\n  server.close();\n  assert.match(html, /<header>Ana<\\/header>/);\n});\n" },
      { "path": ".scratch/team-workspaces/spec.md", "content": "# Spec: Team workspaces\n\nStatus: draft\nAgreed in: grill summary confirmed by the user on 2026-11-20\n\n## Problem\n\nUsers share one account per company, so nobody can tell who changed what. An owner cannot give a person read-only access, and cannot remove one person without a new password for everyone.\n\n## Who it is for\n\nWorkspace owners, editors and viewers. Scripts that call the API.\n\n## Scope\n\n### In\n\n- Workspaces with members and three roles: owner, editor and viewer.\n- Read-only access for viewers.\n- Email invitations with a 7 day expiry.\n- Notification emails for role changes and removals.\n- Billing for each workspace, with one seat for each member.\n- An audit log page that lists every change with the member who made it.\n- Sign-in with Google.\n- A migration that moves each company account into one workspace.\n- A workspace switcher in the top bar.\n- A JSON export of all the data of a workspace.\n- API tokens for scripts, one workspace for each token.\n- Delete a workspace, with a restore for 30 days.\n\n### Out\n\n- SAML, and any other sign-in provider.\n- Custom roles.\n\n## User stories\n\n1. As an owner, I want to invite people and give each one a role, so that each person has the right access.\n2. As an owner, I want to see who changed what, so that I can find mistakes.\n3. As a member of several workspaces, I want to switch between them, so that I do not sign in again.\n4. As an owner, I want a token for my scripts, so that they do not use my password.\n\n## User-visible behavior\n\n1. When an owner creates a workspace, the owner is its only member, with the role owner.\n2. When an owner changes the role of a member, the member has the new role at once.\n3. When a viewer opens the workspace settings page, the page shows \"Read only\" and has no save button.\n4. When a viewer sends a change to the API, the API answers 403 and saves nothing.\n5. When an owner invites an email address, that address gets one email with a join link.\n6. When the person opens the join link within 7 days, the person joins as an editor.\n7. When the person opens the join link after 7 days, the page shows \"This invitation has expired\".\n8. When an owner changes the role of a member, the member gets an email that names the new role.\n9. When an owner removes a member, the member loses access at once, and the owner gets an email.\n10. When a member joins or leaves, the next invoice of the workspace shows the new seat count.\n11. When a member makes a change, the audit log page shows a row with the member, the change and the time.\n12. When a member signs in with Google, the member lands in the last workspace that the member used.\n13. When a Google account matches no member, the sign-in page shows \"No account for this email\".\n14. When the migration runs, each company account becomes one workspace. The account admin is the owner. The other members are editors.\n15. When the migration runs a second time, it changes nothing.\n16. When a member belongs to two or more workspaces, the top bar lists them and marks the current one.\n17. When an owner exports a workspace, the owner gets one JSON file with its members, roles and audit rows.\n18. When an owner creates an API token, a script can call the API with it, for that workspace only.\n19. When an owner revokes an API token, the API refuses every later call with it.\n20. When an owner deletes a workspace, its members lose access, and the owner can restore it for 30 days.\n21. When 30 days pass after a delete, the workspace and its data are gone.\n\n## Test boundaries\n\n- The HTTP API under /api/workspaces: status codes and JSON bodies (behaviors 1, 2, 4, 9, 10, 17, 18, 19, 20, 21). new\n- The mail outbox that the mail module keeps for tests: the recipient, subject and link of each email (behaviors 5, 8, 9). existing\n- The join link page: who joins, and the expired message (behaviors 6, 7). new\n- The workspace settings page: the \"Read only\" text and the save button (behavior 3). new\n- The audit log page: the rows shown after a change (behavior 11). new\n- The Google sign-in callback, with a fake Google provider: the page or the redirect that it returns (behaviors 12, 13). new\n- The migration command: the workspaces that the API lists after one run and after two runs (behaviors 14, 15). new\n- The /app page: the workspace switcher in the top bar (behavior 16). The page exists. The switcher is new.\n\nPrior art: the existing test of the /app page calls it over HTTP.\n\n## Decisions\n\n- Roles are stored on the membership, not on the user.\n- Billing uses the existing seat counter, changed to count the members of one workspace.\n- Every email goes through the existing mail module.\n- The migration runs once and is safe to run again.\n- The member record keeps the last workspace used.\n- An API token belongs to one workspace. Only a hash of the token is stored.\n- The invitation expiry and the 30 day restore read a clock that tests can set.\n\n## Assumed without asking\n\n- None\n\n## Open questions\n\n- None\n\n## Glossary terms and decision records\n\n- Workspace: GLOSSARY.md\n- Member: GLOSSARY.md\n- Seat: GLOSSARY.md\n" }
    ]
  },
  "prompt": "/tickets .scratch/team-workspaces/spec.md",
  "allowedTools": ["Skill", "Read", "Glob", "Grep"],
  "assert": {
    "skillLoaded": [
      "tickets"
    ],
    "noRepoChanges": true,
    "toolNotCalled": [
      "Write",
      "Edit"
    ],
    "outputMatches": [
      "Breakdown for",
      "/Breakdown for[^\\n]*\\b(?:[7-9]|[1-9]\\d) tickets?\\b/",
      "approve",
      "/^\\s*1\\. [^\\n]+\\n\\s*Blocked by: none/m"
    ],
    "outputNotMatches": [
      "/\\(cap \\d+\\)|lift the cap|over the cap/i",
      "/^\\s*\\d+\\. (?:The )?(?:Schema|Database|Data layer|Models?|Endpoints?|Interface|UI|Frontend|Backend|Tests?)\\b/im"
    ]
  }
}
```

What each check catches:

- A stop for a missing boundary fails the `Breakdown for` check and the count check.
- A breakdown of 6 or fewer tickets fails the count check, which needs 7 or more tickets on the title line.
- A reply that names a cap or offers to lift one fails the cap check in `outputNotMatches`.
- A first ticket with a blocker, or a breakdown with no `Blocked by:` lines, fails the first-ticket check.
- A ticket named after a layer fails the layer check.
- A ticket file, or an attempt to write one, fails `noRepoChanges` and the `toolNotCalled` checks.

Not machine-checked:

- Whether the tickets are cut well, and whether each check can fail before the work.
- Prefactoring order, when the agent finds some.
- That no chain of blockers leads from a ticket back to itself. `tickets-lint.mjs` checks this only for files, and this eval writes none.
