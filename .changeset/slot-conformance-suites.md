---
"@plumix/core": minor
"plumix": minor
---

Adds four parameterised conformance suites at `plumix/test/conformance` — `describeKvContract`,
`describeObjectStorageContract`, `describeCacheContract` and `describeAssetsContract` — so an
implementation of a slot port can prove it satisfies the contract core relies on.

Each takes a factory that binds a fresh instance and registers one `describe` of cases. The kv suite
covers put/get/delete, overwrite, prefix filtering, `limit` as an upper bound, cursor resumption with
no key repeated, and TTL expiry. The object-storage suite covers every `ObjectBody` the port
advertises, `head`, range reads, list pagination by prefix and cursor, delete idempotence, `url`, and
`presignPut`. The cache suite covers a miss, a stored response, a tag purge that drops every tagged
response and nothing else, and the two rules a shared cache cannot bend: a non-GET request is not
stored, and a stored response never hands the next visitor the first one's `Set-Cookie`. The assets
suite covers the shell path a deep link resolves to, a file keeping its own content type rather than
the shell's HTML, and whichever not-found behaviour the layer declares.

A factory declares what its backend cannot do rather than the suite assuming: `minTtlSeconds` skips
the cases that would ask a store to beat its own floor — Workers KV rejects a TTL under a minute —
`advanceTime` is how a case reaches expiry without sleeping, and an assets layer says whether a path
it does not hold answers `404` — Workers Assets under the `not_found_handling: "none"` the scaffold
ships — or falls back to the shell, which is the `single-page-application` handling.

The in-memory `kv:` and `storage:` slots are the first callers and Cloudflare's `kv()`, `r2()` and
`edge()` are the second. The assets suite runs against the binding the Cloudflare adapter hands core,
in both of the not-found modes this repo deploys; Workers Assets is a platform binding rather than
code the adapter owns, so that run pins the exposure and the shape guard in front of it. Every suite
is also run against deliberately broken factories, so a passing run means something.

Their own subpath, not `plumix/test`: these modules import vitest, and a consumer who only uses the
Playwright half of the test surface must not have to install it.
