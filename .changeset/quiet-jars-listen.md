---
"@plumix/core": minor
---

Runs Playwright with parallel workers on CI unless the suite shares a database.

`definePlumixE2EConfig` set `workers: 1` whenever `process.env.CI` was present. The only reason ever
written down is narrower than that: a playground drives one mutable D1, so its tests race across
workers and each would restore the baseline mid-run. `hasSharedDb` already says exactly that, and is
now the only thing that pins a suite. A suite that passes no `playground` — or `applyMigrations:
false`, which is how a playground says it builds its database per session — runs at Playwright's
default concurrency instead.

A downstream suite that turns out to need serial execution for some other reason should say so with
`workers: 1` in its own config, rather than inheriting it from the environment.
