---
"@plumix/core": minor
---

Adds a `requireCapability(cap)` RPC middleware to `plumix/plugin`, composed after `authenticated` to gate a procedure on a single capability without hand-rolling `if (!ctx.auth.can(...)) throw errors.FORBIDDEN(...)`. Core's own settings, allowed-domains, api-tokens, mailer, and user procedures now use it. Because the middleware is composed before `.input()`, converted procedures now reject an unauthorized caller with `FORBIDDEN` even when their input also fails schema validation, rather than surfacing the validation error first. Removes the unused `requireCapability`/`CapabilityError` pair from `@plumix/core`'s rbac module, superseded by this middleware.
