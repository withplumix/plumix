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

| Tier  | Proves                                               | Lives in                                       | Runs with                                        | CI job             |
| ----- | ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------ |
| Unit  | the logic behind a behaviour, through its public API | `src/foo.test.ts` beside `src/foo.ts`          | `pnpm test:unit`                                 | `Test`             |
| E2E   | what a consumer sees and does on a running site      | the package's `e2e/*.spec.ts`                  | `pnpm test:e2e`                                  | `Test (e2e)`       |
| Smoke | a project scaffolded from the packed tarballs works  | `packages/create-plumix-app/scripts/smoke.mjs` | `pnpm --filter create-plumix-app smoke:scaffold` | `Smoke (scaffold)` |

### Where a test goes

Ask in order, and stop at the first yes:

1. **Can it be observed by calling code in one process, on source?** It's a unit test. This covers
   almost everything: business rules, RPC procedures, plugin hooks and filters, routing, rendering
   to a string, schema and query behaviour against the in-memory database, CLI argument handling,
   a Vite plugin's config. When in doubt, it's a unit test.
2. **Does it need a browser, or a site a user drives?** It's an e2e test: a page that renders and
   reacts, a form that posts, an upload through the UI, the editor under the keyboard and pointer,
   layout, focus.
3. **Does it need what a consumer installs: the packed tarballs, a real package manager, the real
   runtime binary serving a built project?** It's a smoke step.

The cases that look like a fourth kind each have a tier:

- **A CLI command** is a unit test of its command function, called in-process with its arguments.
  Running the installed binary in a scaffolded project is smoke.
- **A build's output.** A unit test may run Vite or esbuild in-process over a fixture it builds from
  source, and assert on what that build produced. What the workspace's `dist/` or a scaffolded
  project's production build contains is smoke.
- **A runtime server's process behaviour.** The request rules (timeouts, body limits, trusted
  proxies) are unit tests of the handler. That the built server starts on the runtime, answers and
  exits cleanly on `SIGTERM` is smoke.

A behaviour is tested once, in the lowest tier that can observe it. A higher tier proves the parts
connect, not the rules a lower tier already covers. When e2e or smoke finds a bug in logic, the fix
starts with a unit test that reproduces it. A test that a lower tier now covers, or that checks
behaviour the code no longer has, is deleted.

A change that adds or edits a test case brings that case in line with this section: a case in the
wrong tier moves to the right one, and a case that breaks a rule below is rewritten. The rest of its
file moves with the change that next edits it. Review holds every added or edited case to it.

### Unit

A unit test checks one behaviour of the code's public API (an exported function, a procedure, a
hook, a route, a plugin descriptor), the way a caller uses it. It sits beside the source it tests.
A test of a package as a whole, its configuration or its exports, goes in that package's `test/`
folder, with any fixture files under `test/fixtures/`. It runs in one process with Vitest, on the
package's own runtime (a runtime adapter's suite runs on that runtime,
[ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)),
and it reads source: `pnpm test:unit` needs no build.

- **It may use** the real collaborators, the in-memory database from the test harness (built from
  the shipped migration histories), a temporary directory it creates and removes, and the fakes in
  the shared test kits.
- **It stays inside the process.** No browser, no simulated DOM (`jsdom`, `happy-dom`, a
  `@vitest-environment` docblock), no child process, no network beyond an in-process handler, no
  `dist/`, no sleeps. The `plumix/test-tier` lint rule reports DOM APIs in a unit test.
- **A component keeps its logic in functions it calls.** Which state it shows (a validation error,
  an empty list, a control a role may not use) is decided by a function the component calls, and
  the unit test calls that function for each state. The unit test may also render the component
  to a string. What the rendered DOM does when a user acts on it is e2e, for the journeys a user
  takes, not for every state the function already covers.
- **An upload is a value.** Call the procedure with a native `File` (`fakeFile`, `fakeImage`); Node
  has `File`, `Blob`, `FormData` and `fetch`. One test of the wire format sends it through the RPC
  link into the handler in-process.

```ts
// packages/core/src/entries/change-feed.test.ts
test("records a create and an update made through the RPC surface", async () => {
  const h = await createRpcHarness({ authAs: "author" });
  const created = await h.client.entry.create({
    title: "Hello",
    slug: "hello",
  });
  await h.client.entry.update({ id: created.id, title: "Hello again" });

  const changes = await readEntryChanges(h.db, 10);

  expect(changes.map((change) => [change.entryId, change.kind])).toEqual([
    [created.id, "upsert"],
    [created.id, "upsert"],
  ]);
});
```

### E2E

An e2e test drives a running Plumix site in Chromium with Playwright, the way a visitor or an
editor does. Each package with a user-facing surface (the admin, the editor, a plugin, a runtime's
playground) owns one suite in its `e2e/` folder, against a site on its own ports.

- **It proves a journey or a browser behaviour**: the page renders, the control reacts, the request
  lands, the result shows. The rules behind it are already unit tests; e2e checks they reach the
  screen.
- **It seeds once, in the suite's `globalSetup`**, with the helpers in `plumix/test/playwright`:
  `openPlaygroundDb` opens the migrated database and `actingAs` creates a user and its session,
  saved as the `storageState` every page starts with. A spec acts only through the page and asserts
  only on what the page shows.
- **It queries by test id only** (`page.getByTestId`, `[data-testid=…]`); the
  `plumix/no-non-testid-queries` lint rule enforces it. Add a `data-testid` to the markup when none
  exists.
