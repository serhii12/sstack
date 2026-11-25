# General rules for code

These rules apply in any language. Each group ends with what holds it. Most rules are judgment, so a reviewer or the owner decides each case.

Contents:

1. Before you write
2. Errors
3. Clear code
4. Modules and abstraction
5. Numbers and limits
6. Concurrency, failure and speed
7. Tests
8. Review

The examples use pseudocode, so they read the same in any language.

## 1. Before you write

- Describe the data and how each step changes it. If you cannot, stop and find the missing facts.
- Look at how the repo and proven systems solve the same problem. Follow the patterns that the repo already has.
- Build the smallest version that works end to end. Add to it after it works.
- A stopgap that you plan to replace later is a delayed cost. A delayed cost is cheap now and expensive later. Name each one in the report.

No fence yet

## 2. Errors

- An error is handled when three things are true. It is recorded once. The system is fully correct again. Nothing reports it again.
- Until an error is handled, add context to it and pass it up.
- Handle an error at the level that has the context to act on it.
- Never swallow an error. A dropped return value and a `catch` that only logs are swallowed errors.
- An error message says what failed and what to do.
- If a caller handles an error type in its own way, make a custom error type. If not, use the standard one.
- Check external input at the system boundary. Trust the types inside.
- Make an invalid state impossible to build.
- Build each value complete in one step. Do not create an object that needs a second call before it is correct.
- Write the least code that solves the problem. Delete dead code.

```
bad:   save(record)                     // the result is dropped
good:  err = save(record)
       if err: return wrap(err, "saving order record")
```

Foundation code is library, platform and infrastructure code. Application code is business logic and entry points. They follow different rules:

- Foundation code sets no policy. It returns the root error with no wrap and no log. It never stops the process. It keeps its dependencies near zero.
- Application code sets policy and owns the config. It wraps errors on the way up and logs near the top.
- Only the top level of an application can stop the process.
- Do not log an error and then throw it again. Then each layer reports it once more.

```
bad:   catch e: log(e); throw e
good:  low:  return err
       mid:  return wrap(err, "loading tariff")
       top:  log(err); respond 503; recover
```

No fence yet

## 3. Clear code

- Write for the average developer on the team.
- A name says what the code does. The first guess of the reader must be correct.
- A cost shows in the name or at the call site. A function named `get` does not write to a database.
- A function changes state or returns data. It does not do both.
- Put the error cases first, with an early return each. Keep the main path flat.
- Keep error handling apart from the main logic.
- A function does one thing. If the name of a part says more than its body, extract that part.
- Ask for the data that the function reads. If the function uses all the fields of a bundle, pass the bundle.
- Do not pass a positional boolean flag. Use a named option.
- A comment says why. It does not repeat the code.
- Mark open work with a ticket reference, such as `TODO(TICKET-123)`.

No fence yet

## 4. Modules and abstraction

- Name a module for what it provides. If no honest name comes, the module has no single purpose.
- A module named `utils`, `common`, `helpers` or `shared` is a sign of a module with no purpose. Look at it.
- Keep each type with the module that owns its behavior.
- Imports go one way. Two modules that import each other are one module, or they need a new design.
- Use a dependency that the project already has before you add a new one. Weigh the cost of each new dependency.
- Before you decide that a library cannot do a task, read its docs and its types.
- Stay concrete. Export the working type.
- Write the concrete version first. Design a contract after the concrete version works.
- If one of these three reasons is true today, you can add an abstraction:
  1. Callers supply the behavior.
  2. You maintain several implementations behind one interface.
  3. You know a part that will change, and the abstraction isolates that part.
- With none of the three reasons, stay concrete. A wish to mock is never a reason for an abstraction. The code that uses a dependency declares the small contract that it needs.
- Keep a contract to one or two methods.
- Do not make a base type only to share fields. Copy the fields.
- If a second real caller needs a capability, build it as shared code. The copies must be one concern that changes together.
- To fix a wrong abstraction, inline it back into each caller. Then look at the callers again.
- Use composition. Do not build deep inheritance trees.
- When you replace a path, delete the old one. Keep an old path only for a published contract or a rollout behind a flag.

```
bad:   interface Server { start; stop; wait }   // one implementation
       class ServerImpl implements Server
good:  class Server { start; stop; wait }       // export the concrete type
```

No fence yet

## 5. Numbers and limits

- Every number needs a measurement. Measure the real thing before you write a limit, such as a row cap, a byte cap or a timeout.
- Make each limit a safety limit. A safety limit sits above every good case, so only a broken case reaches it.
- If a good case hits a limit, the limit is wrong. Measure again and update the number.
- A limit that a caller can hit must be visible. The failure names the budget, the limit and the request.
- If a lint or a type check can know the failure, report it there. If not, report it at run time, with a message.
- An unmeasured limit and a silent limit are delayed costs.

```
good:  error: max_tools=128, asked for 129
bad:   the 129th tool is dropped with no message
```

No fence yet

## 6. Concurrency, failure and speed

- Write the sequential version first. If a measurement shows that concurrency pays for its complexity, add it.
- Know the workload. CPU work needs parallel hardware. Work that waits on I/O gains from concurrency alone.
- Own every concurrent task. Know how each task ends. Finish all tasks before the program exits.
- Make shutdown work under load. Stop new work first. Then finish the work that is in progress.
- Every operation has a deadline. The top caller sets it and passes it down.
- Under overload, reject new work early. A queue that only grows makes the failure later and larger.
- Start each buffer at the smallest size that works. Keep a measurement for any size above one.
- Give each cache a bound. A cache that only grows uses more memory until the process fails.
- Give each external call a timeout.
- Give each external call one retry owner. If your code retries, turn off the retries of the library below it.
- Make expensive behavior opt-in.
- If an optional dependency fails, continue without it and log the failure.
- Do not optimize without a profile or a benchmark. A test shows that the fast version is still correct.
- Look at external latency first: network, database and disk. Then look at the code.
- Fetch only the data that you need.

No fence yet

## 7. Tests

`test-craft` owns test design. The first three rules come from the same sources as this file. The fourth rule is new here.

- Test the error paths, as well as the main path.
- If a function returns a structure, assert the whole result.
- Write code that works for all valid inputs. Never hard-code a result to make a test pass.
- Never delete, skip or weaken a test only to make the suite pass. If a test fails, find the cause first.

No fence yet

## 8. Review

- Check a change against the order: correct, clear, simple, fast.
- Spend more time on the error paths than on the main path.
- A rule that the change goes around is itself a finding.
- Report a rule finding only on a line that the change adds or edits.

No fence yet
