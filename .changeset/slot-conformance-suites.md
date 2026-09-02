---
"@plumix/core": minor
"plumix": minor
---

Adds four parameterised conformance suites at `plumix/test/conformance` — `describeKvContract`,
`describeObjectStorageContract`, `describeCacheContract` and `describeAssetsContract` — so an
implementation of a slot port can prove it satisfies the contract core relies on.

Each takes a factory that binds a fresh instance and registers one `describe` of cases. The kv suite
covers put/get/delete, overwrite, prefix filtering, `limit` as an upper bound, cursor resumption with
no key repeated, and TTL expiry. The object-storage suite covers stream, string and byte bodies,
`head`, range reads, list pagination by prefix and cursor, delete idempotence, `url`, and `presignPut`.
The cache suite covers a miss, a stored response, and a tag purge that drops every tagged response and
nothing else. The assets suite covers a served path and a 404.

A factory declares what its backend cannot do rather than the suite assuming: `minTtlSeconds` skips
the cases that would ask a store to beat its own floor — Workers KV rejects a TTL under a minute —
and `advanceTime` is how a case reaches expiry without sleeping. The in-memory `kv:` and `storage:`
slots are the first callers, and the suites themselves are tested against deliberately broken
factories, so a passing run means something.

Their own subpath, not `plumix/test`: these modules import vitest, and a consumer who only uses the
Playwright half of the test surface must not have to install it.
