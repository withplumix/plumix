# Coding standards

## Interface design

### Deep modules

Prefer deep modules, with a small interface over a deep implementation. A few methods with simple
params hide complex logic behind them.

Avoid shallow modules, where a large interface has many methods that pass through to a thin
implementation. When designing, ask whether you can reduce the number of methods, simplify the
parameters, or hide more complexity inside.

### Design for testability

1. **Accept dependencies, don't create them.** Pass external dependencies in rather than
   constructing them internally.
2. **Return results, don't produce side effects.** A function that returns a value is easier to
   test than one that mutates state.
3. **Keep the interface small.** Fewer methods need fewer tests, and fewer params make simpler test
   setup.

## Readability

Explicit code is often better than compact code.

- Return early instead of wrapping the rest of a function in a branch.
- Branch with `if`/`else` or a `switch` when there are more than two outcomes. Never nest
  ternaries.
- Name the intermediate steps of a long chain rather than writing one dense expression.
- Inline an abstraction that only renames an expression (`isNotEmpty(items)` is
  `items.length > 0`). Keep one that hides real logic or names a domain concept.
- Give each function one concern. Merging two to save lines makes both harder to change.
- Name things with the vocabulary in [`GLOSSARY.md`](./GLOSSARY.md).
- Declare top-level functions with `function`, and give exported ones an explicit return type.

A simplification changes how code reads, never what it does. Every output and behaviour stays the
same.

### Comments

Let names and structure carry the meaning. Write a comment only for what the reader can't recover
from the code, and delete one that repeats what the names or types already say.

- Write for someone who opens the file months later with no ticket, PR or diff. Say how the code
  works and why, not how it came to be. Leave out "now", "previously" and "no longer", and never
  address a reviewer.
- A `/** */` block states the contract, meaning behaviour, parameters, return value and what it
  throws. A `//` comment gives the reasoning.
- A workaround names the issue or PR that explains it.
- When a change alters documented behaviour, correct the existing text. Don't replace it with
  something vaguer.

## Correctness

Handle every case a caller can actually produce, including empty, missing and failing input.
Before you handle a state, check that real use can reach it. A guard for a state nothing reaches is
a safety net nobody asked for.

## Performance

- Load a set of records in one query (`WHERE id IN (…)`), never one query per record. On the
  client, send one request for the set, not one per item.
- Keep work proportional to the input. Nothing quadratic over a list a user can grow.
- The anonymous request path only gets cheaper. A query added to a logged-out render, cold start
  included, needs a reason in the PR.
- When a query's cost matters, measure the exact statement the code builds, every predicate
  included, and read its `EXPLAIN QUERY PLAN`. A simplified copy can plan an index walk as a table
  sort, or the reverse.

## User-facing text

Everything a user reads goes through a Lingui descriptor (`useLabel`), never hardcoded English.
That covers JSX text, `aria`, `title` and `alt` attributes, toasts and block metadata.

## Compatibility

TypeScript is the contract. Change a published API directly, so the type checker reports every
caller that has to follow, and announce the break in the changeset. Don't keep the old shape alive
beside the new one with a deprecated alias or a shim.

## Schema changes

Never change a migration an install has already applied. To change what it did, add a new
migration under a new name, because installs that ran the old one won't run it again.

## Security

- Keep request data out of module scope. One isolate or process serves many users, so a
  module-level cache or variable that holds request or user data leaks it to the next request.
- Build SQL with drizzle's query builder or its `sql` template, which binds values. Pass `sql.raw`
  only text the code wrote itself, never input.
- Render user content as text. Markup from input reaches `dangerouslySetInnerHTML` only through
  `sanitizeHtml` with the site's allowlist. Check a URL from input before it becomes an `href`.
- Every procedure and route that reads or writes protected data checks a capability with
  `ctx.auth.can()` or `requireCapability`.

## Tests

Each package has one vitest suite. Put a test in one of two places, in this order:

1. **Next to the source.** `src/foo.test.ts` sits beside `src/foo.ts`, and `src/foo.browser.test.tsx`
   for the browser tier. This is the default, including for tests that use an in-memory database or
   the helpers from `@plumix/core/test`, since those run inside the vitest worker.
2. **In the package's `test/` folder.** Use it only when a test can't sit next to the source,
   because it spawns a real binary, runs against the built `dist/`, or uses the package the way an
   outside consumer would.

End-to-end tests use Playwright, live in each package's `e2e/` folder, and run with
`pnpm test:e2e`.

### Test code

A test has no branches or loops of its own, because a test that branches can pass on the branch
that checked nothing. Use `it.each` to run one case per input. Cover the requirement the change
serves and its edge cases, not the lines it touched. Assert on what the code did, not on what it
called. A spy that shares the code's own assumption can't fail. Neither can a test whose
assertion holds whatever the code does: if breaking the rule a test names leaves it green, rewrite
it or delete it.

Never change a test just to make it pass, because the test may be the only thing that's right. When
you can't tell which side is wrong, stop and say so.

### Shared helpers

Put a new test in the suite that already covers the area, not in a second setup of your own. Seed
data through the fishery factories, not raw writes. Reuse the helpers a package already shares
before you write a new one, `plumix/test` in a consumer package and `packages/admin/test/` in the
admin. When you need a new place to swap in a test double, add it to the shared helpers, as high up
as every caller can use it.

### Timeouts

Override a timeout only as a last resort. Profile the slow test first and fix what the profile
shows. Keep an override only when the whole suite's timings call for it, not its single slowest
test.
