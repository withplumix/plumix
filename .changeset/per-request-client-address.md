---
"plumix": minor
"@plumix/core": minor
---

Adds a per-request `clientAddress` to the dispatcher test harness, so one
harness can tell two visitors apart. `harness.fetch(path, { clientAddress })`
and `harness.dispatch(request, user, clientAddress)` override the harness-level
option, which stays the default for requests that name none.

The harness-level option alone could not express the property that matters for
a rate limiter or a spam floor: that two addresses land in different buckets.
Two harnesses cannot prove it either, since each mints its own per-install
hashing salt and their hashes are incomparable by construction.
