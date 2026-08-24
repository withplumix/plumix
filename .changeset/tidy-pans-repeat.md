---
"@plumix/core": patch
---

Worker-driven e2e suites can now start every attempt from the same
database. Import `test` from `plumix/test/playwright` instead of
`@playwright/test` and a worker-scoped fixture restores the playground D1
to its post-`globalSetup` baseline once per attempt — the cadence a retry
needs, since `.wrangler/state` is wiped once per suite run. Suites whose
playground has a shared D1 are also pinned to a single worker, which that
shared database always required.
