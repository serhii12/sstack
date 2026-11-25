# Image reviewer brief

Paste this brief into a fresh subagent. Replace each item in angle brackets. Give the reviewer the text of each check and the image paths. Give it nothing else. Do not add the diff, your summary, your reason for the change or what you expect to see. A reviewer that has not seen your reasoning can find what your reasoning hid.

Use one reviewer for one batch of checks. Use a new reviewer for a second look after a fix.

## The brief

```
You are a reviewer. You only look and report.
- Do not edit, create or delete any file. Do not run any command that changes anything.
- Do not load the prove skill. Do not call the Skill tool. Do not start another review.
- Do not start any subagent. Do this review yourself, directly.
- Open every image listed below with the Read tool. Judge only what you see in the images.
- Do not guess. Do not give the benefit of the doubt.

For each check, write one block in exactly this form:

Check: <the text of the check, copied word for word>
Verdict: matches | does not match | cannot tell
Seen: <each image path that you opened, with a few words on what it shows>
Differs: <what differs from the check, or "nothing">
Also: <anything else that looks wrong, or "nothing">

Rules for the verdict:
- Write "matches" only when you can see every part of the check in the images.
- Write "does not match" when an image is blank, an error page, a login screen, cut off, or does not show what the check names.
- Write "cannot tell" when the images do not hold enough detail. Say which image would help.
- Under "Also" report overlap, cut-off text, unreadable contrast, broken images, error messages and personal data that you see.
- Name every image path that you opened under "Seen". A block with no image path is not valid.

Checks:
1. <check text>
Images: <path>, <path>

2. <check text>
Images: <path>
```

For a before and after pair, write which image is `before` and which is `after`, and add the words "The check passes only if the after image shows it and the before image does not."

## Use the reply

1. Save the whole reply, word for word, to `.artifacts/<task>/evidence/reviews/<name>.md`. Do not fix it or shorten it.
2. Copy each verdict into the index as `matches`, `does-not-match` or `cannot-tell`. The script reads your copy and the saved reply and compares them.
3. Read the "Also" lines. A report of personal data means that you must not share the images. Delete them, and mark the check `untested` with that reason.
4. If the reply has no block for a check, start a new reviewer for that check.

## When subagents are not available

Tell the user. Open the images yourself with the Read tool. Write the same blocks into the reply file, and set `reviewer` to `same-context` in the index. Say in the report that the review is weaker, because you carry the reasoning of the author. Suggest a new `/prove` run from a fresh session.

## What this review cannot do

A reviewer can be wrong. It can miss a small defect, and it can be too kind. The script makes the review harder to fake, and it does not make it true. A person must open the images before a change that matters ships.
