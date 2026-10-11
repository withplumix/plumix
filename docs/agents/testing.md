# Testing

How the test suites run and where their shared helpers live. The rules for writing tests are in
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md#tests); this file is the reference behind them.

## The test kits

A consumer package imports its unit-test kit from `plumix/test`: the harnesses
(`createRpcHarness`, the dispatcher), the fishery factories, `stubPluginRpc`, the block render
helpers, and the `fakeFile`/`fakeImage` upload fakes. `plumix/test/conformance` holds the contract
suites a runtime's slots pass. An e2e suite imports `test`, `expect` and its fixtures (`PNG_1X1`,
the shared `runtimeSpec`) from `plumix/test/playwright`.

## Admin test helpers

`packages/admin/test/` has three shared helpers:

- `stubRpc` answers the real oRPC client at the fetch boundary.
- `seedManifest` writes the manifest payload the admin shell writes.
- `renderWithRouter` renders with a real memory-history router, so navigation lands on a URL.

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
  first, though. Some suites import lazily _because_ load order is what they test. The island
  runtime suites re-import per test after clearing `window.Plumix`, and hoisting breaks them.
- **A hook can pay the cost.** Warm up in `beforeAll`. The budget moves to the hook, each test's 5s
  goes back to catching hangs, and the suite stops depending on which test runs first (#1880).
- **One slow test among fast ones.** Set a timeout on that test alone, and say in a comment what
  makes it slow (#1522).

Judge an override against the whole suite's timings, not its single slowest test. When many tests
peak near the limit, a timeout on the worst one only makes the next one the worst: find what they
share instead. Timings move with the machine and the environment, so measure again before keeping
an override.

## Coverage

Every package with tests has coverage wired in (`pnpm exec vitest run --coverage`). The repo tracks
it but sets no thresholds.
