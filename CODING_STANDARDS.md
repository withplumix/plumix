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

A comment that claims a coupling ("mirrors", "keep … in sync", "must match") is an invariant
nothing checks. Collapse the duplication first, so one source holds the fact. When the copies
can't be collapsed, bind them with a test that fails when they drift, and name it with
`Guarded by: <repo-relative test path>` on one of the comment's lines. When the comment describes
a resemblance rather than an invariant, reword it. `plumix/sync-comment-guarded` enforces this
with no exceptions
([ADR 0038](docs/adr/0038-a-coupled-invariant-is-collapsed-or-guarded-by-a-test.md)).

A `plumix/*` rule ships only when it has zero false positives on the tree: every hit is a genuine
violation, with only the existing named escape hatches (`// Safety:`, `Not JSON:`). A baseline
that only shrinks may list the genuine violations still awaiting a fix, never a false positive.

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
one CI job, bar the smoke's editor spec, which Playwright runs inside the smoke
([ADR 0042](docs/adr/0042-tests-come-in-three-tiers.md)). The section covers every
workspace package and app; `.sandcastle`, the ship loop's own harness, sits outside the workspace
and outside the tiers. Typecheck, lint, format, knip, publint, attw, `i18n:check`,
`migrations:check` and the link check are **gates**, not tiers: they check code without running
it, and a new check of that kind joins an existing gate. [Mutation testing](#mutation-testing) is
neither: it reviews the unit tier.

| Tier  | Proves                                               | Lives in                                                                                      | Runs with             | CI job             |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- | ------------------ |
| Unit  | the logic behind a behaviour, through its public API | `src/foo.test.ts` beside `src/foo.ts`; a feature test in `tests/feature/`                     | `pnpm test:unit`      | `Test`             |
| E2E   | what a consumer sees and does on a running site      | the package's `tests/e2e/*.spec.ts`, against its `playground/`                                | `pnpm test:e2e`       | `Test (e2e)`       |
| Smoke | a project scaffolded from the packed tarballs works  | `packages/create-plumix-app/scripts/smoke.mjs`, and the editor spec under `smoke/dev-editor/` | `pnpm smoke:scaffold` | `Smoke (scaffold)` |

### Where a test goes

Ask in order, and stop at the first yes:

1. **Can it be observed by calling code in one process, on source?** It's a unit test. This covers
   almost everything: business rules, RPC procedures, plugin hooks and filters, routing, rendering
   to a string, schema and query behaviour against the in-memory database, CLI argument handling,
   a Vite plugin's config. When in doubt, it's a unit test. When the behaviour is what a site does
   through one of its entry points (a request, an RPC call, a scheduled firing), it's the feature
   kind of unit test, driven through a test site.
2. **Does it need a browser, or a site a user drives?** It's an e2e test: a page that renders and
   reacts, a form that posts, an upload through the UI, the editor under the keyboard and pointer,
   layout, focus.
3. **Does it need what a consumer installs: the packed tarballs, a real package manager, the real
   runtime binary serving a built project?** It's a smoke step.

The cases that look like a fourth kind each have a tier:

- **A CLI command** is a unit test of its command function, called in-process with its arguments.
  Running the installed binary in a scaffolded project is smoke.
- **A build's output.** A unit test may run Vite or esbuild in-process over a fixture it builds from
  source, and assert on what that build produced: a chunk's size, a dev module tree-shaken out.
- **A published package's surface.** What a package exports and declares is checked by the publish
  gates (publint, attw and the `tooling/published-surface` roster), not by a test.
- **A behaviour only a browser has**: the DOMPurify sanitizer, an island's loading strategy,
  WebAuthn. It is an e2e spec that loads the module in a page of its suite's site and drives it with
  `page.evaluate`. A matrix of inputs is one test per input, declared in a loop at the top of the
  spec.
- **A runtime server's process behaviour.** The request rules (timeouts, body limits, trusted
  proxies) are unit tests of the handler. That the built server starts on the runtime, answers, and
  exits within its deadline on `SIGTERM` is smoke. That it opens one listener is a unit test of what
  the adapter's entry hands the runtime.

