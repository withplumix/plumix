---
"@plumix/runtime-cloudflare": minor
---

Adds a `CF_Authorization` cookie fallback to `cfAccess()`, so an Access application covering only `/_plumix/admin` also authenticates the admin's RPC calls. `audience` now accepts a list of AUD tags, and the Access logout is advertised only to a sign-out request that carries an Access credential, so members chained through `defaultAuthenticator()` keep their own sign-out. Requires `plumix` 0.25.0 or later.
