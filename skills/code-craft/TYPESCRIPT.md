# TypeScript rules

Read this file only for a file that ends in `.ts`, `.tsx`, `.mts` or `.cts`. It holds the rules that are true for TypeScript and not for every language. The general rules are in `RULES.md`, and they apply here too.

Contents:

1. Types
2. Input from outside
3. Errors
4. Async code
5. Modules
6. Tools that hold these rules

## 1. Types

- If you do not know the type of a value, use `unknown`. Do not use `any`. Narrow `unknown` with a check before you use it.
- Do not use an `as` cast that skips a check. Two casts are fine: `as const`, and the one constructor function of a branded type.
- To narrow an array, use a type predicate in `.filter()`.
- Model the states of a thing as a union with a tag field. Each `switch` over the union gets a `never` check in its `default` branch.
- If the compiler proves each `switch` over a union complete, a repeated `switch` is fine.
- If a caller can swap two IDs of the same base type, give each ID a branded type.
- Turn on `noUncheckedIndexedAccess`. Then an index access can be `undefined`, and the code must check it.
- Let the compiler infer local types. Write the return type of each exported function.
- To check a value against a type and keep its literal types, use `satisfies`.
- If a plain type can say it, do not use a mapped, conditional or template literal type, or `infer`.

```ts
type Payment =
  | { status: "pending" }
  | { status: "paid"; paidAt: Date }
  | { status: "failed"; reason: string };

function label(p: Payment): string {
  switch (p.status) {
    case "pending": return "Waiting";
    case "paid": return `Paid ${p.paidAt.toISOString()}`;
    case "failed": return `Failed: ${p.reason}`;
    default: {
      const unreachable: never = p;
      return unreachable;
    }
  }
}

type OrderId = string & { readonly __brand: "OrderId" };
const orders = items.filter((item): item is Order => item.type === "order");
```

No fence yet

## 2. Input from outside

- Parse external data with a runtime check at the system boundary. Then give it a type.
- Do not cast the result of `response.json()` or `JSON.parse()` to a type.

```ts
const raw: unknown = await response.json();
const user = parseUser(raw); // throws with a clear message if the shape is wrong
```

No fence yet

## 3. Errors

- Throw only `Error` objects.
- When you wrap an error, pass the original error as `cause`.
- Keep the variable of a `catch` clause as `unknown`. Narrow it before you read it.
- A comment that turns off a compiler or lint check needs a reason in the same comment.

```ts
try {
  return await persistOrder(order);
} catch (err) {
  throw new Error(`saving order ${order.id} failed`, { cause: err });
}
```

No fence yet

## 4. Async code

- Handle every promise. Await it, return it, or attach a `.catch` that logs.
- Do not pass an async function where the caller expects a function that returns nothing.
- Keep dependent work in order. If a measurement shows that the wait matters, run independent work together with `Promise.all`.
- Give each `fetch` a timeout, for example with `AbortSignal.timeout(ms)`.
- Do not block the event loop with long synchronous work.

No fence yet

## 5. Modules

- A module declares its entry files. Code outside the module imports only those files.
- A barrel file that names each export is fine. Do not use `export *` for a whole folder.
- Tests import a module through its entry files.
- No import cycles.

No fence yet

## 6. Tools that hold these rules

The project check command can hold the rules below. This stack installs none of these tools. Each name was checked against the public docs of the tool on 25 Nov 2026. One row also names `@eslint-community/eslint-plugin-eslint-comments`, which is an ESLint plugin.

| Rule | Tool | Rule or option name |
| --- | --- | --- |
| No `any` | TypeScript compiler | `strict` (it turns on `noImplicitAny`) |
| No `any` | typescript-eslint | `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument` |
| No cast that skips a check | typescript-eslint | `no-unsafe-type-assertion` |
| Index access can be undefined | TypeScript compiler | `noUncheckedIndexedAccess` |
| Each `switch` over a union is complete | typescript-eslint | `switch-exhaustiveness-check` |
| No fall through from one `case` to the next | TypeScript compiler | `noFallthroughCasesInSwitch` |
| Exported functions have return types | typescript-eslint | `explicit-module-boundary-types` |
| Throw only `Error` objects | typescript-eslint | `only-throw-error`, `prefer-promise-reject-errors` |
| A wrap keeps the `cause` | ESLint | `preserve-caught-error` |
| The `catch` variable is `unknown` | TypeScript compiler | `useUnknownInCatchVariables` (part of `strict`) |
| No empty `catch` block | ESLint | `no-empty` |
| A comment that turns off a check has a reason | typescript-eslint, eslint-comments plugin | `ban-ts-comment` with `allow-with-description`, and `require-description` for ESLint directive comments |
| Every promise is handled | typescript-eslint | `no-floating-promises`, `no-misused-promises` |
| Imports only through entry files | ESLint, dependency-cruiser | `no-restricted-imports`, or a `forbidden` rule with `path` and `pathNot` |
| No `export *` of a folder | ESLint | `no-restricted-syntax` on `ExportAllDeclaration` |
| No import cycles | dependency-cruiser | a `forbidden` rule with `circular: true`, named `no-circular` in its examples |
| Imports go one way between layers | dependency-cruiser | `forbidden` rules with `from` and `to`. A human names the layers. |

A tool can hold only part of some rules. `no-empty` finds an empty `catch`, and it passes a `catch` that only logs. A reviewer finds that case. The ESLint option `reportUnusedDisableDirectives` finds a disable comment that is no longer necessary. It does not ask for a reason.

Three rules have no tool, so a human judges them. They are the branded type for IDs that can swap, the limit on advanced types, and work that blocks the event loop.

Do not use `max-lines`, `max-lines-per-function` or `max-params` as a gate. A size number is a sign to look at, and `SKILL.md` says why.