- **It waits on the page, never on the clock.** Wait for the element whose listener it drives
  before it dispatches input: a click, key or wheel sent straight after navigation races that
  listener's mount. Use Playwright's auto-waiting assertions; a `waitForTimeout` is a bug.

```ts
// packages/plugins/media/e2e/media.spec.ts, the upload steps of this test
test("empty state → upload → card visible → delete → empty again", async ({
  page,
}) => {
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
the home page, the admin shell and the session RPC. Before a release, the root `pnpm smoke`
publishes the packages to a throwaway registry, scaffolds a Cloudflare project from it and boots
`plumix dev`.

- **It answers one question per step: did it install, build, start, answer, stop?** A step that
  asserts feature behaviour belongs in e2e, and a rule belongs in a unit test.
- **A new smoke check is a new step in `smoke:scaffold`'s loop**, so every runtime gets it, never
  a new harness or a new job.
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
4. **Never mock a module.** `vi.mock` couples a test to where code lives; the
   `plumix/no-module-mocking` lint rule rejects it. Wrap a third-party type behind an interface
   Plumix owns and double that.

A failure path is a unit test too: make the fake or stub fail (a rejected send, a storage error,
a timeout) and assert what the caller does with it.

Assert on the outcome (the returned value, the stored state, the captured mail), not on which
functions ran. A spy is for an outgoing effect at a boundary, and it asserts only the arguments that
matter.

### Writing a test

- **Test code meets the production bar.** Every naming, readability and review rule for code
  applies to tests, except that a test repeats itself where that makes it read on its own. A suite
  nobody can read gets discarded, so a messy test is rewritten, not tolerated.
- **One behaviour per test, named for it**: a sentence about the behaviour, "publishing a draft
  makes it readable", never the method it calls ("publish() calls save()"). The `describe` names
  the subject. The name and the failure message say what broke.
- **The domain's words.** A test's name, its `describe` and its helpers use the vocabulary in
  [`GLOSSARY.md`](./GLOSSARY.md) (entry, term, principal, segment) the way the code does, and a
  helper reads in those words (`h.factory.draft.create`, `actingAs(db, "admin")`), so a test reads
  like the behaviour it checks.
- **One act per test.** A second call to the code under test is a second test, or a row of
  `it.each`.
- **Arrange, act, assert, in straight-line code.** No branches or loops: a test that branches can
  pass on the branch that checked nothing. Use `it.each` for one case per input. Repeat the values
  that matter in each test rather than hiding them in a helper, and write literals inline; give a
  value a name only when its meaning is not obvious from the literal.
- **Expected values come from outside the code**: a literal, a worked example, the spec. A value
  copied from the output, or recomputed the way the code computes it, can't fail. The one place an
  expected value is read off the code is a **characterization test**: before a structural change
  to code no test covers, pin what it does today, in the same change, with a name that says so
  ("keeps today's slug for a title with emoji").
- **Cover the requirement and its edge cases, not the lines a change touched.** If breaking the
  rule a test names leaves it green, rewrite it or delete it. Don't test a value that is statically
  defined, or logic that was removed.
- **Deterministic and hermetic.** Fake the clock (`vi.useFakeTimers`, an injected `now`), seed
  randomness, and wait on a condition, never a delay. Each test builds its own state and passes in
  any order.
- **A flaky test is a bug.** Unit tests never retry. E2E retries twice on CI (the shared
  Playwright config), so a slow runner does not block a merge, and a test Playwright reports as
  flaky is fixed in the change that finds it. When its cause lies outside that change, open an
  issue and skip the test with `test.skip` and the issue number in its name; an unexplained skip
  is not allowed. `test.skipIf` is only for a platform that lacks what the test needs.
- **Fast.** A unit test runs in milliseconds. Vitest's 5s timeout catches hangs, it is not a
  budget: a unit test over one second is profiled before merge
  ([`docs/agents/testing.md`](docs/agents/testing.md#a-slow-test)).
- **Expected values are written out.** No snapshot or screenshot baselines (`toMatchSnapshot`,
  `toMatchInlineSnapshot`, `toHaveScreenshot`): a reviewer reads the expected value in the test.
- **A type contract is a unit test.** Assert it with `expectTypeOf` in the module's `*.test.ts`;
  the typecheck gate is what checks it, because the test files are in each package's program.
- **A performance property is a count**: the queries a call runs, the bytes a chunk ships. Assert
  the count, never elapsed time. Benchmarks and load tests are not tests: they run by hand against
  a deployed site, never in CI.
- **Coverage is tracked, not targeted.** No package sets a threshold. A test exists to check a
  behaviour, never to raise the number.
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
4. **Refactor** only on green, as its own step and its own commit, with the tests unchanged. A
   commit either changes behaviour or changes structure, never both.
5. **Repeat** from the list. Add to the list what each cycle teaches; never write all the tests
   first.

### Reviewing a test

Review asks of every added or edited test:

- Does it sit in the tier the placement questions pick, and touch only what that tier allows?
- Would it fail if the behaviour it names broke? Break the rule in your head, or for real.
- Does its name state the behaviour, and does it make one simple assertion about it?
- Is it straight-line, with literal expected values and no logic of its own?
- Did the change ship its tests with it? A change without its tests is incomplete.

### Timeouts

Override a timeout only as a last resort. Profile the slow test first and fix what the profile
shows. Keep an override only when the whole suite's timings call for it, not its single slowest
test. [`docs/agents/testing.md`](docs/agents/testing.md#a-slow-test) has the usual causes.
