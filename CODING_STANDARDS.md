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

A comment is a smell. The default is none. Wanting to write one is a sign the code isn't saying
enough, so fix the code first:

- A comment that explains a block: extract the block into a function named after the explanation.
- A comment that explains a value: give it a named constant or variable.
- A comment that explains a parameter or state: give it a type that can't hold the wrong value, or
  an assertion.
- A comment that explains what a function does: rename the function.

What survives is the one thing code can't hold: **why**. That covers a constraint from outside the
code, an invariant the types can't express, a choice that looks wrong but isn't, or a workaround
for an upstream bug. One line where possible. A workaround links the upstream issue, so the next
reader knows when to delete it.

Never write:

- **What the code does.** If a reader needs it, the names are wrong.
- **History.** No "now", "previously", "no longer", "we changed", PR or ticket numbers. The commit
  and the PR body carry how the code came to be.
- **Pointers that rot.** No lists of implementations, callers or the places a value flows to. No
  "see ADR/§X" in place of a reason.
- **Restated types.** No `@param`/`@returns` that repeats the signature. No "Optional." on a `?`.
- **Words for a reviewer.** No notes to whoever reads the diff.
- **File headers** that summarise the module.

When a declaration or member needs a comment, make it `/** */`, because editors show it on hover and
nothing shows a `//` there. Say only what its signature can't: a precondition, what it throws, a
surprising behaviour. A code example for an extension point belongs there too. Inside a function
body, use `//`; nothing hovers a local.

When a change alters behaviour a comment describes, correct the comment or delete it. Don't replace
it with something vaguer. When you edit a function, delete the comments in it that break these
rules.

Lint enforces the mechanical part in all linted code, tests included: a comment block stays within
30 words, code examples aside (`plumix/max-comment-length`); a comment on a declaration or member is
`/** */` (`plumix/prefer-jsdoc`); no `/** */` sits inside a function body
(`plumix/no-jsdoc-in-function-body`); and no code is left commented out
(`sonarjs/no-commented-code`).

**In review**, treat every added comment line as a finding until it passes these rules. Name the
refactor that would make it unnecessary, or say which rule it breaks. Lint can't tell a why from a
what; review can.

## Correctness

Handle every case a caller can actually produce, including empty, missing and failing input.
Before you handle a state, check that real use can reach it. A guard for a state nothing reaches is
a safety net nobody asked for.

An empty string in a config slot means the option is off, the same as `false` or leaving the slot
out. Validation rejects only the shapes a ticket names as rejected; it does not turn an empty
string into a boot error on its own.

Code adds nothing to a tool's output: no warning, deprecation notice or stray log in a build, test
or lint run. A test that takes an error path spies on the log it expects. A suppressed false
positive is filtered at its source by code and message, with a comment naming why.

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

Plumix has three test tiers: **unit**, **e2e** and **smoke**. A tier is chosen by what the test
needs to observe the behaviour, never by convenience, and each tier has one location, one runner and
one CI job ([ADR 0042](docs/adr/0042-tests-come-in-three-tiers.md)). Typecheck, lint, format, knip,
publint, attw, `i18n:check`, `migrations:check` and the link check are **gates**, not tiers: they
check code without running it, and a new check of that kind joins an existing gate.

| Tier  | Proves                                               | Lives in                              | Runs with        | CI job             |
| ----- | ---------------------------------------------------- | ------------------------------------- | ---------------- | ------------------ |
| Unit  | the logic behind a behaviour, through its public API | `src/foo.test.ts` beside `src/foo.ts` | `pnpm test:unit` | `Test`             |
| E2E   | what a consumer sees and does on a running site      | the package's `e2e/*.spec.ts`         | `pnpm test:e2e`  | `Test (e2e)`       |
| Smoke | a project scaffolded from the packed tarballs works  | `create-plumix-app/scripts/smoke.mjs` | `smoke:scaffold` | `Smoke (scaffold)` |

### Where a test goes

Ask in order, and stop at the first yes:

