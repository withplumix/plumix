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

`packages/admin/test/rpc.ts` has `stubRpc`, which answers the real oRPC client at the fetch
boundary, so admin logic that calls the API is unit-tested in Node. The other files there
(`renderWithI18n`, `renderWithRouter`, `seedManifest`) render into or write a DOM. Only the files
on the `plumix/test-tier` pending list use them, and they leave with those files (#3035).

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
