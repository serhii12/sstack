# Smell baseline for the Standards reviewer

If the repo documents no standards, use this list. If the repo documents standards, use this list as a second pass. These are twelve code smells from chapter 3 of the book _Refactoring_ by Martin Fowler. Three rules apply:

- The repo overrides. A documented repo standard always wins. If the standard endorses something that the baseline flags, drop the smell.
- Every smell is a judgment call. Label each smell as a heuristic ("possible Feature Envy"). Never report a smell as a hard violation. Mark a smell that tooling already enforces with `tooling-enforced`.
- `code-craft` wins on terms and rules. Use its words: module, interface, depth, module boundary. If a Fix part here and a rule in `code-craft/RULES.md` disagree, follow the rule.

Each smell has a description, then a "Fix:" part. Match each smell against the diff.

- Mysterious Name: a function, variable, or type whose name does not reveal what it does or holds. Fix: rename it. If no honest name comes, the design is murky.
- Duplicated Code: the same logic shape appears in more than one hunk or file in the change. Fix: if the copies are one concern that changes together, and a second real caller needs the shape, extract it. If not, keep the copies.
- Feature Envy: a method that reaches into the data of another object more than its own data. Fix: move the method onto the data that it envies.
- Data Clumps: the same few fields or params keep traveling together through several functions. Fix: bundle them into one type. A function that reads only some of the fields takes only those.
- Primitive Obsession: a primitive or string that stands in for a domain concept that deserves its own type. Fix: give the concept its own small type.
- Repeated Switches: the same `switch` or `if` cascade on the same type recurs across the change. Fix: use one map that both sites share, or a `switch` over a closed union that the compiler checks for completeness. Add polymorphism only with one of the three reasons for an abstraction.
- Shotgun Surgery: one logical change forces scattered edits across many files in the diff. Fix: gather what changes together into one module.
- Divergent Change: one file or module is edited for several unrelated reasons. Fix: split it so that each module changes for one reason.
- Speculative Generality: abstraction, parameters, or hooks added for needs that the spec does not have. Fix: delete it. Inline it back until a real need shows.
- Message Chains: a long chain of calls, such as `a.b().c().d()`, that the caller must not depend on. Fix: hide the walk behind one method on the first object.
- Middle Man: a class or function that mostly delegates onward. Fix: cut it and call the real target directly. Apply the deletion test. If complexity comes back in the callers when you delete it, keep it.
- Refused Bequest: a subclass or implementer that ignores or overrides most of what it inherits. Fix: drop the inheritance and use composition.