1. **Can it be observed by calling code in one process, on source?** It's a unit test. This covers
   almost everything: business rules, RPC procedures, plugin hooks and filters, routing, rendering to a string,
   schema and query behaviour against the in-memory database, CLI argument handling, a Vite
   plugin's config. When in doubt, it's a unit test.
2. **Does it need a browser, or a site a user drives?** It's an e2e test: a page that renders and
   reacts, a form that posts, an upload through the UI, the editor under the keyboard and pointer,
   layout, focus.
3. **Does it need what a consumer installs: the packed tarballs, a real package manager, the real
   runtime binary serving a built project?** It's a smoke step.

A behaviour is tested once, in the lowest tier that can observe it. A higher tier proves the parts
connect, not the rules a lower tier already covers. When e2e or smoke finds a bug in logic, the fix
starts with a unit test that reproduces it.

A change that edits a test brings that test in line with this section: one in the wrong tier moves
to the right one, and one that breaks a rule below is rewritten. Review holds every touched test to
it.

### Unit

A unit test checks one behaviour of the code's public API (an exported function, a procedure, a
hook, a route, a plugin descriptor), the way a caller uses it. It runs in one process with Vitest,
on the package's own runtime (a runtime adapter's suite runs on that runtime,
[ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)),
and it reads source: `pnpm test:unit` needs no build.

- **It may use** the real collaborators, the in-memory database from the test harness (built from
  the shipped migration histories), a temporary directory it creates and removes, and the fakes in
  the shared test kits.
- **It stays inside the process.** No browser, no simulated DOM (`jsdom`, `happy-dom`, a
  `@vitest-environment` docblock), no child process, no network beyond an in-process handler, no
  `dist/`, no sleeps. The `plumix/test-tier` lint rule reports DOM APIs in a unit test.
- **A component keeps its logic in functions it calls.** A unit test calls those functions, or
  renders the component to a string. What the rendered DOM does when a user acts on it is e2e.
- **An upload is a value.** Call the procedure with a native `File` (`fakeFile`, `fakeImage`); Node
  has `File`, `Blob`, `FormData` and `fetch`. One test of the wire format sends it through the RPC
  link into the handler in-process.

```ts
// packages/core/src/entries/read-service.test.ts
test("clamps a subscriber to published entries by default", async () => {
  const h = await createRpcHarness({ authAs: "subscriber" });
  await h.factory.published.create({ authorId: h.user.id, slug: "pub" });
  await h.factory.draft.create({ authorId: h.user.id, slug: "draft" });

  const rows = await listEntries(authedCtx(h), listInput());

  expect(rows.map((r) => r.slug)).toEqual(["pub"]);
});
```

### E2E

An e2e test drives a running Plumix site in Chromium with Playwright, the way a visitor or an
editor does. Each package with a user-facing surface (the admin, the editor, a plugin, a runtime's
playground) owns one suite in its `e2e/` folder, against a site on its own ports.

- **It proves a journey or a browser behaviour**: the page renders, the control reacts, the request
  lands, the result shows. The rules behind it are already unit tests; e2e checks they reach the
  screen.
- **It sets up through the site.** Seed with the suite's own setup, sign in the way a user does,
  and assert on what the page shows.
- **It queries by test id only** (`page.getByTestId`, `[data-testid=…]`); the
  `plumix/no-non-testid-queries` lint rule enforces it. Add a `data-testid` to the markup when none
  exists.
- **It waits on the page, never on the clock.** Wait for the element whose listener it drives
  before it dispatches input: a click, key or wheel sent straight after navigation races that
  listener's mount. Use Playwright's auto-waiting assertions; a `waitForTimeout` is a bug.

```ts
// packages/plugins/media/e2e/media.spec.ts (abridged)
test("an uploaded image shows up in the library", async ({ page }) => {
  await page.goto("pages/media");
  await expect(page.getByTestId("media-library-dropzone")).toBeVisible();

  const confirmed = page.waitForResponse(
    (r) => r.url().endsWith("/media/confirm") && r.status() === 200,
  );
  await page
    .locator('[data-testid="media-library-upload"] input[type="file"]')
    .setInputFiles({
      name: "smoke.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
  await confirmed;

  const cards = page.locator(
    "[data-testid='media-library-grid'] > [data-testid^='media-card-']",
  );
  await expect(cards).toHaveCount(1);
});
```

