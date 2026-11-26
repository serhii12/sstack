# Logic prototype

If the question is about business logic, state changes or the shape of data, read this file. [SKILL.md](SKILL.md) has the rules for the branch, the folder and the check.

The prototype is one HTML file, `prototypes/<name>/index.html`. Anyone can open it with a double-click and drive the state model with buttons. So you can give it to a designer, a product manager or a domain expert. Write it in their words, not in the words of the code.

## When this shape fits

- "This state machine can fail when X happens and then Y. Does it?"
- "Can this data model show a refund after a partial shipment?"
- "I want to try the API before I write it."
- Any question where a person wants to press buttons and watch the state change.

If the question is about what a screen looks like, use [UI.md](UI.md).

## Steps

1. Write the question in the page. Put the question from `PROTOTYPE.md` at the top of the page, as visible text. A comment in the code is not enough.
2. Keep the logic in a pure module. Put the logic in one `<script>` block, as a small module that has no DOM code. The page calls it, and nothing flows back. Pick the form that fits the question:
   - A reducer, `(state, action) => state`, for separate events on one state value.
   - A state machine, for a question about which actions are legal now.
   - A set of pure functions on plain data, when there is no current state.
   - A class with clear methods, when the logic owns its state.
3. Build the page. Use plain HTML, CSS and JavaScript in the one file: no framework, no bundler, no server. Lay it out from top to bottom:
   - A title and one line that says what the page lets you try.
   - The current state, as a panel with labeled fields. Show it again after every click. Mark what changed.
   - Free buttons: one button for each action, always there, in any order.
   - Walkthroughs: one tab for each scenario. Each tab has a short description and the buttons to press, in order. A walkthrough starts from a known state, so it runs the same way each time.
   - Pick scenarios for the hard cases: the normal path, an edge case, and an action that must be illegal.
4. Keep it plain. Use clean type, space and one accent color. Use no animation.
5. Hand it over. The useful moment is when a person says "that must not be possible" or "I thought X". That is a bug in the idea. If the person wants a new action or scenario, add it.

## After the verdict

The pure module states the decision. A short part of it can go into the spec as a snippet from the prototype. `/build` can copy the pure module into the real code and write its tests. The HTML page stays on the prototype branch.

## Do not

- Add tests. A prototype that needs tests is no longer a prototype.
- Connect it to the real database. Keep state in memory, unless the question is about storage.
- Make it general. The prototype answers one question.
- Mix the logic and the page. If the module touches `document` or a button handler, a reader cannot lift it out.
- Use a framework, a bundler or a dev server. The file must open with a double-click.
- Put the page or the module into product code.
