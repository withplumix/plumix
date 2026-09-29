# Coding standards

## Interface design

### Deep modules

Prefer deep modules: small interface, deep implementation. A few methods with simple params hiding
complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through to thin
implementation. When designing, ask: can I reduce the number of methods? Can I simplify the
parameters? Can I hide more complexity inside?

### Design for testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than
   constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to
   test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.

## Readability

Choose clarity over brevity: explicit code is often better than compact code.

- Reduce nesting: return early instead of wrapping the rest of a function in a branch.
- Branch with `if`/`else` or a `switch` when there are more than two outcomes, not with nested
  ternaries.
- Name the intermediate steps of a long chain rather than writing one dense expression.
- Inline an abstraction that only renames an expression (`isNotEmpty(items)` is
  `items.length > 0`). Keep one that hides real logic or names a domain concept.
- Keep one concern per function. Merging two to save lines makes both harder to change.
- Name things with the vocabulary in [`CONTEXT.md`](./CONTEXT.md).
- Declare top-level functions with `function`, and give exported ones an explicit return type.

A simplification changes how code reads, never what it does: every output and behaviour stays
the same.

### Comments

Let names and structure carry the meaning. A comment says something the reader cannot recover
from the code: if the names or types already carry it, delete it.

- Write for someone reading the file months later with no access to the ticket, the PR or the
  diff. State how the code works and why, not how it came to be: no "now", "previously" or
  "no longer", and nothing addressed to a reviewer.
- `/** */` states the contract: behaviour, parameters, return, what it throws. `//` carries the
  reasoning.
- A workaround names the issue or PR that explains it.
- When a change alters documented behaviour, correct the existing text rather than replacing it
  with something vaguer.

## Correctness

Handle every case a caller can actually produce: the empty, the missing and the failing one, not
only the happy path. Before adding handling for a state, establish that real use can reach it; a
guard for an unreachable state is a safety net nobody asked for.

## Performance

- Batch data access: load a set of records in one query (`WHERE id IN (…)`), never one query per
  record. On the client, one request for the set, not one per item.
- Keep work bounded by the input: nothing quadratic over a list a user can grow.
- The anonymous request path only gets cheaper. A query added to a logged-out render, cold start
  included, needs a reason the PR states.
- When a query's cost matters, measure the statement the code builds, every predicate included, and
  read its `EXPLAIN QUERY PLAN`. A simplified copy can plan an index walk as a table sort, or the
  reverse.

## User-facing text

Everything a user reads — JSX text, `aria`/`title`/`alt`, toasts, block metadata — goes through a
Lingui descriptor (`useLabel`), never hardcoded English.

## Compatibility

TypeScript is the contract. Change a published API directly, so the type checker reports every
caller that has to follow, and announce the break in the changeset. Don't keep the old shape
alive beside the new one with a deprecated alias or a shim.

## Schema changes

A migration an install has applied never changes. To change what it did, add a new migration
under a new name, because installs that ran the old one will not run it again.

## Security

- Module scope holds nothing from a request. One isolate or process serves many users, so a
  module-level cache or variable that captures request or user data leaks it to the next request.
- Build SQL with drizzle's query builder or its `sql` template, which binds values. `sql.raw`
  takes only text the code wrote itself, never input.
- Render user content as text. Markup from input reaches `dangerouslySetInnerHTML` only through
  `sanitizeHtml` with the site's allowlist, and a URL from input is checked before it becomes an
  `href`.
- Every procedure and route that reads or writes protected data checks a capability through
  `ctx.auth.can()` or `requireCapability`.

## Tests

One vitest suite per package. Two layouts, in order of preference:

1. **Colocate** — `src/foo.test.ts` next to `src/foo.ts`. Default for everything, including tests that use in-memory DBs or the harnesses from `@plumix/core/test` (they run inside the vitest worker), and `src/foo.browser.test.tsx` for the browser tier.
2. **Package-level `test/`** — only when colocation can't work: tests that spawn a real binary, run against built `dist/`, or exercise the package as an external consumer.

E2E (Playwright) is separate, lives under each package's `e2e/`, runs via `pnpm test:e2e`.

### Test code

A test has no branches or loops of its own: a test that branches can pass on the branch that
checked nothing. Run one case per input with `it.each`. Cover the requirement the change serves and
its edge cases, not the lines it touched. Assert on what the code did, not on what it called: a spy
that shares the code's own assumption cannot fail.

Never change a test just to make it pass; the test may be the only thing that is right. When you
cannot tell which side is wrong, stop and say so.

### Shared helpers

Put a new test in the suite that already covers the area rather than adding a second harness. Seed
data through the fishery factories, not raw writes. Reuse the helpers a package already shares
before writing a new one: `plumix/test` in a consumer package, `packages/admin/test/` in the
admin. A new seam goes in the shared place, at the highest point that serves every caller.

### Timeouts

A timeout override is the last resort. Profile the slow test first and fix what it shows. Keep an
override only when the whole suite's timings call for it, not its single slowest test.
