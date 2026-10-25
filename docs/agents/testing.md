# Testing

How the test suites run and where their shared helpers live. The rules for writing tests are in
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md#tests); this file is the reference behind them.

## The test kits

A consumer package imports its unit-test kit from `plumix/test`: `testSite`, which boots a whole site
for a test, calls any procedure through `site.actingAs(role | user).rpc` and moves its own clock
with `site.travel` and `site.freezeTime` (core reads time through `now()` from `plumix/support`),
the older harnesses
(`createRpcHarness`, the dispatcher), the fishery factories, `stubPluginRpc`, the block render
helpers, the `fakeFile`/`fakeImage` upload fakes, the mail kit: `fakeMail`, which both harnesses
and `testSite` install as `h.mail` and `site.mail`, and `renderMail`, and `fakeCdn`, which a test
hands the dispatcher harness as `cdn` to render, write and assert a page is no longer stored, and
which `testSite` always swaps in. `plumix/test/conformance` holds the contract suites a
runtime's slots pass. An e2e suite imports `test`, `expect` and its fixtures (`editor`, `mailbox`, `passkey`, `PNG_1X1`,
the shared `runtimeSpec`) from `plumix/test/playwright`.

## Admin test helpers

`packages/admin/test/` holds two helpers for the admin's Node unit tests. `labelText` in
`label-text.ts` resolves a `Label` to its text, for the `selectX(items, query, toText)` helpers,
with no Lingui instance. `lingui-macro-stub.ts` stands in for `@lingui/core/macro`, which
`vitest.config.ts` aliases to it because Vitest runs no Lingui Babel pass. A test that needs a
rendered admin screen, a manifest or an RPC answer is an e2e spec: it seeds them with
`mockManifest` and `mockRpc` from `e2e/support/rpc-mock.ts`, or with `page.route` for a failing
RPC.

## A slow test

Vitest's 5s default is there to catch hangs. `pnpm test:unit` pins turbo to `--concurrency=2`, so a
busy runner doesn't turn a fast test into a timeout (`turbo.json` has the reasoning). Profile before
reaching for an override, because an override often hides the real cause.

- **Setup takes longer than the test body.** Fix the setup. A 530-entry seed loop became one
  multi-row insert per table (#2162, 140ms → 28ms).
- **A lazy `import()` inside a test, where nothing depends on when the module evaluates.** Hoist it
  to a static import. That moves the cost into collection, where no per-test timeout applies.
  `cf-access.test.ts` was the only suite importing `plumix/test` with `await import()`. Hoisting it
  took that test's median from 546ms to 54ms and deleted a `{ timeout: 30_000 }` (#2184). Check
  first, though. Some suites import lazily _because_ load order is what they test. A suite that
  re-imports a module per test to reset its state breaks when the import is hoisted.
- **A hook can pay the cost.** Warm up in `beforeAll`. The budget moves to the hook, each test's 5s
  goes back to catching hangs, and the suite stops depending on which test runs first (#1880).
- **One slow test among fast ones.** Set a timeout on that test alone, and say in a comment what
  makes it slow (#1522).

Judge an override against the whole suite's timings, not its single slowest test. `@plumix/admin-editor`
once kept a package-wide `testTimeout: 15_000`: twenty-two of its tests peaked above 1000ms, and its
worst three (2386ms, 1591ms, 1509ms) came within 2.1 to 3.3 times the 5s default (#2184). In a band
that dense, a timeout on the worst test only makes the next one the worst: find what they share
instead. Timings move with the machine and the environment, so measure again before keeping an
override.

## Coverage

Every package with tests has coverage wired in (`pnpm exec vitest run --coverage`). The repo tracks
it but sets no thresholds.

## Mutation testing

`pnpm test:mutation` mutates the lines a branch changed against `origin/main` (`--base <ref>` picks
another) and prints one summary, also written to `.cache/mutation/summary.md`.
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md#mutation-testing) says what to do with each
surviving line; this is how the run works.

- **What runs.** Turbo runs each changed package's `test:mutation` task, one package at a time, after
  its `typecheck`. The task runs Stryker with `tooling/stryker/stryker.config.ts` over the
  package's own unit tests that import the changed file. An e2e spec, or a test in another package,
  never runs, so a behaviour only those cover shows up as a survivor. Every package with unit
  tests has the task, bar two runtime adapters. The Bun adapter's suite runs under `bun --bun`, and
  the Stryker runner is Node only. The Node adapter's suite calls `process.chdir`, which the worker
  threads the runner forces do not allow.
- **Cost.** In the benchmark behind ADR 0049, a one-line plugin change took 20 seconds and a
  thousand-line change to core took about 17 minutes. Turbo replays a package whose files and base
  have not changed, in no time.
- **What it skips.** The TypeScript checker drops a mutant that does not type-check.
  `tooling/stryker/arid.ts` drops mutants in code whose changes no useful test asserts: log calls,
  an error's message and details, an empty `?? ""` fallback, a `label` or `description`, a 404's
  debug hint, the test of a spread that adds a key only when it is defined, and code that runs when
  the module loads (the runner switches a mutant on too late for it, stryker-js#6144). Each rule
  has a test in `arid.test.ts`.
- **Exit codes.** `0` whether or not lines survived: it reports, it does not gate. `3` when Stryker
  failed, or ran no test for a mutant it says survived; the package's `.cache/mutation/stryker.log`
  says why. Results from a run that exits `3` say nothing.
- **Files in place.** Stryker rewrites the changed files while it runs. The task saves their exact
  bytes first and puts them back afterwards, and an interrupted run is undone by the next one, or
  by `pnpm test:mutation --restore`. Don't edit a package while its run is going, since the restore
  overwrites the edit.
- **Patched runner.** `@stryker-mutator/vitest-runner` 10.0.0 can't match Vitest 5's test names
  and reports every mutant survived, so `patches/` fixes the match (stryker-js#6210). The comment
  in `pnpm-workspace.yaml` says when to drop the patch.