A behaviour is tested once, in the lowest tier that can observe it. A higher tier proves the parts
connect, not the rules a lower tier already covers. When e2e or smoke finds a bug in logic, the fix
starts with a unit test that reproduces it. A test that a lower tier now covers, or that checks
behaviour the code no longer has, is deleted.

A change that adds or edits a test case brings that case in line with this section: a case in the
wrong tier moves to the right one, and a case that breaks a rule below is rewritten. The rest of its
file moves with the change that next edits it. Review holds every added or edited case to it.

### Where a file goes

The unit tier holds two kinds of test, a unit test and a feature test
([ADR 0070](docs/adr/0070-a-site-is-tested-through-one-test-site-whose-services-are-fakes.md)).
Every package and site lays its tests out the same way:

| Path             | Holds                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/`           | unit tests, `foo.test.ts` beside `foo.ts`                                                                   |
| `tests/feature/` | feature tests, one file per capability, named for it (`submitting-a-form.test.ts`), never for a source file |
| `tests/e2e/`     | e2e specs                                                                                                   |
| `tests/support/` | helpers the feature tests and e2e specs share                                                               |
| `playground/`    | a package's site, run by hand and driven by its e2e; a site has none, since it is its own                   |

A suite still under `e2e/` moves to `tests/e2e/` with the change that ports it to the test site.

A test of a package as a whole, its configuration or its exports, stays in the package's `test/`
folder (see Unit below).

### Unit

A unit test checks one behaviour of the code's public API (an exported function, a procedure, a
plugin hook, a route, a plugin descriptor), the way a caller uses it. It sits beside the source it
tests. A test of a package as a whole, its configuration or its exports, goes in that package's
`test/` folder, with any fixture files under `test/fixtures/`. It runs in one process with Vitest,
on the package's own runtime wherever Vitest runs on it: Node, and Bun for the Bun adapter
(`bun --bun`,
[ADR 0019](docs/adr/0019-a-runtime-adapter-uses-its-runtimes-primitives-and-is-tested-on-that-runtime.md)).
The Cloudflare adapter's suite runs on Node, and its playground e2e and the smoke prove it on
workerd. It reads source: `pnpm test:unit` needs no build.

- **It may use** the real collaborators, the in-memory database from the test harness (built from
  the shipped migration histories), a temporary directory it creates and removes, and the fakes in
  the shared test kits.
- **It stays inside the process.** No browser, no simulated DOM (`jsdom`, `happy-dom`, a
  `@vitest-environment` docblock), no child process, no network beyond a listener on `127.0.0.1`
  port 0 that the test opens and closes itself (a runtime adapter testing its server primitive),
  no `dist/`, no sleeps. A child process is allowed only where how a process starts and stops is
  the behaviour under test (the e2e harness's process cleanup); such a file is named in
  `TESTS_OF_PROCESS_HANDLING` in `tooling/eslint/base.ts`. The `plumix/test-tier` lint rule reports
  DOM APIs and child processes in a unit test.
- **A React hook keeps its logic in functions it calls**, and the unit test calls those. The hook's
  wiring to React is covered where a component uses it, in e2e.
- **A component keeps its logic in functions it calls.** Which state it shows (a validation error,
  an empty list, a control a role may not use) is decided by a function the component calls, and
  the unit test calls that function for each state. The unit test may also render the component
  to a string. What the rendered DOM does when a user acts on it is e2e, for the journeys a user
  takes, not for every state the function already covers.
- **An upload is a value.** Call the procedure with a native `File` (`fakeFile`, `fakeImage`); Node
  has `File`, `Blob`, `FormData` and `fetch`. One test of the wire format sends it through the RPC
  link into the handler in-process.

```ts
// packages/core/src/entries/read-service.test.ts; authedCtx and listInput are this file's helpers
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
playground) owns one suite in its `tests/e2e/` folder (`e2e/` until the suite is ported), against
a site on its own ports.

- **It proves a journey, or a behaviour only a browser has**: the page renders, the control
  reacts, the request lands, the result shows. The rules behind it are already unit tests; e2e
  checks they reach the screen.
