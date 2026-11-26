# Restructure a group of shallow modules

If a task moves code between modules, merges shallow modules into one deeper module, or adds a module boundary, read this file. It uses the terms in `SKILL.md`.

## Dependency categories

Before you merge modules, sort their dependencies into four categories. The category tells you how tests reach the new module through its interface.

1. In-process. Pure computation, state in memory, no I/O. Merge the modules and test through the new interface. Add no adapter.
2. Local stand-in. The dependency has a local stand-in for tests, such as an in-memory database or an in-memory file system. Run the tests with the stand-in. The module boundary stays inside the module, and the interface gets no port.
3. Remote and owned. Your own service across a network. Define a port at the module boundary. The deep module owns the logic. Production uses a network adapter. Tests use an in-memory adapter.
4. External and not owned. A third-party service. The deep module takes it as an injected port. Tests use a fake adapter.

No fence yet

## Module boundary rules

- One adapter means a possible module boundary. Two adapters mean a real one. If only one adapter exists, do not add a port.
- A test fake counts as the second adapter only for categories 3 and 4.
- A deep module can have module boundaries inside it for its own tests. Do not put those inner module boundaries in its interface only because tests use them.

No fence yet

## Replace, do not layer

When tests exist at the interface of the new module, the old tests of the shallow modules are waste. The goal is one set of tests, at the new interface. Do not add new tests on top of the old set and stop there.

Do the work in this order:

1. Write tests at the new interface first. Run them and watch them fail, because the interface does not exist yet.
2. Move the code behind the new interface. Run the new tests and watch them pass.
3. Run the old tests too. They must still pass on the old modules until you delete those modules.
4. Check that each behavior of an old test has a new test.
5. If the ticket says so, delete the old tests of the shallow modules. Do it in a separate commit, after the new tests pass. If the ticket does not say so, keep the old tests and name them in your report.

Never delete, skip or weaken a test only to make the suite pass. A test that fails in the middle of a restructure can show a behavior that the move lost. Find the cause before you change the test.

Tests assert what a caller can see through the interface. If a test must change when only the implementation changes, the test reaches past the interface.
No fence yet

## A check for a restructure ticket

A restructure changes no behavior, so a plain behavior test passes before and after the work. Each ticket still needs a check that fails before the work and passes after it. Three kinds work:

- A test at the new interface. It fails because the interface does not exist yet.
- A dependency rule that fails today, such as "no import of `orders/price` from outside `orders/`".
- A count of the old form that reaches zero, such as the number of callers that import the old module.

No fence yet

## What not to do

- Do not merge modules that change for different reasons. Locality gets worse.
- Do not add a port with one adapter "for later".
- Do not restructure inside a bug fix. Fix the bug first. Make the restructure a separate ticket.
- Do not restructure code that the task does not name.

No fence yet
