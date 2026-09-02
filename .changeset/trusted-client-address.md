---
"plumix": minor
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Makes the client address a fact the runtime supplies rather than one core
guesses from a header. `invocation.clientAddress` lands on the app context as
`ctx.clientAddress`, so a plugin writing a rate limiter or a spam floor reads
one field whatever the site deploys on. Session-metadata capture and
`readVisitorMeta`'s per-visitor hashing both read it from there, and the two
header-parsing readers in core are gone: core never looks at
`cf-connecting-ip`, `x-forwarded-for` or any other proxy header again.

The Cloudflare adapter supplies `cf-connecting-ip`, the one forwarding header
its edge overwrites, so a Cloudflare site records exactly what it recorded
before. On a runtime that reports no address a session row stores none and
every such visitor shares one hashed bucket, rather than a visitor buying a
fresh bucket by setting a header of their own.

`createDispatcherHarness` from `plumix/test` gains a `clientAddress` option so
a test sets the fact directly instead of forging a header.