- **It seeds with the helpers in `plumix/test/playwright`.** The suite's `globalSetup` creates the
  shared state: `openPlaygroundDb` opens the migrated database and `actingAs` creates a user and
  its session, saved as the `storageState` every page starts with. A test that needs its own rows
  writes them at its start with `openPlaygroundDb`, and the `plumixDbBaseline` fixture restores the
  database between tests. Past seeding, a test acts through the page (navigation, input,
  `page.evaluate`) and asserts on what the page shows.
- **It queries by test id only** (`page.getByTestId`, `[data-testid=…]`); the
  `plumix/no-non-testid-queries` lint rule enforces it. Add a `data-testid` to the markup when none
  exists.
- **It waits on the page, never on the clock.** Wait for the element whose listener it drives
  before it dispatches input: a click, key or wheel sent straight after navigation races that
  listener's mount. Use Playwright's auto-waiting assertions; a `waitForTimeout` is a bug.
- **A drag goes through `dragTo`**, from `@plumix/core/test/playwright` inside the framework and
  `plumix/test/playwright` outside it, never through a `boundingBox()` read that aims `page.mouse`.

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
runtime's package manager, then typechecks, builds, applies migrations and starts it, requests the
home page, the admin shell and the session RPC, and stops it with `SIGTERM`. Each runtime's
`all-plugins` project then boots `plumix dev` and runs one Playwright spec in Chromium
(`packages/create-plumix-app/smoke/dev-editor/`), which loads the front page and selects an
installed plugin's block in the editor canvas
([ADR 0046](docs/adr/0046-the-scaffold-smoke-drives-the-editor-under-plumix-dev.md)). Before a
release, the root `pnpm smoke` publishes the packages to a throwaway registry, scaffolds a
Cloudflare project from it and boots `plumix dev`.

- **It answers one question per step about the installed project**: did it install, typecheck,
  build, start, answer and stop, and does it hold what an install must (the staged catalogs,
  nothing fetched from the registry)? A step that asserts feature behaviour belongs in e2e, and a
  rule belongs in a unit test. The one exception is the editor spec under `plumix dev`, which asks
  whether the installed project's dev module graph links, not whether the editor works.
- **A new smoke check is a new step in `smoke:scaffold`'s loop**, so every runtime gets it, never
  a new harness or a new job. The editor spec is a step of that loop that runs Playwright, with its
  report and traces uploaded by the same job.
- **It reads only what a consumer gets**: the tarballs and the scaffolded project, never the
  workspace's source. The editor spec is copied into the project and imports only what the project
  installed; the smoke adds `BlockRenderer` to the scaffolded theme first, because the scaffold's
  entry template renders no content.

### Test doubles

Use the real thing when it is fast and deterministic. Otherwise use a fake the owner provides. Stub
only a boundary Plumix doesn't own, and keep it narrow.

1. **Real.** Collaborators inside Plumix, and the in-memory database, are used as they are.
2. **Fake.** The package that owns an interface ships its fake in its test kit, and the fake has
   tests of its own beside it. The test kit is `plumix/test` for what another package's tests use,
   and the package's own `src/test/` for a fake only its own tests use. A runtime's slots pass the
   shared conformance suites (`plumix/test/conformance`), which is what keeps the fakes honest. Add
   a new fake there, as high up as every caller can use it.
3. **Stub.** Only a boundary outside Plumix: a third-party HTTP API, the clock, randomness, a
   platform global (`vi.stubGlobal`). A slot Plumix defines, like the `Mailer`, has a fake:
   `fakeMail` from `plumix/test`, which the dispatcher and RPC harnesses install as `h.mail`,
   records what was sent. Inject the dependency when the code doesn't take one yet: add the seam to
   the source.
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
- **One act per test.** The act is the one call whose behaviour the test names; arrange may call
  the public API to reach the starting state. A second act is a second test, or a row of `it.each`.
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
  any order. A test gives the same result on every OS a contributor develops on: it reads nothing
  only one OS has (`/proc`), and where the outcome depends on a host capability (which image
  encoders exist) it pins that capability (`Bun.Image.backend = "bun"`) or takes it through a seam.
