# Testing

How the test suites run and where their shared helpers live. The rules for writing tests are in
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md#tests); this file is the reference behind them.

## The one test import

For a consumer package, `plumix/test` is the one test import in both tiers
([ADR 0021](../adr/0021-tests-run-in-node-or-in-a-real-browser.md)). It carries the test helpers,
the factories, `stubPluginRpc`, the block render helpers, and the `fakeFile`/`fakeImage` upload
fakes. Its `browser` build exports the same names, and a Node-only one throws there with the fix.

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

Judge an override against the whole suite's timings, not its single slowest test. Under jsdom,
`@plumix/admin-editor` kept a package-wide `testTimeout: 15_000`. Twenty-two of its tests peaked
above 1000ms, and its worst three (2386ms, 1591ms, 1509ms) came within 2.1 to 3.3 times the 5s
default (#2184). In a band that dense, a timeout on the worst test only makes the next one the
worst. In Chromium its worst test takes 419ms across three runs beside another suite, and none
passes 1000ms, so the override is gone. Timings move with the environment, so measure again before
keeping an override.

## Coverage

Every package with tests has coverage wired in (`pnpm exec vitest run --coverage`). The repo tracks
it but sets no thresholds.
