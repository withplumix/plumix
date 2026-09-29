# Testing

How the test suites run and where their shared helpers live. The rules for writing tests are in
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md#tests); this file is the reference behind them.

## The one test import

For a consumer package, `plumix/test` is the one test import in both tiers
([ADR 0021](../adr/0021-tests-run-in-node-or-in-a-real-browser.md)): harnesses, factories,
`stubPluginRpc`, the block render helpers, and the `fakeFile`/`fakeImage` upload fakes. Its
`browser` build exports the same names, and a Node-only one throws there with the fix.

## Admin test seams

Admin tests have three shared seams in `packages/admin/test/`: `stubRpc` (answers the real oRPC
client at the fetch boundary), `seedManifest` (writes the manifest payload the admin shell writes),
and `renderWithRouter` (a real memory-history router, so navigation lands on a URL).

## A slow test

Vitest's 5s default is a hang detector, and `pnpm test:unit` pins turbo to `--concurrency=2` so a
contended runner doesn't turn a fast test into a timeout (the reasoning is in `turbo.json`). Profile
before reaching for an override — often it is masking something:

- **Setup dominates the test body** → fix the setup. A 530-entry seed loop became one multi-row
  insert per table (#2162, 140ms → 28ms).
- **A lazy `import()` inside a test, where nothing depends on when the module evaluates** → hoist it
  to a static import, which moves the cost into collection where no per-test timeout applies.
  `cf-access.test.ts` was the only suite reaching for `plumix/test` with `await import()`; hoisting
  took that test's median from 546ms to 54ms and deleted a `{ timeout: 30_000 }` (#2184). Check the
  condition first: several suites import lazily _because_ load order is the thing under test — the
  island runtime ones re-import per test after clearing `window.Plumix`, and hoisting them breaks
  the test.
- **The cost can be paid from a hook** → `beforeAll` pre-warm. The budget moves to the hook, so each
  test's 5s goes back to being a hang detector and the suite stops depending on which test sorts
  first (#1880).
- **One outlier over a quiet field** → scope a per-test timeout and name the mechanism in a comment
  (#1522).

Judge an override against the **distribution**, not the single worst test. Under jsdom,
`@plumix/admin-editor` kept a package-wide `testTimeout: 15_000` because 22 of its tests peaked above
1000ms and its worst three — 2386ms, 1591ms, 1509ms — came within 2.1–3.3x of the 5s default
(#2184): a dense band, where scoping a timeout to the worst test only promotes the next one. In
Chromium its worst test is 419ms across three runs beside another suite and none passes 1000ms, so
the override is gone. A distribution moves with the environment; re-measure before keeping one.

## Coverage

Wired in every test-having package (`pnpm exec vitest run --coverage`). Tracked, not enforced; no thresholds.