- **A flaky test is a bug.** Unit tests never retry, and lint rejects a `test.retry` in a
  Vitest config. E2E retries twice on CI (the shared Playwright config), so a slow runner does not
  block a merge, and a test Playwright reports as flaky is fixed in the change that finds it. When
  its cause lies outside that change, open an issue and skip the test with `test.skip` and the
  issue number in its name; lint rejects a skip whose title names no issue. A skip for a platform
  that lacks what the test needs (`test.skipIf`, or a conformance case a capability rules out)
  names that capability.
- **Fast.** A unit test runs in milliseconds. Vitest's 5s timeout catches hangs, it is not a
  budget: a unit test over one second is profiled before merge
  ([`docs/agents/testing.md`](docs/agents/testing.md#a-slow-test)).
- **Expected values are written out.** No snapshot or screenshot baselines (`toMatchSnapshot`,
  `toMatchInlineSnapshot`, `toHaveScreenshot`): a reviewer reads the expected value in the test.
  The docs screenshots are docs assets, regenerated by `pnpm docs:screenshots`; the e2e job's diff
  of them is a gate that they were regenerated, not a test.
- **Translated output.** Unit tests resolve compiled catalogs to empty ones, so a test that asserts
  on translated text hands the committed `.po` in as a catalog
  ([ADR 0036](docs/adr/0036-a-mail-is-declared-by-name.md)).
- **A type contract is a unit test.** Assert it with `expectTypeOf` in the module's `*.test.ts`;
  the typecheck gate is what checks it, because the test files are in each package's program.
- **A performance property is a count**: the queries a call runs, the bytes a chunk ships. Assert
  the count, never elapsed time. Benchmarks and load tests are not tests: they run by hand against
  a deployed site, never in CI.
- **Coverage is tracked, not targeted.** No package sets a threshold. A test exists to check a
  behaviour, never to raise the number.
- **Seed with the fishery factories**, not raw writes, and reuse the shared helpers in
  `plumix/test` and `@plumix/core/test`. Put a new test in the suite that already covers the area.
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
- Would it fail if the behaviour it names broke? Break the rule in your head, or for real:
  `pnpm test:mutation` breaks the lines a branch changed, one at a time.
- Does its name state the behaviour, and do its assertions check that one behaviour?
- Is it straight-line, with literal expected values and no logic of its own?
- Did the change ship its tests with it? A change without its tests is incomplete.

### Mutation testing

`pnpm test:mutation` changes each line the branch changed in a small way (a condition flipped, an
operator swapped, a value emptied) and runs the unit tests that cover it. A change no test notices
is a survivor, and the summary lists each surviving line once
([ADR 0049](docs/adr/0049-mutation-testing-reviews-the-lines-a-branch-changed.md)). It is neither a
tier nor a gate: it asks a question of the unit tier, CI does not run it, and no score is a target.
Run it before asking for review, and when reviewing a branch.

Read a survivor as a question about the behaviour on its line:

- **Survived:** a test ran the line and still passed with it changed. If the change breaks
  something the issue, an ADR or the code's own comment promises, write the unit test that fails on
  it, asserting the behaviour, not the mutation. Check it by editing the line into the mutant by
  hand: the test fails, and passes again once the line is back.
- **No test runs:** the line is untested. Start with a test that reaches it.
- **Dismiss** a survivor only for a reason you can name: the change cannot be observed, or the only
  test that could catch it would assert an implementation detail. A behaviour an e2e spec or another
  package's suite already covers counts, since the run sees only the package's own unit tests. Say
  which and why where the review records it.

Never add an assertion only to kill a mutant, and never change production code to move a result.
A dismissal that keeps coming back is a rule for `tooling/stryker/arid.ts`, not a comment in
source.

### Timeouts

Override a timeout only as a last resort. Profile the slow test first and fix what the profile
shows. Keep an override only when the whole suite's timings call for it, not its single slowest
test. [`docs/agents/testing.md`](docs/agents/testing.md#a-slow-test) has the usual causes.