### Smoke

A smoke step checks that what a consumer installs works at all. `smoke:scaffold` packs every
publishable package, scaffolds a project for each runtime the registry lists, installs it with that
runtime's package manager, then typechecks, builds, applies migrations and starts it, and requests
the home page, the admin shell and the session RPC. The root `pnpm smoke` does the same through a
throwaway registry before a release.

- **It answers one question per step: did it install, build, start, answer?** A step that asserts
  feature behaviour belongs in e2e, and a rule belongs in a unit test.
- **A new smoke check is a new step in that loop**, so every runtime gets it. It never starts a
  second harness or a new job.
- **It reads only what a consumer gets**: the tarballs and the scaffolded project, never the
  workspace's source.

### Test doubles

Use the real thing when it is fast and deterministic. Otherwise use a fake the owner provides. Stub
only a boundary Plumix doesn't own, and keep it narrow.

1. **Real.** Collaborators inside Plumix, and the in-memory database, are used as they are.
2. **Fake.** The package that owns an interface ships its fake in its test kit (`plumix/test`,
   `@plumix/core/test`), and the fake has tests of its own. A runtime's slots pass the shared
   conformance suites (`plumix/test/conformance`), which is what keeps the fakes honest. Add a new
   fake there, as high up as every caller can use it.
3. **Stub.** Only a boundary outside Plumix: a third-party HTTP API, the mail transport, the clock,
   randomness, a platform global (`vi.stubGlobal`). Inject the dependency when the code doesn't
   take one yet: add the seam to the source.
4. **Never mock a module.** `vi.mock` couples a test to where code lives; the `plumix/no-module-mocking`
   lint rule rejects it. Wrap a third-party type behind an interface Plumix owns and double that.

Assert on the outcome (the returned value, the stored state, the captured mail), not on which
functions ran. A spy is for an outgoing effect at a boundary, and it asserts only the arguments that
matter.

### Writing a test

- **One behaviour per test, named for it**: "publishing a draft makes it readable", not
  "publish() calls save()". The name and the failure message say what broke.
- **Arrange, act, assert, in straight-line code.** No branches or loops: a test that branches can
  pass on the branch that checked nothing. Use `it.each` for one case per input. Repeat the values
  that matter in each test rather than hiding them in a helper.
- **Expected values come from outside the code**: a literal, a worked example, the spec. A value
  copied from the output, or recomputed the way the code computes it, can't fail.
- **Cover the requirement and its edge cases, not the lines a change touched.** If breaking the
  rule a test names leaves it green, rewrite it or delete it. Don't test a value that is statically
  defined, or logic that was removed.
- **Deterministic and hermetic.** Fake the clock (`vi.useFakeTimers`, an injected `now`), seed
  randomness, and wait on a condition, never a delay. Each test builds its own state and passes in
  any order. A flaky test is a bug: fix it in the change that finds it.
- **Seed with the fishery factories**, not raw writes, and reuse the shared helpers
  (`plumix/test`, `packages/admin/test/`). Put a new test in the suite that already covers the area.
- **Never change a test just to make it pass**: the test may be the only thing that's right. When
  you can't tell which side is wrong, stop and say so.

### TDD

Every change is test-first, one cycle at a time:

1. **List** the behaviours the change needs, as test names.
2. **Red.** Turn exactly one into a test, in the tier the placement rules pick, and run it. It must
   fail, for the reason the behaviour is missing: read the failure, not just the colour. A bug fix
   starts with a test that fails without the fix.
3. **Green.** Write the least code that makes it and every earlier test pass.
4. **Refactor** only on green, as its own step, with the tests unchanged.
5. **Repeat** from the list. Add to the list what each cycle teaches; never write all the tests
   first.

Report what you ran: the command, and the files or package it covered.

### Timeouts

Override a timeout only as a last resort. Profile the slow test first and fix what the profile
shows. Keep an override only when the whole suite's timings call for it, not its single slowest
test. [`docs/agents/testing.md`](docs/agents/testing.md#a-slow-test) has the usual causes.
