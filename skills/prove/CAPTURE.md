# Capture recipes

Contents: 1 Choose the tool. 2 Playwright, in the project or outside it. 3 Cypress. 4 Puppeteer. 5 Storybook. 6 A browser that is already installed. 7 What a headless server needs. 8 Names and hygiene. 9 Other visible output.

All capture runs headless. No recipe needs a screen, a display server or a desktop session. Unattended agents on a server use these recipes.

## 1. Choose the tool

Take the first row that applies.

| Look for | Use |
| --- | --- |
| `playwright` or `@playwright/test` in `package.json`, or `playwright.config.*` | Section 2 |
| `cypress` in `package.json`, or `cypress.config.*` | Section 3 |
| `puppeteer` in `package.json` | Section 4 |
| `.storybook/` and a Storybook build | Section 5 with the tool above, if there is one |
| Nothing above, but a browser binary is installed, and screenshots in light are enough | Section 6 (screenshots only) |
| Nothing above, or a check needs video, clicks or dark | Section 2, run with `run-playwright.mjs` |

Find the browser with `which chromium chromium-browser google-chrome google-chrome-stable`. On macOS, run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version`. A browser folder in `~/.cache/ms-playwright` or `~/Library/Caches/ms-playwright` can be incomplete. Run it once to find out.

To use Playwright when the project has none, do not ask. Write the capture script of section 2. Then run it from the project root:

```bash
node .claude/skills/prove/scripts/run-playwright.mjs .artifacts/<task>/evidence/capture.mjs
```

The helper installs the pinned Playwright with `npm ci` in a temp folder outside the project. It installs Chromium in the Playwright browser cache of the user, and the browser stays there. It runs the script with the project root as the working folder. Then it deletes the temp folder. Its first line says what it installed and where. Copy that line to the `Installed:` line of the report. Exit 3 means that the install failed. Then mark the visual checks `untested` with the reason. Keep the script self-contained, because the helper copies only that one file.

## 2. Playwright

Write `.artifacts/<task>/evidence/capture.mjs`. Keep it in `evidence/`, because `/land` stops on a file outside it that git does not track. If the project has Playwright, run it from the project root with `node`, so that the project's own Playwright loads. If not, run it with `run-playwright.mjs`, as section 1 says. The script checks each state before it takes a screenshot.

```js
import { chromium } from "playwright";
const out = ".artifacts/TASK/evidence";
const url = "http://localhost:3000/contact";
const sizes = [{ w: 375, h: 812 }, { w: 1280, h: 800 }];
const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    for (const s of sizes) {
      const context = await browser.newContext({
        viewport: { width: s.w, height: s.h },
        colorScheme: scheme,
        recordVideo: scheme === "light" && s.w === 1280 ? { dir: `${out}/video` } : undefined,
      });
      try {
        const page = await context.newPage();
        await page.goto(url);
        await page.getByRole("heading", { name: "Contact" }).waitFor();
        await page.screenshot({ path: `${out}/screenshots/after-contact-${s.w}x${s.h}-${scheme}.png`, animations: "disabled" });
      } finally {
        await context.close(); // This writes the video, even when a step failed.
      }
    }
  }
} finally {
  await browser.close();
}
```

- Replace `TASK` and the URL. Keep the wait. A screenshot of a half-loaded page proves nothing.
- Rename the video file after `context.close()`. Playwright gives it a random name. Name it `video/<flow>.webm`.
- For a sequence, call `page.screenshot` after each step. Name the files `01-open.png`, `02-fill.png`, `03-submit.png`.
- To capture one element, use `locator.screenshot`. Add `"element"` to its index entry.
- The screen does not show a URL, a redirect or a history entry. After each step, add `{ step, url: page.url(), history: await page.evaluate(() => history.length) }` to a list. Write the list with `writeFileSync` to `${out}/output/<flow>-url.json`. Name that file in the index entry of the check. Do not draw the URL into the page.
- Video needs no ffmpeg on the machine. Playwright downloads its own build with the browser.
- The project can have a `playwright.config.*` with a base URL and a web server. If so, write a test that calls `page.screenshot`, and run it with `npx playwright test`.
- If Chrome says "No usable sandbox" inside a container that you trust, launch with `args: ["--no-sandbox"]`.

## 3. Cypress

- Run `npx cypress run --spec <spec> --headless`. In the spec use `cy.viewport(375, 812)` and `cy.screenshot("after-contact-375x812-light")`.
- Cypress saves screenshots under `cypress/screenshots/`. Copy them into the evidence folder.
- Video is off by default in Cypress 13 and later. Set `video: true` in the config for this run, and copy the file from `cypress/videos/`.
- Cypress has no color scheme option. Set the scheme through the app's own toggle, or through the browser launch flags of the project.

## 4. Puppeteer

- Use `page.setViewport({ width, height })` and `page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }])`.
- Use `page.screenshot({ path })`. Wait for a selector first.
- Skip video. Take one screenshot for each step.

## 5. Storybook

- Capture a story through its frame URL: `<storybook-url>/iframe.html?id=<story-id>&viewMode=story`. Use the tool of sections 2 to 4 on that URL.
- If the project has no running Storybook, build it first with the command of the project.

## 6. A browser that is already installed

This path gives screenshots only. It needs no new dependency. It has no video, no clicks, no waiting for scripts and no color scheme switch. Tested with Chrome 158 on macOS. The dark flag `--blink-settings=preferredColorScheme=1` did not change the page, so do not use it. For a dark check, use Playwright, as section 1 says.

```bash
"<browser>" --headless=new --disable-gpu --hide-scrollbars --window-size=375,812 \
  --screenshot="$PWD/.artifacts/<task>/evidence/screenshots/after-375x812.png" "file://$PWD/index.html"
```

- Repeat with `--window-size=1280,800` for the desktop width.
- For a page that loads data, add `--virtual-time-budget=5000` so scripts can finish.
- Serve a built site with `python3 -m http.server <port>` or the project's own server. A `file://` page cannot load some assets.
- Add `--no-sandbox` only inside a container that you trust.

## 7. What a headless server needs

- Node 20 or later and a browser. Playwright downloads Chromium with `npx playwright install chromium`.
- On Linux, the system libraries of Chromium. `npx playwright install --with-deps chromium` installs them, and needs root.
- Fonts. Without a font package, text shows as empty boxes. Install `fonts-liberation` and `fonts-noto-color-emoji` or the equivalent.
- No display server, no Xvfb and no ffmpeg.
- `ffmpeg` is needed only to cut key frames out of a video after the fact. Prefer step screenshots.

## 8. Names and hygiene

- Name screenshots `<phase>-<what>-<W>x<H>-<scheme>.png`, for example `before-contact-375x812-light.png`. A reader sees the state from the name.
- Put reviewer replies in `reviews/`, command output in `output/`, video in `video/`.
- Freeze what changes between runs: dates, random content, animations. Seed the data with test data. Never capture real customer data.
- Reuse a capture that already exists in the task when it shows the same view at the same size and commit.
- Keep video small. Record only the flow that matters. Do not commit it to the ticket branch.

## 9. Other visible output

- CLI output: save the command, exit code and text to `output/<name>.txt`. That file is the evidence.
- An image that the change makes: copy the image into `screenshots/` and have it reviewed.
- A document such as a PDF: render pages to PNG with a tool that is installed, for example `pdftoppm -png -r 80 doc.pdf page`. Review the PNG files.
- A video: extract key frames with `ffmpeg -ss <seconds> -i flow.webm -frames:v 1 frame-01.png` if ffmpeg exists. Name the frames in the index.
