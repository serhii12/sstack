# Index format

Contents: Folder layout. The index. Fields. Rules the script checks. Example.

## Folder layout

```
.artifacts/<task>/
  ticket.md                 only when the ticket file is not in this checkout
  evidence/
    index.json              the index (this file)
    capture.mjs             the script that made the captures
    screenshots/            images
    video/                  video, for people
    output/                 command output as text
    reviews/                saved replies of the image reviewer
```

Every file that the index names must be inside `evidence/`. A path with `..`, an absolute path or a link that leaves the folder is refused. The `evidence/` folder and `index.json` must be real parts of the project, not links to a folder outside it.

## The index

```json
{
  "schema": 1,
  "task": "contact-form",
  "ticket": ".scratch/contact/tickets/01-form.md",
  "level": "behavior",
  "commit": "9f2c1ab4e0d7c5b1a3f6e8d2c4b6a8f0e1d3c5b7",
  "gathered_at": "2026-11-25T14:03:00.000Z",
  "environment": "macOS, Chrome headless 158, http://localhost:4173",
  "checks": [
    {
      "check": "The form shows at 375 px and at 1280 px",
      "status": "pass",
      "evidence": [
        { "path": "screenshots/after-form-375x812-light.png", "sha256": "<64 hex>", "phase": "after", "viewport": "375x812", "scheme": "light" },
        { "path": "screenshots/after-form-1280x800-light.png", "sha256": "<64 hex>", "phase": "after", "viewport": "1280x800", "scheme": "light" }
      ],
      "review": {
        "verdict": "matches",
        "reviewer": "fresh-subagent",
        "images": ["screenshots/after-form-375x812-light.png", "screenshots/after-form-1280x800-light.png"],
        "reply": { "path": "reviews/form.md", "sha256": "<64 hex>" }
      }
    },
    {
      "check": "The form works in Safari",
      "status": "untested",
      "reason": "No Safari on this server."
    }
  ]
}
```

## Fields

Top level (all required):

- `schema`: the number 1.
- `task`: the task name. It must equal the folder name.
- `ticket`: the file that holds `## Acceptance checks`, relative to the project root.
- `level`: `cite`, `content`, `behavior`, `red-then-green` or `checks`.
- `commit`: the sha that the evidence ran on, 7 to 40 hex digits.
- `gathered_at`: an ISO date and time.
- `environment`: where it ran. Name the OS, the browser or runtime, and the URL.
- `checks`: one entry for each acceptance check.

An entry:

- `check`: the text of the acceptance check, word for word. White space does not matter. The checkbox does not count.
- `status`: `pass`, `fail` or `untested`.
- `reason`: required for `untested` and `fail`. One line.
- `evidence`: a list of files. Required and not empty for `pass` and `fail`.
- `review`: required for a visual `pass`. A check is visual when any file is an image or video, or when `"visual": true`.
- `viewport_waiver`: a reason that lets a visual `pass` go without both widths, for example `terminal output`.

A file in `evidence`:

- `path`: relative to `evidence/`, with forward slashes. Required.
- `sha256`: the hash of the file. Run `fill-hashes <task> --write` to fill it.
- `phase`: `before`, `after` or `single`. Level `red-then-green` needs both `before` and `after`.
- `viewport`: `WxH` in CSS pixels. The image must be 1 to 4 times this wide. The script reads the width of PNG, JPEG, GIF and WebP files.
- `scheme`: `light` or `dark`.
- `element`: a selector, for an element capture. The width rules skip it.

A `review`:

- `verdict`: `matches`, `does-not-match` or `cannot-tell`. A `pass` needs `matches`.
- `reviewer`: `fresh-subagent` or `same-context`.
- `images`: every image of the entry. Video is not listed.
- `reply`: the saved reply, as `{ path, sha256 }`. It must hold a `Check:` block with a `Verdict:` line for this check. The block must name each image.

## Rules the script checks

| Rule | Fails when |
| --- | --- |
| `schema` | A field is missing or has the wrong type. |
| `ticket` | The ticket file is missing or has no checks. |
| `check-missing`, `check-unknown`, `check-duplicate` | A check has no entry, an entry has no check, or a check has two entries. |
| `status`, `evidence-required`, `reason` | The status is wrong, a `pass` or `fail` names no file, or a reason is missing. |
| `path`, `file-missing`, `file-empty` | A file, the index or the evidence folder leaves the project or the folder. A file does not exist, has no bytes or holds only white space. |
| `sha256` | The hash is missing or the file changed after it was indexed. |
| `media-magic`, `png-ihdr`, `png-end`, `media-type` | The bytes of a file do not agree with its extension. A PNG has no header or is cut short. |
| `review`, `review-images`, `review-reply` | A visual `pass` has no `matches` verdict, an image was not reviewed, or the reply disagrees. |
| `viewport` | A visual `pass` lacks a phone width and a desktop width, or the declared width does not fit the image. |
| `phase` | At level `red-then-green` a `pass` lacks a `before` or an `after` file. |
| `commit`, `dirty-tree` | The commit is not HEAD or an ancestor. With `--strict-head`: it is not HEAD, or the tree has changes. |
