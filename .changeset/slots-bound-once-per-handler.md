---
"plumix": minor
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Binds every capability slot once per handler instead of once per request. The
`storage:`, `kv:`, `cache:` and `imageDelivery:` slots are connected against the
first invocation's `env` and the bound instances are reused for the handler's
life, which is the isolate-stability assumption binding validation and
`resolveEnvInput` already rely on. A slot author on a process runtime no longer
has to memoise a Redis client or an S3 signer by hand; the libsql adapter's
private client memo is gone for that reason.

The database keeps `connectRequest` as its only per-request seam. Its `connect`
is called once and reused when there is no hook or the hook returns `null`, so
D1's Sessions API still attaches a bookmark to every response.

`connect(env: unknown)` becomes `connect(env: PlumixEnv)` on every port, and
`RequestScopedDbArgs.env` with it, so a slot author augments one interface for
their runtime and reads it type-checked. `memoryKv()` and `memoryStorage()` bind
against nothing, so their `env` argument is now optional: a consumer whose
`PlumixEnv` is augmented can call `connect()` rather than synthesizing a bag to
stand a store up in a test. A database adapter that read the `request` argument
of `connect` must move that read to `connectRequest`, which is the argument that
is still per request. `requiredBindings` validation is unchanged.
