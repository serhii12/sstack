# UI prototype

If the question is about what a screen looks like, read this file. [SKILL.md](SKILL.md) has the rules for the branch, the folder and the check.

The prototype shows a few very different versions of one screen on one route. A small bar at the bottom of the screen switches between them. The user looks at each version and picks one, or takes parts from several. The rest is thrown away.

## When this shape fits

- "What must this page look like?"
- "Show me a few options for this dashboard before I choose."
- "Try a different layout for the settings screen."

If the question is about logic or state, use [LOGIC.md](LOGIC.md).

## Where the versions go

A version is easier to judge next to the real app: the real header, the real sidebar, real data. On an empty page every version looks good. So use an existing page when one fits.

- On an existing page (the usual case): the versions show on the same route, picked by a `?variant=` URL parameter. The data loading, the parameters and the login stay as they are. Only the part of the page under test changes. A new section of an existing page also goes here.
- On a new page (only when no page fits): add a route that follows the routing rules of the project. Put `prototype` in its path or file name.

Put the version files and the switcher bar in `prototypes/<name>/`. The host page or the new route file imports them. Name each product file that you edit on the `Host files:` line of `PROTOTYPE.md`. The check script fails on any other changed file.

## Steps

1. Pick the number. Make 3 versions by default, and 5 at most. More versions stop being different. Write one line in `PROTOTYPE.md`, such as "Three versions of the settings page on `/settings`, picked by `?variant=`."
2. Make the versions very different. Each version keeps the purpose of the page, the data that it has, and the component library of the project. Give each one a clear name, such as `VariantA`. The versions differ in layout, in what comes first, and in the main action. A change of color only is not a version. If two versions look alike, do one again.
3. Connect them. Add one switch on the route that reads `?variant=` and shows that version. Keep the data loading above the switch.
4. Build the switcher bar. Put a small bar at the bottom center of the screen:
   - A left arrow and a right arrow go to the previous and the next version, and wrap around.
   - A label shows the key and the name of the version, such as `B (sidebar layout)`.
   - A click changes the URL parameter through the router of the project, so a reload keeps the version.
   - The left and right arrow keys also switch, except when an input, a text area or an editable element has focus.
   - The bar looks different from the page, so nobody judges it as part of the design.
   - Hide the bar in a production build, for example when `NODE_ENV` is `production`.
5. Hand it over. Give the user the URL and the version keys. The useful answer is often "the header from B with the sidebar from C". That is the real design.

## After the verdict

Write which version won and why on the `Verdict:` line. All versions stay on the prototype branch. Nothing goes into the base. The real page is written again by `/build` from the plan, with tests.

## Do not

- Make versions that differ only in color or text.
- Share a layout between versions. A shared header is fine. A shared layout defeats the purpose.
- Connect a version to real writes. Point it at a stub.
- Move version code into production. It has no tests and little error handling.

## Provenance

Adapted from `skills/engineering/prototype/UI.md` of [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright (c) 2026 Matt Pocock). Kept: very different versions on one route with `?variant=`, the preference for an existing page and its reason, a new page as the last choice with `prototype` in the path, 3 versions by default and 5 at most, versions that differ in structure, the switcher bar with arrows, label, URL update, arrow keys, focus rule and production hiding, the "header from B" feedback, and the list of things not to do. Changed: version files and the bar go in `prototypes/<name>/`, and each edited product file is named on the `Host files:` line. The winner goes into the real page through `/build`, from the plan. The framework code sample is removed.
