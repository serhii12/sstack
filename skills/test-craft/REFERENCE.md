# Test craft reference

Examples for [SKILL.md](SKILL.md). The examples are TypeScript with a Jest-style API. The ideas hold in any language.

## Contents

- Good tests
- Bad tests
- Property tests without a library
- When to mock
- A planted bug, worked through

## Good tests

**Through the real interface.** Test through public interfaces, not mocks of internal parts.

```typescript
// GOOD: tests observable behaviour
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

A good test:

- tests behavior that users or callers care about
- uses the public interface only
- survives a refactor of the internals
- says what the code does, in the test name too
- makes one logical check

## Bad tests

**Tied to the layout.** Coupled to the internal structure.

```typescript
// BAD: tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Warning signs:

- mocks internal collaborators
- tests private methods
- checks call counts or call order
- breaks on a refactor with no change in behavior
- the test name says how, not what
- checks through a side channel in place of the interface

```typescript
// BAD: goes around the interface to check
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: checks through the interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautological.** The expected value restates the code, so the test passes by construction.

```typescript
// BAD: expected value is worked out the way the code works it out
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: expected value is a literal worked out by hand
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```

## Property tests without a library

If the project has no property-testing library, a seeded loop works. The check states the rule. It does not call a second copy of the code to get the answer.

```typescript
test("trimmed names are never longer than 40 characters", () => {
  const random = seededRandom(42);
  for (let i = 0; i < 500; i++) {
    const raw = randomString(random, { maxLength: 200, spaces: true });
    const name = normaliseName(raw);
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name).toBe(name.trim());
  }
});
```

When a case fails, print the seed and the failing input. Then you can replay the failure.

## When to mock

Mock only at system boundaries:

- external APIs (payment, email and so on)
- databases, sometimes. A test database is better.
- time and randomness
- the file system, sometimes

Do not mock:

- your own classes or modules
- internal collaborators
- anything you control

### Design for mocks at the boundary

**1. Pass dependencies in.** Pass external dependencies in. Do not create them inside.

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. One function per external operation.** Use this in place of one generic fetcher with conditional logic.

```typescript
// GOOD: each function can be mocked on its own
const api = {
  getUser: (id) => fetch("/users/" + id),
  getOrders: (userId) => fetch("/users/" + userId + "/orders"),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};

// BAD: the mock needs conditional logic inside it
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

With one function per operation, each mock returns one shape. Test setup has no conditions. You can see which endpoints a test uses.

## A planted bug, worked through

A new lint rule bans `console.log` in `src/`.

1. Run the linter on clean code. It passes.
2. Add `console.log("x")` to one file in `src/`.
3. Run the linter. It fails and names that file and line.
4. Delete the line. `git diff` shows no change left.
5. Run the linter. It passes.

Report all three runs with their output.
